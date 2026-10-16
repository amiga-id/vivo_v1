import re
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.sid import from_uuid, to_uuid
from app.models.account import Account, AccountRole
from app.models.client import (
    Client,
    ClientAssignment,
    RevisionHistory,
    Submission,
    UploadedFile,
)
from app.models.vendor import Vendor
from app.schemas.documents import (
    ClientAssignmentRequest,
    ClientResponse,
    RevisionHistoryEntry,
    SubmissionCreateRequest,
    SubmissionDecisionRequest,
    SubmissionInvoicesUpdateRequest,
    SubmissionResponse,
    UploadedFileData,
)
from app.schemas.response import ApiResponse
from app.services.audit import record_audit_event
from app.services.auth import current_account
from app.services.documents import (
    S3UploadError,
    UploadPersistenceError,
    create_submission,
    get_submission_response,
    retry_extraction,
    upload_pdf,
)
from app.services.voucher_workflow import save_approved_finance_signature

router = APIRouter(tags=["Documents"])


@router.get("/clients", response_model=ApiResponse[list[ClientResponse]])
async def list_clients(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    query = (
        select(Client.id, Vendor.name)
        .join(Vendor, Client.vendor_id == Vendor.id)
        .order_by(Vendor.name)
    )
    if current_user.role == AccountRole.SUPPORT:
        query = query.join(
            ClientAssignment,
            ClientAssignment.client_id == Client.id,
        ).where(ClientAssignment.support_id == current_user.id)
    elif not (current_user.is_admin or current_user.role == AccountRole.LEAD):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anda tidak memiliki izin untuk melihat daftar klien.",
        )

    clients = (await session.execute(query)).all()
    return ApiResponse(
        success=True,
        data=[
            ClientResponse(id=from_uuid(client_id), name=name)
            for client_id, name in clients
        ],
    )


@router.get(
    "/clients/assignments",
    response_model=ApiResponse[list[dict[str, str | list[str]]]],
)
async def list_client_assignments(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    if not (current_user.is_admin or current_user.role == AccountRole.LEAD):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Hanya Service Lead atau System Admin yang dapat "
                "mengelola penugasan klien."
            ),
        )
    rows = (
        await session.execute(
            select(ClientAssignment.support_id, ClientAssignment.client_id)
        )
    ).all()
    by_support: dict[str, list[str]] = {}
    for support_id, client_id in rows:
        by_support.setdefault(from_uuid(support_id), []).append(from_uuid(client_id))
    return ApiResponse(
        success=True,
        data=[
            {"support_id": support_id, "client_ids": client_ids}
            for support_id, client_ids in by_support.items()
        ],
    )


@router.put(
    "/clients/assignments/{support_id}",
    response_model=ApiResponse[dict[str, str | list[str]]],
)
async def update_client_assignments(
    support_id: str,
    request: ClientAssignmentRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    if not (current_user.is_admin or current_user.role == AccountRole.LEAD):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Hanya Service Lead atau System Admin yang dapat "
                "mengelola penugasan klien."
            ),
        )
    try:
        support_uuid = to_uuid(support_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID akun Intake Support tidak valid.",
        ) from exc
    support = await session.get(Account, support_uuid)
    if support is None or support.role != AccountRole.SUPPORT:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Akun Intake Support tidak ditemukan.",
        )
    try:
        client_ids = list(dict.fromkeys(to_uuid(item) for item in request.client_ids))
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID klien tidak valid.",
        ) from exc
    existing_ids = (
        set(
            (
                await session.scalars(
                    select(Client.id).where(Client.id.in_(client_ids))
                )
            ).all()
        )
        if client_ids
        else set()
    )
    if len(existing_ids) != len(client_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Satu atau lebih klien tidak ditemukan.",
        )
    previous_client_ids = set(
        (
            await session.scalars(
                select(ClientAssignment.client_id).where(
                    ClientAssignment.support_id == support.id
                )
            )
        ).all()
    )
    await session.execute(
        ClientAssignment.__table__.delete().where(
            ClientAssignment.support_id == support.id
        )
    )
    if client_ids:
        await session.execute(
            ClientAssignment.__table__.delete().where(
                ClientAssignment.client_id.in_(client_ids),
                ClientAssignment.support_id != support.id,
            )
        )
    changed_client_ids = previous_client_ids.symmetric_difference(set(client_ids))
    if changed_client_ids:
        changed_clients = (
            await session.execute(
                select(Client.id, Client.name).where(Client.id.in_(changed_client_ids))
            )
        ).all()
        client_names = {client_id: name for client_id, name in changed_clients}
        added_names = [
            client_names[client_id]
            for client_id in set(client_ids) - previous_client_ids
            if client_id in client_names
        ]
        removed_names = [
            client_names[client_id]
            for client_id in previous_client_ids - set(client_ids)
            if client_id in client_names
        ]
        details = []
        if added_names:
            details.append(f"Ditugaskan: {', '.join(added_names)}")
        if removed_names:
            details.append(f"Dilepas: {', '.join(removed_names)}")
        record_audit_event(
            session,
            current_user,
            entity_type="client_assignment",
            entity_id=support.id,
            entity_label=support.name,
            action="Penugasan klien diperbarui",
            detail="; ".join(details),
        )
    session.add_all(
        [
            ClientAssignment(support_id=support.id, client_id=client_id)
            for client_id in client_ids
        ]
    )
    removed_client_ids = previous_client_ids - set(client_ids)
    if removed_client_ids:
        await session.execute(
            Vendor.__table__.update()
            .where(
                Vendor.id.in_(
                    select(Client.vendor_id).where(
                        Client.id.in_(removed_client_ids),
                        Client.vendor_id.is_not(None),
                        Client.id.not_in(select(ClientAssignment.client_id)),
                    )
                ),
                Vendor.pic == support.name,
            )
            .values(pic="", updated_by=current_user.id)
        )
    if client_ids:
        await session.execute(
            Vendor.__table__.update()
            .where(
                Vendor.id.in_(
                    select(Client.vendor_id).where(
                        Client.id.in_(client_ids),
                        Client.vendor_id.is_not(None),
                    )
                )
            )
            .values(pic=support.name, updated_by=current_user.id)
        )
    await session.commit()
    return ApiResponse(
        success=True,
        data={
            "support_id": from_uuid(support.id),
            "client_ids": [from_uuid(client_id) for client_id in client_ids],
        },
    )


@router.post(
    "/documents/upload",
    response_model=ApiResponse[UploadedFileData],
    responses={503: {"model": ApiResponse[UploadedFileData]}},
)
async def upload_document_pdf(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
    file: Annotated[UploadFile, File()],
):
    if current_user.role != AccountRole.SUPPORT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya Intake Support yang dapat mengunggah dokumen.",
        )
    try:
        result, response_status = await upload_pdf(session, current_user, file)
    except OverflowError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except S3UploadError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gagal menyimpan PDF ke S3.",
        ) from exc
    except UploadPersistenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if response_status == 503:
        return JSONResponse(
            status_code=503,
            content=jsonable_encoder(
                {
                    "success": False,
                    "error": {
                        "code": 503,
                        "message": result.extraction_error,
                    },
                    "data": result,
                }
            ),
        )
    return ApiResponse(success=True, data=result)


@router.post(
    "/documents/upload/{upload_id}/retry",
    response_model=ApiResponse[UploadedFileData],
)
async def retry_document_extraction(
    upload_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    entry = await session.get(UploadedFile, to_uuid(upload_id))
    if entry is None:
        raise HTTPException(status_code=404, detail="File upload tidak ditemukan.")
    if entry.uploader_id != current_user.id:
        raise HTTPException(status_code=403, detail="File upload bukan milik Anda.")
    try:
        result = await retry_extraction(session, entry)
    except RuntimeError as exc:
        record_audit_event(
            session,
            current_user,
            entity_type="upload",
            entity_id=entry.id,
            entity_label=entry.file_name,
            action="Ekstraksi file dicoba ulang dan gagal",
            detail=entry.extraction_error,
        )
        await session.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    record_audit_event(
        session,
        current_user,
        entity_type="upload",
        entity_id=entry.id,
        entity_label=entry.file_name,
        action="Ekstraksi file dicoba ulang",
        detail=f"{result.invoice_count} invoice berhasil diekstrak.",
    )
    await session.commit()
    return ApiResponse(success=True, data=result)


@router.post(
    "/documents/submissions",
    status_code=status.HTTP_201_CREATED,
    response_model=ApiResponse[SubmissionResponse],
)
async def submit_documents(
    request: SubmissionCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    if current_user.role != AccountRole.SUPPORT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya Intake Support yang dapat mengirim pengajuan.",
        )
    try:
        result = await create_submission(session, current_user, request)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return ApiResponse(success=True, data=result)


@router.get(
    "/documents/submissions",
    response_model=ApiResponse[list[SubmissionResponse]],
)
async def list_submissions(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    query = select(Submission).order_by(Submission.created_at.desc())
    if current_user.role == AccountRole.SUPPORT:
        query = query.where(Submission.uploader_id == current_user.id)
    elif current_user.role == AccountRole.REVIEWER:
        query = query.where(Submission.reviewer_id == current_user.id)
    elif not (current_user.is_admin or current_user.role == AccountRole.LEAD):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anda tidak memiliki izin untuk melihat pengajuan.",
        )
    submissions = (await session.scalars(query)).all()
    return ApiResponse(
        success=True,
        data=[await get_submission_response(session, item) for item in submissions],
    )


@router.get(
    "/documents/submissions/{submission_id}",
    response_model=ApiResponse[SubmissionResponse],
)
async def get_submission(
    submission_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    submission = await session.get(Submission, to_uuid(submission_id))
    if submission is None:
        raise HTTPException(status_code=404, detail="Pengajuan tidak ditemukan.")
    if (
        submission.uploader_id != current_user.id
        and submission.reviewer_id != current_user.id
        and not current_user.is_admin
    ):
        raise HTTPException(
            status_code=403,
            detail="Pengajuan di luar cakupan akses Anda.",
        )
    return ApiResponse(
        success=True,
        data=await get_submission_response(session, submission),
    )


@router.get(
    "/documents/submissions/{submission_id}/revision-history",
    response_model=ApiResponse[list[RevisionHistoryEntry]],
)
async def get_submission_revision_history(
    submission_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    submission = await session.get(Submission, to_uuid(submission_id))
    if submission is None:
        raise HTTPException(status_code=404, detail="Pengajuan tidak ditemukan.")
    if (
        submission.uploader_id != current_user.id
        and submission.reviewer_id != current_user.id
        and not current_user.is_admin
    ):
        raise HTTPException(
            status_code=403,
            detail="Pengajuan di luar cakupan akses Anda.",
        )

    revision_ids = [submission.id]
    revision_id_set = {submission.id}
    parent_id = submission.revision_of_id
    while parent_id is not None:
        if parent_id in revision_id_set:
            break
        revision_ids.append(parent_id)
        revision_id_set.add(parent_id)
        parent = await session.get(Submission, parent_id)
        if parent is None:
            break
        parent_id = parent.revision_of_id

    descendants = [submission.id]
    while descendants:
        child_ids = list(
            (
                await session.scalars(
                    select(Submission.id).where(
                        Submission.revision_of_id.in_(descendants)
                    )
                )
            ).all()
        )
        descendants = [
            child_id for child_id in child_ids if child_id not in revision_id_set
        ]
        revision_ids.extend(descendants)
        revision_id_set.update(descendants)

    rows = (
        await session.execute(
            select(RevisionHistory, Submission.request_number, Submission.note)
            .join(Submission, Submission.id == RevisionHistory.submission_id)
            .where(RevisionHistory.submission_id.in_(revision_ids))
            .order_by(RevisionHistory.created_at, RevisionHistory.id)
        )
    ).all()
    return ApiResponse(
        success=True,
        data=[
            RevisionHistoryEntry(
                id=from_uuid(event.id),
                request_number=request_number,
                team=event.actor_role,
                actor_name=event.actor_name,
                action=event.action,
                detail=(
                    submission_note
                    if event.event_type == "intake_revision"
                    else event.detail
                ),
                created_at=event.created_at,
            )
            for event, request_number, submission_note in rows
        ],
    )


@router.post(
    "/documents/submissions/{submission_id}/decision",
    response_model=ApiResponse[SubmissionResponse],
)
async def decide_submission(
    submission_id: str,
    request: SubmissionDecisionRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    submission = await session.scalar(
        select(Submission)
        .where(Submission.id == to_uuid(submission_id))
        .with_for_update()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Pengajuan tidak ditemukan.")
    if (
        current_user.role != AccountRole.REVIEWER
        or submission.reviewer_id != current_user.id
        or submission.uploader_id == current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Pengajuan tidak ditugaskan kepada Anda sebagai reviewer.",
        )
    if submission.status != "Dalam Review":
        raise HTTPException(
            status_code=409,
            detail="Pengajuan ini sudah diputuskan.",
        )
    if request.decision in ("return", "reject") and not (request.reason or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Alasan wajib diisi untuk mengembalikan atau menolak pengajuan.",
        )
    if request.decision == "approve":
        await save_approved_finance_signature(session, submission, current_user)
    submission.status = {
        "approve": "Disetujui",
        "return": "Dikembalikan",
        "reject": "Ditolak",
    }[request.decision]
    if request.decision == "approve":
        request_suffix = re.sub(r"[^A-Za-z0-9]", "", submission.request_number)[-12:]
        submission.voucher_number = f"VCH-{request_suffix.upper()}"
    submission.decision_reason = request.reason
    record_audit_event(
        session,
        current_user,
        entity_type="submission",
        entity_id=submission.id,
        entity_label=submission.request_number,
        action={
            "approve": "Pengajuan disetujui",
            "return": "Pengajuan dikembalikan",
            "reject": "Pengajuan ditolak",
        }[request.decision],
        detail=(request.reason or "").strip() or None,
    )
    if request.decision == "return":
        session.add(
            RevisionHistory(
                submission_id=submission.id,
                actor_id=current_user.id,
                actor_name=current_user.name,
                actor_role="Financial",
                event_type="financial_return",
                action="Mengembalikan pengajuan untuk direvisi",
                detail=request.reason.strip() if request.reason else None,
            )
        )
    await session.commit()
    await session.refresh(submission)
    return ApiResponse(
        success=True,
        data=await get_submission_response(session, submission),
    )


@router.put(
    "/documents/submissions/{submission_id}/invoices",
    response_model=ApiResponse[SubmissionResponse],
)
async def update_submission_invoices(
    submission_id: str,
    request: SubmissionInvoicesUpdateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    submission = await session.scalar(
        select(Submission)
        .where(Submission.id == to_uuid(submission_id))
        .with_for_update()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Pengajuan tidak ditemukan.")
    if (
        current_user.role != AccountRole.REVIEWER
        or submission.reviewer_id != current_user.id
        or submission.uploader_id == current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Pengajuan tidak ditugaskan kepada Anda sebagai reviewer.",
        )
    if submission.status != "Dalam Review":
        raise HTTPException(
            status_code=409,
            detail="Hasil ekstraksi hanya dapat diedit selama Dalam Review.",
        )
    if not request.invoices:
        raise HTTPException(
            status_code=400,
            detail="Pengajuan harus memiliki minimal satu invoice.",
        )

    invoices = [invoice.model_dump() for invoice in request.invoices]
    submission.invoices = invoices
    submission.invoice_count = len(invoices)
    submission.grand_total = sum(invoice["total"] for invoice in invoices)
    record_audit_event(
        session,
        current_user,
        entity_type="submission",
        entity_id=submission.id,
        entity_label=submission.request_number,
        action="Data invoice dikoreksi",
        detail=f"{len(invoices)} invoice diperbarui oleh reviewer.",
    )
    await session.commit()
    await session.refresh(submission)
    return ApiResponse(
        success=True,
        data=await get_submission_response(session, submission),
    )
