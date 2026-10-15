from decimal import Decimal
from io import BytesIO

from pypdf import PdfWriter

from app.schemas.documents import ExtractedInvoice
from app.services import documents
from app.services.bedrock_service import (
    BedrockInvoiceService,
    BedrockSettings,
)


def test_bedrock_extracts_each_pdf_page_as_a_document():
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.add_blank_page(width=72, height=72)
    pdf = BytesIO()
    writer.write(pdf)
    sent_documents = []
    model_ids = []

    class FakeBedrock:
        def converse(self, **request):
            model_ids.append(request["modelId"])
            document = request["messages"][0]["content"][0]["document"]
            assert document["format"] == "pdf"
            sent_documents.append(document["source"]["bytes"])
            amount = "100" if len(sent_documents) == 1 else "110"
            confidence = 0.75 if len(sent_documents) == 1 else 0.96
            return {
                "stopReason": "tool_use",
                "output": {
                    "message": {
                        "content": [
                            {
                                "toolUse": {
                                    "name": "record_invoice",
                                    "input": {
                                        "is_invoice": True,
                                        "invoice_number": {
                                            "value": "INV-01",
                                            "confidence": 0.98,
                                        },
                                        "vendor_name": {
                                            "value": "PT Contoh",
                                            "confidence": 0.99,
                                        },
                                        "total_amount": {
                                            "value": amount,
                                            "confidence": confidence,
                                        },
                                    },
                                }
                            }
                        ]
                    }
                },
            }

    service = BedrockInvoiceService(
        settings=BedrockSettings(
            region="ap-southeast-1",
            model_id="amazon.nova-lite-v1:0",
        ),
        bedrock_client=FakeBedrock(),
    )

    result = service.extract_formatted_pdf(pdf.getvalue())

    assert len(sent_documents) == 2
    assert model_ids == ["apac.amazon.nova-lite-v1:0"] * 2
    assert all(page.startswith(b"%PDF") for page in sent_documents)
    assert result["page_count"] == 2
    assert result["invoice_count"] == 1
    assert result["invoices"][0]["pages"] == [1, 2]
    assert result["invoices"][0]["total"] == "110.00"
    assert result["invoices"][0]["confidence"]["total_amount"] == float(
        Decimal("0.9600")
    )


def test_nova_lite_model_id_resolves_to_active_apac_profile():
    settings = BedrockSettings(
        region="ap-southeast-1",
        model_id="amazon.nova-lite-v1:0",
    )

    assert settings.model_id == "apac.amazon.nova-lite-v1:0"


def test_explicit_inference_profile_id_is_preserved():
    settings = BedrockSettings(
        region="ap-southeast-1",
        model_id="apac.amazon.nova-lite-v1:0",
    )

    assert settings.model_id == "apac.amazon.nova-lite-v1:0"


def test_extract_s3_pdf_uses_bedrock_pdf_extractor(monkeypatch):
    calls = {}

    class FakeExtractor:
        def __init__(self, settings):
            calls["settings"] = settings

        def extract_s3_pdf(self, bucket, key):
            calls["source"] = (bucket, key)
            return {
                "is_invoice": True,
                "page_count": 2,
                "invoices": [
                    {
                        "invoice_number": "INV-01",
                        "date": "2026-10-15",
                        "vendor": "PT Contoh",
                        "vendor_tax_id": "01.234.567.8-901.000",
                        "subtotal": "1000.50",
                        "ppn": "110.06",
                        "total": "1110.56",
                        "confidence": {
                            "invoice_number": 0.98,
                            "invoice_date": 0.97,
                            "vendor_name": 0.96,
                            "vendor_tax_id": 0.95,
                            "subtotal": 0.95,
                            "tax_amount": 0.94,
                            "total_amount": 0.93,
                        },
                    }
                ],
            }

    monkeypatch.setattr(documents, "BedrockInvoiceService", FakeExtractor)

    page_count, result = documents._extract_s3_pdf("uploads/test/invoice.pdf")
    invoice = ExtractedInvoice.model_validate(result["invoices"][0])

    assert calls["source"] == (
        documents.settings.S3_BUCKET,
        "uploads/test/invoice.pdf",
    )
    assert calls["settings"].model_id == "apac.amazon.nova-lite-v1:0"
    assert page_count == 2
    assert result["is_invoice"] is True
    assert invoice.no == "INV-01"
    assert invoice.vendor == "PT Contoh"
    assert invoice.npwp == "01.234.567.8-901.000"
    assert invoice.dpp == 1000.5
    assert invoice.ppn == 110.06
    assert invoice.total == 1110.56
    assert invoice.confidence["no"] == 0.98
    assert invoice.confidence["npwp"] == 0.95
    assert invoice.confidence["total"] == 0.93
