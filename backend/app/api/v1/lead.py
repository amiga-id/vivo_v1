from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.db import get_db
from app.core.sid import from_uuid, to_uuid
from app.models.account import Account, AccountRole
from app.models.client import Client, Submission
from app.models.lead_audit import LeadAuditEvent
from app.schemas.lead import (
    LeadActionResponse,
    LeadAuditResponse,
    LeadReviewerResponse,
    LeadReviewerUpdateRequest,
    LeadSupportResponse,
    LeadWorkloadResponse,
    LeadWorkloadRow,
)
from app.schemas.response import ApiResponse
from app.services.auth import current_account
from app.services.audit import record_audit_event

router = APIRouter(prefix="/lead", tags=["Lead"])
OPEN_STATUSES = {"Dalam Review", "Dikembalikan", "Diproses"}


def require_lead(user: Account) -> None:
    if user.role != AccountRole.LEAD:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Fitur ini hanya dapat digunakan oleh Service Lead.",
        )


@router.get("/workload", response_model=ApiResponse[LeadWorkloadResponse])
async def get_workload(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    require_lead(current_user)
    reviewer = aliased(Account)
    uploader = aliased(Account)
    rows = (
        await session.execute(
            select(
                Submission.id,
                Submission.request_number,
                Client.name,
                Submission.kind,
                Submission.due_date,
                Submission.status,
                reviewer.id,
                reviewer.name,
                uploader.id,
                uploader.name,
            )
            .join(Client, Client.id == Submission.client_id)
            .join(reviewer, reviewer.id == Submission.reviewer_id)
            .join(uploader, uploader.id == Submission.uploader_id)
            .order_by(Submission.created_at.desc())
        )
    ).all()
    reviewers = (
        await session.execute(
            select(Account.id, Account.name)
            .where(Account.role == AccountRole.REVIEWER)
            .order_by(Account.name)
        )
    ).all()

    return ApiResponse(
        success=True,
        data=LeadWorkloadResponse(
            submissions=[
                LeadWorkloadRow(
                    id=from_uuid(row[0]),
                    request_number=row[1],
                    client_name=row[2],
                    kind=row[3],
                    due_date=row[4],
                    status=row[5],
                    reviewer_id=from_uuid(row[6]),
                    reviewer_name=row[7],
                    uploader_id=from_uuid(row[8]),
                    uploader_name=row[9],
                    conflict=row[6] == row[8],
                )
                for row in rows
            ],
            reviewers=[
                LeadReviewerResponse(id=from_uuid(account_id), name=name)
                for account_id, name in reviewers
            ],
        ),
    )


@router.patch(
    "/workload/{submission_id}/reviewer",
    response_model=ApiResponse[LeadActionResponse],
)
async def reassign_reviewer(
    submission_id: str,
    request: LeadReviewerUpdateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    require_lead(current_user)
    try:
        submission_uuid = to_uuid(submission_id)
        reviewer_uuid = to_uuid(request.reviewer_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ID pengajuan atau reviewer tidak valid.",
        ) from exc

    submission = await session.scalar(
        select(Submission)
        .where(Submission.id == submission_uuid)
        .with_for_update()
    )
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pengajuan tidak ditemukan.",
        )
    if submission.status not in OPEN_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pengajuan yang sudah selesai tidak dapat dialihkan.",
        )

    reviewer = await session.get(Account, reviewer_uuid)
    if reviewer is None or reviewer.role != AccountRole.REVIEWER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Penerima harus akun Finance.",
        )
    if reviewer.id == submission.uploader_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reviewer tidak boleh sama dengan pengunggah.",
        )
    if reviewer.id == submission.reviewer_id:
        return ApiResponse(
            success=True,
            data=LeadActionResponse(message="Reviewer tidak berubah."),
        )

    previous_reviewer = await session.get(Account, submission.reviewer_id)
    client = await session.get(Client, submission.client_id)
    previous_name = (
        previous_reviewer.name if previous_reviewer else "Reviewer sebelumnya"
    )
    client_name = client.name if client else "tidak diketahui"
    submission.reviewer_id = reviewer.id
    record_audit_event(
        session,
        current_user,
        entity_type="submission",
        entity_id=submission.id,
        entity_label=submission.request_number,
        action="Tugas dialihkan",
        detail=f"{previous_name} → {reviewer.name}; klien {client_name}.",
    )
    await session.commit()
    return ApiResponse(
        success=True,
        data=LeadActionResponse(
            message=f"Tugas {submission.request_number} dialihkan ke {reviewer.name}."
        ),
    )


@router.get("/support-accounts", response_model=ApiResponse[list[LeadSupportResponse]])
async def get_support_accounts(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    require_lead(current_user)
    rows = (
        await session.execute(
            select(Account.id, Account.name, Account.email)
            .where(Account.role == AccountRole.SUPPORT)
            .order_by(Account.name)
        )
    ).all()
    return ApiResponse(
        success=True,
        data=[
            LeadSupportResponse(
                id=from_uuid(account_id),
                name=name,
                email=email,
            )
            for account_id, name, email in rows
        ],
    )


@router.get("/audit", response_model=ApiResponse[list[LeadAuditResponse]])
async def get_lead_audit(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    require_lead(current_user)
    events = (
        await session.scalars(
            select(LeadAuditEvent).order_by(
                LeadAuditEvent.created_at.desc(),
                LeadAuditEvent.id.desc(),
            )
        )
    ).all()
    return ApiResponse(
        success=True,
        data=[
            LeadAuditResponse(
                id=from_uuid(event.id),
                entity_type=event.entity_type,
                entity_id=from_uuid(event.entity_id) if event.entity_id else None,
                entity_label=event.entity_label,
                actor_name=event.actor_name,
                action=event.action,
                detail=event.detail,
                created_at=event.created_at,
            )
            for event in events
        ],
    )
