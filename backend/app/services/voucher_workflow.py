from __future__ import annotations

import logging
import re
import uuid
from decimal import Decimal, InvalidOperation
from html import escape
from io import BytesIO
from typing import Any, BinaryIO

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status
from PIL import Image, UnidentifiedImageError
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image as PdfImage,
)
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.sid import from_uuid, to_uuid
from app.models.account import Account, AccountRole
from app.models.client import Client, Submission
from app.models.vendor import Vendor
from app.models.voucher import VoucherSignature, VoucherSigner
from app.schemas.voucher import (
    SignerRole,
    VoucherListItem,
    VoucherSignatureResponse,
    VoucherSignatureSelection,
    VoucherSignerOption,
    VoucherSignersResponse,
)

logger = logging.getLogger(__name__)

SIGNER_ROLES: tuple[SignerRole, ...] = ("finance",)
MAX_SIGNATURE_BYTES = 5 * 1024 * 1024
VOUCHER_URL_TTL = 3600
SAFE_IMAGE_FORMATS = {"PNG": "png", "JPEG": "jpg"}


def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
        config=Config(retries={"max_attempts": 4, "mode": "standard"}),
    )


def _require_voucher_role(user: Account) -> None:
    if (
        user.role
        not in (
            AccountRole.ADMIN,
            AccountRole.REVIEWER,
            AccountRole.SUPPORT,
        )
        and not user.is_admin
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Role Anda tidak memiliki akses ke voucher.",
        )


def _ensure_submission_access(user: Account, submission: Submission) -> None:
    _require_voucher_role(user)
    if user.is_admin:
        return
    if user.role == AccountRole.REVIEWER and submission.reviewer_id == user.id:
        return
    if user.role == AccountRole.SUPPORT and submission.uploader_id == user.id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Pengajuan berada di luar cakupan akses voucher Anda.",
    )


def _new_voucher_number(submission: Submission) -> str:
    request_suffix = re.sub(r"[^A-Za-z0-9]", "", submission.request_number)[-12:]
    return f"VCH-{request_suffix.upper()}"


async def save_approved_finance_signature(
    session: AsyncSession,
    submission: Submission,
    reviewer: Account,
) -> None:
    signer = await session.scalar(
        select(VoucherSigner).where(
            VoucherSigner.role == "finance",
            VoucherSigner.account_id == reviewer.id,
            VoucherSigner.is_active.is_(True),
        )
    )
    if signer is None:
        return

    signature = await session.scalar(
        select(VoucherSignature).where(
            VoucherSignature.submission_id == submission.id,
            VoucherSignature.role == "finance",
        )
    )
    if signature:
        signature.signer_id = signer.id
        signature.applied_by = reviewer.id
    else:
        session.add(
            VoucherSignature(
                submission_id=submission.id,
                role="finance",
                signer_id=signer.id,
                applied_by=reviewer.id,
            )
        )


async def _finance_signature_for_submission(
    session: AsyncSession,
    submission: Submission,
) -> VoucherSigner | None:
    approved_signature = await session.scalar(
        select(VoucherSigner)
        .join(
            VoucherSignature,
            VoucherSignature.signer_id == VoucherSigner.id,
        )
        .where(
            VoucherSignature.submission_id == submission.id,
            VoucherSignature.role == "finance",
            VoucherSigner.role == "finance",
            VoucherSigner.account_id == submission.reviewer_id,
            VoucherSigner.is_active.is_(True),
        )
    )
    if approved_signature:
        return approved_signature

    return await session.scalar(
        select(VoucherSigner).where(
            VoucherSigner.role == "finance",
            VoucherSigner.account_id == submission.reviewer_id,
            VoucherSigner.is_active.is_(True),
        )
    )


async def list_vouchers(
    session: AsyncSession,
    user: Account,
) -> list[VoucherListItem]:
    _require_voucher_role(user)
    query = (
        select(Submission, Client.name, Vendor.name)
        .join(Client, Client.id == Submission.client_id)
        .outerjoin(Vendor, Vendor.id == Client.vendor_id)
        .where(Submission.status == "Disetujui")
        .order_by(Submission.created_at.desc())
    )
    if user.role == AccountRole.SUPPORT:
        query = query.where(Submission.uploader_id == user.id)
    elif user.role == AccountRole.REVIEWER:
        query = query.where(Submission.reviewer_id == user.id)
    rows = (await session.execute(query)).all()
    signatures_by_submission: dict[str, dict[str, str]] = {}
    if rows:
        signature_rows = (
            await session.execute(
                select(
                    VoucherSignature.submission_id,
                    VoucherSignature.role,
                    VoucherSignature.signer_id,
                ).where(
                    VoucherSignature.submission_id.in_(
                        [submission.id for submission, _, _ in rows]
                    )
                )
            )
        ).all()
        signatures_by_submission = {
            from_uuid(submission_id): {} for submission_id, _, _ in signature_rows
        }
        for submission_id, role, signer_id in signature_rows:
            signatures_by_submission.setdefault(from_uuid(submission_id), {})[role] = (
                from_uuid(signer_id)
            )
    s3_client = get_s3_client()
    results = []
    for submission, client_name, vendor_name in rows:
        if not submission.voucher_number:
            submission.voucher_number = _new_voucher_number(submission)
        voucher_url = None
        if submission.voucher_s3_key:
            voucher_url = await run_in_threadpool(
                s3_client.generate_presigned_url,
                "get_object",
                Params={
                    "Bucket": settings.S3_BUCKET,
                    "Key": submission.voucher_s3_key,
                    "ResponseContentType": "application/pdf",
                    "ResponseContentDisposition": "inline",
                },
                ExpiresIn=VOUCHER_URL_TTL,
            )
        results.append(
            VoucherListItem(
                submission_id=from_uuid(submission.id),
                request_number=submission.request_number,
                voucher_number=submission.voucher_number,
                client_name=vendor_name or client_name,
                kind=submission.kind,
                status=submission.status,
                receive_date=submission.receive_date,
                grand_total=float(submission.grand_total),
                voucher_url=voucher_url,
                signature_ids=VoucherSignatureSelection(
                    **signatures_by_submission.get(from_uuid(submission.id), {})
                ),
                created_at=submission.created_at,
            )
        )
    if session.dirty:
        await session.commit()
    return results


async def list_voucher_signers(
    session: AsyncSession,
    user: Account,
) -> VoucherSignersResponse:
    if user.role != AccountRole.REVIEWER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya akun Finance yang dapat melihat tanda tangannya.",
        )
    query = (
        select(VoucherSigner, Account.name)
        .join(Account, Account.id == VoucherSigner.account_id)
        .where(
            VoucherSigner.role == "finance",
            VoucherSigner.account_id == user.id,
            VoucherSigner.is_active.is_(True),
        )
        .order_by(VoucherSigner.role, VoucherSigner.created_at.desc())
    )
    rows = (await session.execute(query)).all()
    groups: dict[str, list[VoucherSignerOption]] = {"finance": []}
    for signer, account_name in rows:
        groups[signer.role].append(
            VoucherSignerOption(
                id=from_uuid(signer.id),
                role=signer.role,
                name=signer.external_name or account_name or "Penandatangan",
                account_id=(
                    from_uuid(signer.account_id) if signer.account_id else None
                ),
            )
        )
    return VoucherSignersResponse(**groups)


def _signature_format(file: BinaryIO) -> tuple[bytes, str, str]:
    image_bytes = file.read(MAX_SIGNATURE_BYTES + 1)
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File tanda tangan kosong.",
        )
    if len(image_bytes) > MAX_SIGNATURE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Ukuran file tanda tangan maksimal 5 MiB.",
        )
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image_format = image.format
            image.verify()
    except (
        Image.DecompressionBombError,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File tanda tangan harus berupa gambar PNG atau JPEG yang valid.",
        ) from exc
    extension = SAFE_IMAGE_FORMATS.get(image_format or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format tanda tangan yang didukung hanya PNG atau JPEG.",
        )
    return image_bytes, extension, f"image/{'jpeg' if extension == 'jpg' else 'png'}"


async def register_voucher_signature(
    session: AsyncSession,
    user: Account,
    file: BinaryIO,
    created_by: Account | None = None,
) -> VoucherSignatureResponse:
    role_by_account_role = {
        AccountRole.SUPPORT: "support",
        AccountRole.REVIEWER: "finance",
        AccountRole.LEAD: "lead",
        AccountRole.ADMIN: "admin",
        AccountRole.SYSTEM: "admin",
    }
    role = role_by_account_role.get(user.role)
    if role is None:
        raise HTTPException(
            status_code=403,
            detail="Role akun tidak dapat mendaftarkan tanda tangan.",
        )
    account_id = user.id

    image_bytes, extension, content_type = _signature_format(file)
    signer_role: SignerRole = role
    existing_query = select(VoucherSigner).where(
        VoucherSigner.role == signer_role,
    )
    existing_query = existing_query.where(VoucherSigner.account_id == account_id)
    existing = await session.scalar(existing_query)
    signer_id = existing.id if existing else uuid.uuid4()
    key = f"voucher-signatures/{signer_role}/{signer_id}/{uuid.uuid4()}.{extension}"
    s3_client = get_s3_client()
    try:
        await run_in_threadpool(
            s3_client.put_object,
            Bucket=settings.S3_BUCKET,
            Key=key,
            Body=image_bytes,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )
        if existing:
            old_key = existing.s3_key
            existing.s3_key = key
            existing.content_type = content_type
            existing.created_by = (created_by or user).id
            existing.is_active = True
            signer = existing
        else:
            old_key = None
            signer = VoucherSigner(
                id=signer_id,
                role=signer_role,
                account_id=account_id,
                s3_key=key,
                content_type=content_type,
                created_by=(created_by or user).id,
            )
            session.add(signer)
        await session.commit()
        await session.refresh(signer)
    except Exception:
        await session.rollback()
        try:
            await run_in_threadpool(
                s3_client.delete_object,
                Bucket=settings.S3_BUCKET,
                Key=key,
            )
        except BotoCoreError, ClientError:
            logger.exception("Could not clean up unregistered signature %s", key)
        raise

    if old_key and old_key != key:
        try:
            await run_in_threadpool(
                s3_client.delete_object,
                Bucket=settings.S3_BUCKET,
                Key=old_key,
            )
        except BotoCoreError, ClientError:
            logger.exception("Could not clean up replaced signature %s", old_key)

    return VoucherSignatureResponse(
        id=from_uuid(signer.id),
        role=signer_role,
        name=signer.external_name or user.name,
        account_id=from_uuid(signer.account_id) if signer.account_id else None,
        content_type=signer.content_type,
        created_at=signer.created_at,
    )


def _number(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except InvalidOperation, ValueError:
        return Decimal("0")


def _format_amount(value: Decimal) -> str:
    return f"Rp {value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def _build_voucher_page(
    submission: Submission,
    client_name: str,
    uploader_name: str,
    reviewer_name: str,
    signers: dict[str, tuple[str, bytes] | None],
) -> bytes:
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="VoucherCell",
            parent=styles["BodyText"],
            fontSize=8,
            leading=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="VoucherHeader",
            parent=styles["BodyText"],
            alignment=TA_CENTER,
            fontSize=8,
            leading=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="VoucherTitle",
            parent=styles["Title"],
            alignment=TA_CENTER,
            fontSize=15,
            leading=18,
        )
    )

    def cell(value: Any, *, header: bool = False) -> Paragraph:
        text_value = "-" if value is None or value == "" else str(value)
        style = styles["VoucherHeader"] if header else styles["VoucherCell"]
        return Paragraph(escape(text_value), style)

    invoices = submission.invoices or []
    dpp = sum((_number(invoice.get("dpp")) for invoice in invoices), Decimal(0))
    tax_rows = []
    tax_added = Decimal(0)
    tax_withheld = Decimal(0)
    for tax in submission.tax or []:
        label = str(tax.get("label") or "Pajak")
        rate = _number(tax.get("rate"))
        amount = (dpp * rate / Decimal(100)).quantize(Decimal("0.01"))
        kind = str(tax.get("kind") or "withhold")
        if kind == "add":
            tax_added += amount
            sign = "+"
            description = "ditambahkan"
        else:
            tax_withheld += amount
            sign = "-"
            description = "dipotong"
        tax_rows.append(
            [
                cell(""),
                cell(""),
                cell(f"{label} ({description})"),
                cell(f"{rate}%"),
                cell(f"{sign} {_format_amount(amount)}"),
            ]
        )
    grand_total = dpp + tax_added - tax_withheld
    dates = [str(item.get("tgl")) for item in invoices if item.get("tgl")]
    invoice_numbers = [str(item.get("no")) for item in invoices if item.get("no")]
    vendor_names = list(
        dict.fromkeys(
            str(item.get("vendor")) for item in invoices if item.get("vendor")
        )
    )
    period = " - ".join(sorted(dates)) if dates else submission.receive_date.isoformat()

    voucher_rows = [
        [
            cell("No", header=True),
            cell("Tanggal", header=True),
            cell("Keterangan", header=True),
            cell("Jumlah", header=True),
            cell("Harga", header=True),
        ]
    ]
    for number, invoice in enumerate(invoices, start=1):
        voucher_rows.append(
            [
                cell(number),
                cell(invoice.get("tgl")),
                cell(
                    " · ".join(
                        value
                        for value in (
                            str(invoice.get("vendor") or ""),
                            str(invoice.get("no") or ""),
                        )
                        if value
                    )
                    or "Invoice"
                ),
                cell("1"),
                cell(_format_amount(_number(invoice.get("dpp")))),
            ]
        )
    if not invoices:
        voucher_rows.append(
            [
                cell("1"),
                cell(submission.receive_date.isoformat()),
                cell("Sesuai pengajuan"),
                cell("1"),
                cell(_format_amount(dpp)),
            ]
        )
    voucher_rows.extend(tax_rows)
    voucher_rows.append(
        [
            cell(""),
            cell(""),
            cell("Total yang dibayarkan", header=True),
            cell(""),
            cell(_format_amount(grand_total), header=True),
        ]
    )

    detail_table = Table(
        voucher_rows,
        colWidths=[14 * mm, 28 * mm, 105 * mm, 24 * mm, 45 * mm],
        repeatRows=1,
    )
    detail_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#D8E8E6")),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E9F1F0")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#8B9997")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (1, -1), "CENTER"),
                ("ALIGN", (3, 0), (4, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )

    metadata = [
        [
            cell("Nomor voucher"),
            cell(submission.voucher_number),
            cell("Nomor pengajuan"),
            cell(submission.request_number),
        ],
        [
            cell("Perusahaan"),
            cell(client_name),
            cell("Nama vendor"),
            cell(", ".join(vendor_names) or "-"),
        ],
        [
            cell("Tanggal/periode"),
            cell(period),
            cell("Diajukan oleh"),
            cell(uploader_name),
        ],
        [
            cell("Nomor invoice"),
            cell(", ".join(invoice_numbers) or "-"),
            cell("Diperiksa Finance"),
            cell(reviewer_name),
        ],
    ]
    metadata_table = Table(metadata, colWidths=[35 * mm, 85 * mm, 35 * mm, 61 * mm])
    metadata_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#8B9997")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F0F4F3")),
                ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#F0F4F3")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )

    signature_table_rows = []
    signature_titles = []
    signature_images = []
    signature_names = []
    for role, title in (
        ("finance", "Ditinjau dan ditandatangani · Finance"),
        ("bod", "Persetujuan · BOD (tanda tangan manual)"),
    ):
        signature = signers.get(role) if role == "finance" else None
        signature_titles.append(cell(title, header=True))
        if signature:
            signature_names.append(cell(signature[0], header=True))
            signature_images.append(
                PdfImage(
                    BytesIO(signature[1]),
                    width=34 * mm,
                    height=16 * mm,
                    kind="proportional",
                )
            )
        else:
            signature_names.append(cell("Belum ditandatangani", header=True))
            signature_images.append(cell(""))
    signature_table_rows.extend([signature_titles, signature_images, signature_names])
    signature_table = Table(
        signature_table_rows,
        colWidths=[108 * mm, 108 * mm],
        rowHeights=[8 * mm, 22 * mm, 8 * mm],
    )
    signature_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#8B9997")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#D8E8E6")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=10 * mm,
        leftMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
        title=f"Voucher {submission.voucher_number}",
    )
    document.build(
        [
            Paragraph("Voucher Pengeluaran", styles["VoucherTitle"]),
            Spacer(1, 5 * mm),
            metadata_table,
            Spacer(1, 5 * mm),
            detail_table,
            Spacer(1, 10 * mm),
            KeepTogether([signature_table]),
        ]
    )
    return buffer.getvalue()


def _combine_with_source_pdfs(voucher_pdf: bytes, source_pdfs: list[bytes]) -> bytes:
    writer = PdfWriter()
    try:
        writer.append_pages_from_reader(PdfReader(BytesIO(voucher_pdf)))
        for source_pdf in source_pdfs:
            reader = PdfReader(BytesIO(source_pdf))
            if reader.is_encrypted:
                raise ValueError("PDF sumber terenkripsi dan tidak dapat digabung.")
            writer.append_pages_from_reader(reader)
        output = BytesIO()
        writer.write(output)
    except (PdfReadError, ValueError, OSError) as exc:
        raise ValueError(f"Gagal menggabungkan PDF voucher: {exc}") from exc
    return output.getvalue()


async def generate_voucher(
    session: AsyncSession,
    user: Account,
    submission_id: str,
) -> tuple[str, str]:
    if not (user.is_admin or user.role == AccountRole.REVIEWER):
        raise HTTPException(
            status_code=403,
            detail="Hanya Admin atau Finance yang dapat membuat voucher.",
        )
    try:
        submission_uuid = to_uuid(submission_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail="ID pengajuan tidak valid.",
        ) from exc
    submission = await session.scalar(
        select(Submission).where(Submission.id == submission_uuid).with_for_update()
    )
    if submission is None:
        raise HTTPException(status_code=404, detail="Pengajuan tidak ditemukan.")
    _ensure_submission_access(user, submission)
    if submission.status != "Disetujui":
        raise HTTPException(
            status_code=409,
            detail="Voucher hanya dapat dibuat setelah pengajuan disetujui.",
        )
    if not submission.voucher_number:
        submission.voucher_number = _new_voucher_number(submission)

    finance_signer = await _finance_signature_for_submission(session, submission)
    if finance_signer is None:
        raise HTTPException(
            status_code=409,
            detail="Tanda tangan Finance untuk reviewer pengaju belum terdaftar.",
        )
    selected: dict[str, VoucherSigner] = {"finance": finance_signer}

    for role in SIGNER_ROLES:
        existing = await session.scalar(
            select(VoucherSignature).where(
                VoucherSignature.submission_id == submission.id,
                VoucherSignature.role == role,
            )
        )
        signer = selected.get(role)
        if existing and signer:
            existing.signer_id = signer.id
            existing.applied_by = user.id
        elif existing:
            await session.delete(existing)
        elif signer:
            session.add(
                VoucherSignature(
                    submission_id=submission.id,
                    role=role,
                    signer_id=signer.id,
                    applied_by=user.id,
                )
            )

    client = await session.get(Client, submission.client_id)
    vendor = (
        await session.get(Vendor, client.vendor_id)
        if client and client.vendor_id
        else None
    )
    uploader = await session.get(Account, submission.uploader_id)
    reviewer = await session.get(Account, submission.reviewer_id)
    image_signers: dict[str, tuple[str, bytes] | None] = {
        role: None for role in SIGNER_ROLES
    }
    s3_client = get_s3_client()
    try:
        for role, signer in selected.items():
            response = await run_in_threadpool(
                s3_client.get_object,
                Bucket=settings.S3_BUCKET,
                Key=signer.s3_key,
            )
            body = response["Body"]
            try:
                image = await run_in_threadpool(body.read)
            finally:
                body.close()
            signer_account = (
                await session.get(Account, signer.account_id)
                if signer.account_id
                else None
            )
            image_signers[role] = (
                signer.external_name
                or (signer_account.name if signer_account else "Penandatangan"),
                image,
            )

        source_pdfs = []
        for file_entry in submission.files or []:
            response = await run_in_threadpool(
                s3_client.get_object,
                Bucket=settings.S3_BUCKET,
                Key=file_entry["s3_key"],
            )
            body = response["Body"]
            try:
                source_pdfs.append(await run_in_threadpool(body.read))
            finally:
                body.close()

        base_pdf = await run_in_threadpool(
            _build_voucher_page,
            submission,
            vendor.name if vendor else (client.name if client else ""),
            uploader.name if uploader else "",
            reviewer.name if reviewer else "",
            image_signers,
        )
        combined_pdf = await run_in_threadpool(
            _combine_with_source_pdfs,
            base_pdf,
            source_pdfs,
        )
        key = f"vouchers/{from_uuid(submission.id)}/voucher.pdf"
        await run_in_threadpool(
            s3_client.put_object,
            Bucket=settings.S3_BUCKET,
            Key=key,
            Body=combined_pdf,
            ContentType="application/pdf",
            ServerSideEncryption="AES256",
        )
        submission.voucher_s3_key = key
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc
    except (ClientError, BotoCoreError) as exc:
        await session.rollback()
        logger.exception(
            "Could not generate or store voucher for submission %s",
            submission.request_number,
        )
        raise HTTPException(
            status_code=502,
            detail="Gagal mengambil dokumen atau menyimpan voucher ke S3.",
        ) from exc
    except Exception:
        await session.rollback()
        raise

    url = await run_in_threadpool(
        s3_client.generate_presigned_url,
        "get_object",
        Params={
            "Bucket": settings.S3_BUCKET,
            "Key": submission.voucher_s3_key,
            "ResponseContentType": "application/pdf",
            "ResponseContentDisposition": (
                f'inline; filename="{submission.voucher_number}.pdf"'
            ),
        },
        ExpiresIn=VOUCHER_URL_TTL,
    )
    return submission.voucher_number, url
