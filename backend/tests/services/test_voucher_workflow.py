from datetime import date
from decimal import Decimal
from io import BytesIO
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from PIL import Image
from pypdf import PdfReader, PdfWriter

from app.main import app
from app.models.account import Account, AccountRole
from app.models.client import Submission
from app.models.voucher import VoucherSignature, VoucherSigner
from app.services.auth import hash_password
from app.services.voucher_workflow import (
    _build_voucher_page,
    _combine_with_source_pdfs,
    _ensure_submission_access,
    _format_amount,
    _signature_format,
    generate_voucher,
    save_approved_finance_signature,
)


def test_voucher_routes_are_registered():
    paths = app.openapi()["paths"]

    assert "/api/v1/documents/vouchers" in paths
    assert "/api/v1/documents/vouchers/signers" in paths
    assert "/api/v1/documents/signatures/finance" in paths
    assert "/api/v1/documents/signatures/{role}" not in paths
    assert "/api/v1/documents/submissions/{submission_id}/voucher" in paths


def test_signature_format_accepts_png_and_normalizes_mime_type():
    image_buffer = BytesIO()
    Image.new("RGBA", (24, 12), (0, 0, 0, 0)).save(image_buffer, format="PNG")

    image_bytes, extension, content_type = _signature_format(
        BytesIO(image_buffer.getvalue())
    )

    assert image_bytes == image_buffer.getvalue()
    assert extension == "png"
    assert content_type == "image/png"


def test_signature_format_rejects_non_image_data():
    with pytest.raises(HTTPException) as error:
        _signature_format(BytesIO(b"not an image"))

    assert error.value.status_code == 400


def test_voucher_pdf_contains_voucher_and_source_document_pages():
    submission = Submission(
        request_number="REQ-ABC12345",
        client_id=uuid4(),
        kind="Pembayaran",
        receive_date=date(2026, 10, 16),
        uploader_id=uuid4(),
        reviewer_id=uuid4(),
        due_date=date(2026, 10, 20),
        files=[],
        invoices=[
            {
                "no": "INV-001",
                "tgl": "2026-10-16",
                "vendor": "Vendor Example",
                "dpp": 125000,
            }
        ],
        invoice_count=1,
        page_count=1,
        grand_total=125000,
        tax=[],
        voucher_number="VCH-ABC12345",
    )
    voucher_pdf = _build_voucher_page(
        submission,
        "Client Example",
        "Uploader",
        "Finance Reviewer",
        {"admin": None, "finance": None, "bod": None},
    )

    source_writer = PdfWriter()
    source_writer.add_blank_page(width=72, height=72)
    source_buffer = BytesIO()
    source_writer.write(source_buffer)
    combined_pdf = _combine_with_source_pdfs(
        voucher_pdf,
        [source_buffer.getvalue()],
    )

    assert len(PdfReader(BytesIO(voucher_pdf)).pages) == 1
    assert len(PdfReader(BytesIO(combined_pdf)).pages) == 2
    voucher_text = PdfReader(BytesIO(voucher_pdf)).pages[0].extract_text()
    assert "Ditinjau dan ditandatangani" in voucher_text
    assert "tanda tangan manual" in voucher_text
    assert "Admin" not in voucher_text


def test_format_amount_uses_indonesian_number_separators():

    assert _format_amount(Decimal("1234.5")) == "Rp 1.234,50"


@pytest.mark.asyncio
async def test_approval_records_the_reviewers_registered_finance_signature():
    reviewer_id = uuid4()
    signer = VoucherSigner(
        id=uuid4(),
        role="finance",
        account_id=reviewer_id,
        s3_key="voucher-signatures/finance/signature.png",
        content_type="image/png",
        created_by=reviewer_id,
    )
    submission = Submission(id=uuid4())
    reviewer = Account(id=reviewer_id)
    session = AsyncMock()
    session.scalar = AsyncMock(side_effect=[signer, None])
    session.add = Mock()

    await save_approved_finance_signature(session, submission, reviewer)

    added_signature = session.add.call_args.args[0]
    assert isinstance(added_signature, VoucherSignature)
    assert added_signature.submission_id == submission.id
    assert added_signature.role == "finance"
    assert added_signature.signer_id == signer.id
    assert added_signature.applied_by == reviewer.id


@pytest.mark.asyncio
async def test_approval_without_registered_finance_signature_does_not_create_one():
    session = AsyncMock()
    session.scalar = AsyncMock(return_value=None)

    await save_approved_finance_signature(
        session,
        Submission(id=uuid4()),
        Account(id=uuid4()),
    )

    session.add.assert_not_called()


def test_support_can_only_view_own_submission():
    support_id = uuid4()
    submission = Submission(
        request_number="REQ-ABC12345",
        client_id=uuid4(),
        kind="Pembayaran",
        receive_date=date(2026, 10, 16),
        uploader_id=support_id,
        reviewer_id=uuid4(),
        due_date=date(2026, 10, 20),
        files=[],
        invoices=[],
        invoice_count=0,
        page_count=0,
        grand_total=0,
        tax=[],
    )
    support = Account(
        id=support_id,
        name="Support",
        email="support@example.test",
        password_hash=hash_password("test-only-password"),
        role=AccountRole.SUPPORT,
    )

    _ensure_submission_access(support, submission)

    submission.uploader_id = uuid4()
    with pytest.raises(HTTPException) as error:
        _ensure_submission_access(support, submission)
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_support_cannot_generate_voucher():
    support = Account(
        id=uuid4(),
        name="Support",
        email="support@example.test",
        password_hash=hash_password("test-only-password"),
        role=AccountRole.SUPPORT,
    )

    with pytest.raises(HTTPException) as error:
        await generate_voucher(
            AsyncMock(),
            support,
            "not-used-after-role-check",
        )

    assert error.value.status_code == 403
