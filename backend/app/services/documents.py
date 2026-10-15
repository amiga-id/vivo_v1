import logging
import re
from datetime import date, timedelta
from typing import Any
from uuid import uuid4

import boto3
from fastapi import UploadFile
from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
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
    ExtractedInvoice,
    SubmissionCreateRequest,
    SubmissionFile,
    SubmissionResponse,
    UploadedFileData,
)
from app.services.bedrock_service import BedrockInvoiceService, BedrockSettings

MAX_UPLOAD_BYTES = 4_500_000
PRESIGNED_URL_TTL = 3600
logger = logging.getLogger(__name__)


class S3UploadError(Exception):
    pass


class UploadPersistenceError(Exception):
    pass


def get_s3_client():
    return boto3.client("s3", region_name=settings.AWS_REGION)


def _extract_s3_pdf(s3_key: str) -> tuple[int, dict[str, Any]]:
    extractor = BedrockInvoiceService(
        settings=BedrockSettings(
            region=settings.AWS_REGION,
            model_id=settings.AWS_BEDROCK_MODEL_ID,
        )
    )
    extraction = extractor.extract_s3_pdf(settings.S3_BUCKET, s3_key)
    invoices = []
    for item in extraction["invoices"]:
        confidence = item.get("confidence", {})
        invoices.append(
            {
                "no": item.get("invoice_number") or "",
                "tgl": item.get("date") or "",
                "vendor": item.get("vendor") or "",
                "npwp": item.get("vendor_tax_id") or "",
                "dpp": float(item["subtotal"] or 0),
                "ppn": float(item["ppn"] or 0),
                "total": float(item["total"] or 0),
                "rek": "",
                "confidence": {
                    "no": confidence.get("invoice_number", 0),
                    "tgl": confidence.get("invoice_date", 0),
                    "vendor": confidence.get("vendor_name", 0),
                    "npwp": confidence.get("vendor_tax_id", 0),
                    "dpp": confidence.get("subtotal", 0),
                    "ppn": confidence.get("tax_amount", 0),
                    "total": confidence.get("total_amount", 0),
                    "rek": 0,
                },
            }
        )
    return extraction["page_count"], {
        "is_invoice": extraction["is_invoice"],
        "invoices": invoices,
    }


def _presigned_url(s3_key: str) -> str:
    return get_s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": s3_key},
        ExpiresIn=PRESIGNED_URL_TTL,
    )


def _safe_file_name(value: str) -> str:
    name = value.replace("\\", "/").rsplit("/", 1)[-1]
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)[:200] or "document.pdf"


def _to_upload_data(entry: UploadedFile) -> UploadedFileData:
    invoices = [
        ExtractedInvoice.model_validate(item) for item in (entry.invoices or [])
    ]
    return UploadedFileData(
        upload_id=from_uuid(entry.id),
        is_invoice=bool(invoices),
        invoice_count=entry.invoice_count,
        page_count=entry.page_count or 0,
        grand_total=float(entry.grand_total or 0),
        invoices=invoices,
        file_name=entry.file_name,
        file_size=entry.file_size,
        s3_key=entry.s3_key,
        document_url=_presigned_url(entry.s3_key),
        document_url_expires_in=PRESIGNED_URL_TTL,
        extraction_status="done" if entry.extraction_status == "done" else "failed",
        extraction_error=entry.extraction_error,
    )


async def upload_pdf(
    session: AsyncSession, user: Account, upload: UploadFile
) -> tuple[UploadedFileData, int | None]:
    file_name = _safe_file_name(upload.filename or "")
    if (
        not file_name.lower().endswith(".pdf")
        or upload.content_type != "application/pdf"
    ):
        raise ValueError("File harus PDF dengan MIME type application/pdf.")

    data = await upload.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise OverflowError("Ukuran file melebihi batas 4.500.000 byte.")
    if not data.startswith(b"%PDF-"):
        raise ValueError("Isi file bukan PDF yang valid.")

    upload_id = uuid4()
    s3_key = f"uploads/{from_uuid(user.id)}/{upload_id}/{file_name}"
    s3_client = get_s3_client()
    try:
        await run_in_threadpool(
            s3_client.put_object,
            Bucket=settings.S3_BUCKET,
            Key=s3_key,
            Body=data,
            ContentType="application/pdf",
            ServerSideEncryption="AES256",
        )
    except Exception as exc:
        logger.exception("S3 PDF upload failed for key %s", s3_key)
        raise S3UploadError("Gagal menyimpan PDF ke S3.") from exc

    entry = UploadedFile(
        id=upload_id,
        uploader_id=user.id,
        file_name=file_name,
        file_size=len(data),
        s3_key=s3_key,
        extraction_status="pending",
    )
    session.add(entry)
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        try:
            await run_in_threadpool(
                s3_client.delete_object,
                Bucket=settings.S3_BUCKET,
                Key=s3_key,
            )
        except Exception:
            logger.exception("Could not remove orphaned S3 object %s", s3_key)
        logger.exception("Could not persist uploaded PDF metadata for key %s", s3_key)
        raise UploadPersistenceError(
            "Gagal menyimpan metadata upload ke database. "
            "Pastikan migrasi database sudah diterapkan."
        ) from exc
    await session.refresh(entry)

    try:
        page_count, extraction = await run_in_threadpool(_extract_s3_pdf, s3_key)
        invoices = [
            ExtractedInvoice.model_validate(item).model_dump()
            for item in extraction["invoices"]
        ]
    except (ValidationError, ValueError, KeyError) as exc:
        entry.extraction_status = "failed"
        entry.extraction_error = str(exc)
        await session.commit()
        await session.refresh(entry)
        return _to_upload_data(entry), 503
    except Exception:
        logger.exception("Bedrock invoice extraction failed for S3 key %s", s3_key)
        entry.extraction_status = "failed"
        entry.extraction_error = "Ekstraksi AI gagal. Silakan coba lagi."
        await session.commit()
        await session.refresh(entry)
        return _to_upload_data(entry), 503

    entry.page_count = page_count
    entry.invoices = invoices
    entry.invoice_count = len(invoices)
    entry.grand_total = sum(float(item["total"]) for item in invoices)
    entry.extraction_status = "done"
    entry.extraction_error = None
    try:
        await session.commit()
        await session.refresh(entry)
    except Exception as exc:
        await session.rollback()
        logger.exception("Could not persist extraction result for S3 key %s", s3_key)
        raise UploadPersistenceError(
            "PDF sudah tersimpan, tetapi hasil ekstraksi gagal disimpan ke database."
        ) from exc
    result = _to_upload_data(entry)
    if not extraction.get("is_invoice", bool(invoices)):
        result.is_invoice = False
    return result, 200


async def retry_extraction(
    session: AsyncSession, entry: UploadedFile
) -> UploadedFileData:
    try:
        page_count, extraction = await run_in_threadpool(_extract_s3_pdf, entry.s3_key)
        invoices = [
            ExtractedInvoice.model_validate(item).model_dump()
            for item in extraction["invoices"]
        ]
        entry.page_count = page_count
        entry.invoices = invoices
        entry.invoice_count = len(invoices)
        entry.grand_total = sum(float(item["total"]) for item in invoices)
        entry.extraction_status = "done"
        entry.extraction_error = None
        await session.commit()
        await session.refresh(entry)
        result = _to_upload_data(entry)
        result.is_invoice = bool(extraction.get("is_invoice", bool(invoices)))
        return result
    except Exception as exc:
        logger.exception(
            "Bedrock invoice extraction retry failed for S3 key %s", entry.s3_key
        )
        entry.extraction_status = "failed"
        entry.extraction_error = "Ekstraksi AI gagal. Silakan coba lagi."
        await session.commit()
        raise RuntimeError(entry.extraction_error) from exc


def _add_business_days(start: date, count: int) -> date:
    due_date = start
    added = 0
    while added < count:
        due_date += timedelta(days=1)
        if due_date.weekday() < 5:
            added += 1
    return due_date


async def create_submission(
    session: AsyncSession, user: Account, request: SubmissionCreateRequest
) -> SubmissionResponse:
    client_id = to_uuid(request.client_id)
    allowed_client = await session.scalar(
        select(ClientAssignment.id)
        .where(
            ClientAssignment.support_id == user.id,
            ClientAssignment.client_id == client_id,
        )
        .limit(1)
    )
    if not allowed_client:
        raise PermissionError("Klien ini belum ditugaskan kepada Anda.")

    revision_parent = None
    if request.revision_of_submission_id:
        revision_parent = await session.scalar(
            select(Submission)
            .where(
                Submission.id == to_uuid(request.revision_of_submission_id)
            )
            .with_for_update()
        )
        if revision_parent is None:
            raise LookupError("Pengajuan yang direvisi tidak ditemukan.")
        if revision_parent.uploader_id != user.id:
            raise PermissionError("Pengajuan revisi bukan milik Anda.")
        if revision_parent.status != "Dikembalikan":
            raise LookupError("Hanya pengajuan yang dikembalikan dapat direvisi.")
        if (
            revision_parent.client_id != client_id
            or revision_parent.kind != request.kind
        ):
            raise ValueError(
                "Revisi harus menggunakan klien dan jenis pengajuan yang sama."
            )
        existing_revision = await session.scalar(
            select(Submission.id)
            .where(Submission.revision_of_id == revision_parent.id)
            .limit(1)
        )
        if existing_revision is not None:
            raise LookupError("Pengajuan ini sudah memiliki revisi yang dikirim.")

    uploads = await session.scalars(
        select(UploadedFile)
        .where(
            UploadedFile.id.in_([to_uuid(item) for item in request.upload_ids]),
            UploadedFile.uploader_id == user.id,
            UploadedFile.submission_id.is_(None),
            UploadedFile.extraction_status == "done",
        )
        .with_for_update()
    )
    uploaded_files = uploads.all()
    if len(uploaded_files) != len(set(request.upload_ids)):
        raise ValueError(
            "Ada file yang belum selesai diekstrak atau tidak dapat digunakan."
        )
    if any(not item.invoice_count for item in uploaded_files):
        raise ValueError("File yang dikirim harus berisi minimal satu invoice.")

    reviewers = list(
        (
            await session.scalars(
                select(Account)
                .where(Account.role == AccountRole.REVIEWER)
                .order_by(Account.id)
            )
        ).all()
    )
    if not reviewers:
        raise LookupError("Belum ada Finance Reviewer aktif.")

    await session.execute(text("SELECT pg_advisory_xact_lock(7126041501)"))
    previous_count = await session.scalar(select(func.count(Submission.id))) or 0
    reviewer = reviewers[previous_count % len(reviewers)]
    client = await session.get(Client, client_id)
    if client is None or client.vendor_id is None:
        raise LookupError("Vendor klien tidak ditemukan.")

    files = [
        {
            "file_name": item.file_name,
            "file_size": item.file_size,
            "page_count": item.page_count or 0,
            "s3_key": item.s3_key,
            "extraction_status": item.extraction_status,
            "extraction_error": item.extraction_error,
        }
        for item in uploaded_files
    ]
    invoices = [invoice for item in uploaded_files for invoice in (item.invoices or [])]
    page_count = sum(item.page_count or 0 for item in uploaded_files)
    grand_total = sum(float(item.grand_total or 0) for item in uploaded_files)
    submission = Submission(
        request_number=f"REQ-{uuid4().hex[:8].upper()}",
        client_id=client.id,
        kind=request.kind,
        channel=request.channel,
        receive_date=request.receive_date,
        note=request.note,
        approvers=request.approvers,
        uploader_id=user.id,
        reviewer_id=reviewer.id,
        due_date=_add_business_days(request.receive_date, 3),
        status="Dalam Review",
        revision_of_id=revision_parent.id if revision_parent else None,
        files=files,
        invoices=invoices,
        invoice_count=len(invoices),
        page_count=page_count,
        grand_total=grand_total,
        tax=request.tax,
    )
    session.add(submission)
    await session.flush()
    if revision_parent:
        session.add(
            RevisionHistory(
                submission_id=submission.id,
                actor_id=user.id,
                actor_name=user.name,
                actor_role="Intake",
                event_type="intake_revision",
                action="Mengirimkan revisi untuk ditinjau",
                detail=request.note,
            )
        )
    for item in uploaded_files:
        item.submission_id = submission.id
    await session.commit()
    await session.refresh(submission)
    return await get_submission_response(session, submission)


async def get_submission_response(
    session: AsyncSession, submission: Submission
) -> SubmissionResponse:
    client = await session.get(Client, submission.client_id)
    vendor = (
        await session.get(Vendor, client.vendor_id)
        if client is not None and client.vendor_id is not None
        else None
    )
    files = []
    for item in submission.files:
        files.append(
            SubmissionFile(
                **item,
                document_url=_presigned_url(item["s3_key"]),
            )
        )
    return SubmissionResponse(
        id=from_uuid(submission.id),
        request_number=submission.request_number,
        client_id=from_uuid(submission.client_id),
        client_name=vendor.name if vendor else (client.name if client else ""),
        kind=submission.kind,
        channel=submission.channel,
        receive_date=submission.receive_date,
        note=submission.note,
        approvers=submission.approvers,
        uploader_id=from_uuid(submission.uploader_id),
        reviewer_id=from_uuid(submission.reviewer_id),
        due_date=submission.due_date,
        status=submission.status,
        decision_reason=submission.decision_reason,
        files=files,
        invoices=[
            ExtractedInvoice.model_validate(item) for item in submission.invoices
        ],
        invoice_count=submission.invoice_count,
        page_count=submission.page_count,
        grand_total=float(submission.grand_total),
        tax=submission.tax,
        created_at=submission.created_at,
    )
