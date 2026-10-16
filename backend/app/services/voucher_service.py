"""Format invoice extraction results for voucher review and reporting."""
from __future__ import annotations

from html import escape
from io import BytesIO
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Table,
    TableStyle,
)
from pypdf.errors import PdfReadError
from sqlalchemy.orm import Session


class VoucherWorkflowError(ValueError):
    """An invoice is not in a state that permits the requested voucher action."""


class VoucherService:
    HEADER_FIELDS = (
        "invoice_number",
        "vendor_name",
        "vendor_tax_id",
        "invoice_date",
        "due_date",
        "currency",
        "subtotal",
        "tax_amount",
        "total_amount",
    )

    @staticmethod
    def process_invoice(
        db: Session,
        invoice_id: int,
        robot_user_id: int,
        *,
        upload_service: Any,
    ) -> dict[str, Any]:
        try:
            from ..models.invoice import Invoice, InvoiceStatus, ExtractionStatus
            from ..models.user import Permission, User, has_permission
            from .bedrock_service import BedrockInvoiceService
        except ImportError:
            from models.invoice import Invoice, InvoiceStatus, ExtractionStatus
            from models.user import Permission, User, has_permission
            from services.bedrock_service import BedrockInvoiceService

        invoice = db.get(Invoice, invoice_id)
        if invoice is None:
            raise LookupError(f"Invoice {invoice_id} tidak ditemukan")
        if invoice.status not in (
            InvoiceStatus.UPLOADED,
            InvoiceStatus.NEEDS_ACTION,
            InvoiceStatus.PENDING_REVIEW,
        ):
            raise VoucherWorkflowError(
                f"Invoice berstatus {invoice.status.value}, tidak dapat diproses"
            )

        robot = db.get(User, robot_user_id)
        if (
            robot is None
            or not robot.is_active
            or not has_permission(robot.role, Permission.EXTRACT_VERIFY)
        ):
            raise PermissionError("Akun tidak berwenang memproses ekstraksi invoice")

        has_successful_extraction = any(
            extraction.status == ExtractionStatus.SUCCESS
            for extraction in invoice.extractions
        )
        if (
            invoice.status != InvoiceStatus.PENDING_REVIEW
            and not has_successful_extraction
        ):
            extraction = BedrockInvoiceService().process_invoice(
                db,
                invoice_id,
                robot.id,
            )
            if extraction.status != ExtractionStatus.SUCCESS:
                raise VoucherWorkflowError(
                    extraction.error_message or "Ekstraksi invoice gagal"
                )

        db.refresh(invoice)
        voucher_summary = VoucherService.format_invoice_record(invoice)
        report = {
            "invoice_count": 1,
            "page_count": invoice.page_count or 1,
            "invoices": [voucher_summary],
            "grand_total": voucher_summary["total"],
            "grand_total_currency": voucher_summary["currency"],
        }
        source_pdf = upload_service.download_pdf(
            invoice.s3_key,
            bucket=invoice.s3_bucket,
        )
        combined_pdf = VoucherService.create_combined_pdf(source_pdf, report)
        voucher_key = upload_service.upload_generated_pdf(
            pdf_bytes=combined_pdf,
            client_id=invoice.client_id,
            invoice_id=invoice.id,
            bucket=invoice.s3_bucket,
        )
        return {
            "invoice_id": invoice.id,
            "status": invoice.status.value,
            "voucher": voucher_summary,
            "source_pdf_download_url": upload_service.create_document_url(
                invoice.s3_key,
                bucket=invoice.s3_bucket,
            ),
            "voucher_pdf_download_url": upload_service.create_document_url(
                voucher_key,
                bucket=invoice.s3_bucket,
                download=True,
            ),
        }

    @staticmethod
    def format_invoice_record(invoice: Any) -> dict[str, Any]:
        def money(value: Any) -> Optional[str]:
            if value is None:
                return None
            return str(value)

        total = money(invoice.total_amount)
        return {
            "invoice_number": invoice.invoice_number,
            "date": (
                invoice.invoice_date.isoformat()
                if invoice.invoice_date is not None
                else None
            ),
            "vendor": invoice.vendor_name,
            "subtotal": money(invoice.subtotal),
            "ppn": money(invoice.tax_amount),
            "total": total,
            "currency": "Rp",
            "line_items": [
                {
                    "description": item.description,
                    "quantity": str(item.quantity) if item.quantity is not None else None,
                    "unit_price": money(item.unit_price),
                    "total": money(item.amount),
                }
                for item in invoice.line_items
            ],
            "pages": list(range(1, (invoice.page_count or 1) + 1)),
        }

    @staticmethod
    def get_invoice_for_download(
        db: Session,
        invoice_id: int,
        user_id: int,
    ) -> Any:
        try:
            from ..models.invoice import Invoice
            from ..models.user import Permission, User, has_permission
        except ImportError:
            from models.invoice import Invoice
            from models.user import Permission, User, has_permission

        user = db.get(User, user_id)
        if (
            user is None
            or not user.is_active
            or not has_permission(user.role, Permission.DOWNLOAD_VOUCHER)
        ):
            raise PermissionError("Akun tidak berwenang mengunduh voucher")

        invoice = db.get(Invoice, invoice_id)
        if invoice is None:
            raise LookupError(f"Invoice {invoice_id} tidak ditemukan")
        if user.client_id != invoice.client_id:
            raise PermissionError("Dokumen hanya dapat diunduh oleh klien pemilik invoice")
        return invoice

#     @staticmethod
#     def get_voucher_download_location(
#         db: Session,
#         invoice_id: int,
#         user_id: int,
#         *,
#         upload_service: Any,
#     ) -> tuple[str, str]:
#         from .upload_service import UploadError
#
#         invoice = VoucherService.get_invoice_for_download(
#             db,
#             invoice_id,
#             user_id,
#         )
#         key = upload_service.build_voucher_key(invoice.client_id, invoice.id)
#         try:
#             upload_service.ensure_pdf_exists(key, bucket=invoice.s3_bucket)
#         except UploadError as exc:
#             if exc.code == "NOT_FOUND":
#                 raise VoucherWorkflowError(
#                     "PDF voucher belum tersedia; proses invoice terlebih dahulu"
#                 ) from exc
#             raise
#         return (
#             invoice.s3_bucket,
#             key,
#         )

    @staticmethod
    def create_combined_pdf(
        original_pdf: bytes,
        invoice_report: dict[str, Any],
    ) -> bytes:
        """Create a voucher PDF followed by the original invoice as an attachment."""
        try:
            original_reader = PdfReader(BytesIO(original_pdf))
            if original_reader.is_encrypted or not original_reader.pages:
                raise ValueError("PDF sumber kosong atau terenkripsi")

            summary_buffer = BytesIO()
            document = SimpleDocTemplate(
                summary_buffer,
                pagesize=landscape(A4),
                rightMargin=10 * mm,
                leftMargin=10 * mm,
                topMargin=10 * mm,
                bottomMargin=10 * mm,
                title="Voucher Pengeluaran",
            )
            styles = getSampleStyleSheet()
            styles.add(ParagraphStyle(
                name="VoucherTitle",
                parent=styles["BodyText"],
                alignment=TA_CENTER,
                fontSize=11,
                leading=14,
            ))
            styles.add(ParagraphStyle(
                name="VoucherCell",
                parent=styles["BodyText"],
                fontSize=8,
                leading=10,
            ))
            styles.add(ParagraphStyle(
                name="VoucherHeader",
                parent=styles["BodyText"],
                alignment=TA_CENTER,
                fontSize=8,
                leading=10,
            ))

            def cell(value: Any, *, header: bool = False) -> Paragraph:
                text = "-" if value is None or value == "" else str(value)
                return Paragraph(
                    escape(text),
                    styles["VoucherHeader"] if header else styles["VoucherCell"],
                )

            def display_amount(currency: str, amount: Any) -> str:
                value = str(amount or "-")
                if value == "-" or value.startswith(currency):
                    return value
                return " ".join(part for part in (currency, value) if part)

            invoices = invoice_report.get("invoices", [])
            invoice_numbers = list(dict.fromkeys(
                str(invoice["invoice_number"])
                for invoice in invoices
                if invoice.get("invoice_number")
            ))
            vendors = list(dict.fromkeys(
                str(invoice["vendor"])
                for invoice in invoices
                if invoice.get("vendor")
            ))
            dates = list(dict.fromkeys(
                str(invoice["date"])
                for invoice in invoices
                if invoice.get("date")
            ))
            currencies = {
                str(invoice.get("currency") or "")
                for invoice in invoices
                if invoice.get("total") is not None
            }

            if len(currencies) <= 1:
                currency = next(iter(currencies), "")
                grand_total = invoice_report.get("grand_total")
                nominal = display_amount(currency, grand_total or "-")
            else:
                totals_by_currency: dict[str, Decimal] = {}
                for invoice in invoices:
                    total = invoice.get("total")
                    if total is None:
                        continue
                    currency = str(invoice.get("currency") or "")
                    try:
                        amount_text = str(total)
                        if currency and amount_text.startswith(currency):
                            amount_text = amount_text[len(currency):].strip()
                        amount_value = Decimal(
                            amount_text.replace(".", "").replace(",", ".")
                        )
                        totals_by_currency[currency] = (
                            totals_by_currency.get(currency, Decimal("0"))
                            + amount_value
                        )
                    except InvalidOperation:
                        totals_by_currency = {}
                        break
                nominal = "; ".join(
                    display_amount(
                        currency,
                        format(total, ",f")
                        .replace(",", "_")
                        .replace(".", ",")
                        .replace("_", ".")
                        .rstrip("0")
                        .rstrip(","),
                    )
                    for currency, total in totals_by_currency.items()
                ) or "; ".join(
                    display_amount(
                        str(invoice.get("currency") or ""),
                        invoice.get("total"),
                    )
                    for invoice in invoices
                    if invoice.get("total") is not None
                )

            period = " - ".join(dates) if dates else "-"
            company = ", ".join(vendors) if vendors else "-"
            number = ", ".join(invoice_numbers) if invoice_numbers else "-"
            voucher_rows = [
                [cell("Voucher pengeluaran", header=True), "", "", "", "", ""],
            ]
            for label, value in (
                ("Nomor", number),
                ("Nama", "-"),
                ("Perusahaan", company),
                ("Tanggal/Periode", period),
                ("Nominal", nominal),
            ):
                voucher_rows.append([cell(label), cell(value), "", "", "", ""])

            detail_header = len(voucher_rows)
            voucher_rows.append([
                cell("No", header=True),
                cell("Tanggal", header=True),
                cell("Keterangan", header=True),
                "",
                cell("Jumlah", header=True),
                cell("Harga", header=True),
            ])
            line_number = 0
            for invoice in invoices:
                line_items = invoice.get("line_items") or []
                invoice_reference = " / ".join(
                    str(value)
                    for value in (
                        invoice.get("vendor"),
                        invoice.get("invoice_number"),
                    )
                    if value
                )
                if not line_items:
                    line_items = [{
                        "description": invoice_reference or "Invoice",
                        "quantity": "1",
                        "total": invoice.get("total"),
                    }]
                for item in line_items:
                    line_number += 1
                    description = " - ".join(
                        value
                        for value in (
                            invoice_reference,
                            str(item.get("description") or ""),
                        )
                        if value
                    )
                    price = display_amount(
                        str(invoice.get("currency") or ""),
                        item.get("total"),
                    )
                    voucher_rows.append([
                        cell(line_number),
                        cell(invoice.get("date")),
                        cell(description or "-"),
                        "",
                        cell(item.get("quantity") or "1"),
                        cell(price),
                    ])
            total_row = len(voucher_rows)
            voucher_rows.append([
                cell("total", header=True),
                "",
                "",
                "",
                "",
                cell(nominal, header=True),
            ])
            signature_header = len(voucher_rows)
            voucher_rows.extend([
                [
                    cell("Diajukan oleh", header=True), "",
                    cell("Disetujui oleh", header=True), "",
                    cell("Disetujui oleh", header=True), "",
                ],
                ["", "", "", "", "", ""],
                [cell("Admin", header=True), "", cell("Finance", header=True), "",
                 cell("BOD", header=True), ""],
            ])
            signature_space = signature_header + 1
            signature_column_groups = ((0, 1), (2, 3), (4, 5))
            signature_column_width = 275 * mm / 6

            table_style = [
                ("SPAN", (0, 0), (-1, 0)),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#D0D0D0")),
                *[
                    ("SPAN", (1, row), (5, row))
                    for row in range(1, 6)
                ],
                *[
                    ("SPAN", (2, row), (3, row))
                    for row in range(detail_header, total_row)
                ],
                ("BACKGROUND", (0, detail_header), (-1, detail_header),
                 colors.HexColor("#B7B7B7")),
                ("BACKGROUND", (0, total_row), (-1, total_row),
                 colors.HexColor("#B7B7B7")),
                ("SPAN", (0, total_row), (4, total_row)),
                *[
                    ("SPAN", (start, signature_header), (end, signature_header))
                    for start, end in signature_column_groups
                ],
                *[
                    ("SPAN", (start, signature_header + 1),
                     (end, signature_header + 1))
                    for start, end in signature_column_groups
                ],
                *[
                    ("SPAN", (start, signature_space), (end, signature_space))
                    for start, end in signature_column_groups
                ],
                *[
                    ("ALIGN", (start, row), (end, row), "CENTER")
                    for start, end in signature_column_groups
                    for row in (signature_header, signature_header + 1)
                ],
                *[
                    ("LINEBELOW", (start, signature_space), (end, signature_space),
                     0.6, colors.HexColor("#666666"))
                    for start, end in signature_column_groups
                ],
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#666666")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, signature_space), (-1, signature_space), 32),
                ("BOTTOMPADDING", (0, signature_space), (-1, signature_space), 32),
            ]
            document.build([
                Table(
                    voucher_rows,
                    colWidths=[signature_column_width] * 6,
                    repeatRows=detail_header + 1,
                    style=TableStyle(table_style),
                )
            ])
            summary_reader = PdfReader(BytesIO(summary_buffer.getvalue()))
            writer = PdfWriter()
            writer.append_pages_from_reader(summary_reader)
            writer.append_pages_from_reader(original_reader)
            output = BytesIO()
            writer.write(output)
            return output.getvalue()
        except (PdfReadError, ValueError, OSError) as exc:
            raise ValueError(f"Gagal membuat PDF gabungan: {exc}") from exc

#     @staticmethod
#     def format_invoice_results(results: Sequence[Any]) -> dict[str, Any]:
#         groups: list[dict[str, Any]] = []
#         for page_number, result in enumerate(results, start=1):
#             fields = result.fields
#             vendor = str(fields["vendor_name"].value or "").strip()
#             vendor_key = vendor.casefold()
#             invoice_number = str(fields["invoice_number"].value or "").strip()
#             invoice_key = invoice_number.casefold()
#
#             matches = []
#             for group in groups:
#                 same_vendor = (
#                     vendor_key
#                     and group["vendor_key"]
#                     and vendor_key == group["vendor_key"]
#                 )
#                 same_number = (
#                     invoice_key
#                     and group["invoice_key"]
#                     and invoice_key == group["invoice_key"]
#                 )
#                 if same_vendor and same_number:
#                     matches = [group]
#                     break
#                 if invoice_key and same_number and (
#                     not vendor_key or not group["vendor_key"]
#                 ):
#                     matches.append(group)
#                 elif vendor_key and same_vendor and (
#                     not invoice_key or not group["invoice_key"]
#                 ):
#                     matches.append(group)
#                 elif not vendor_key and not invoice_key and group is groups[-1]:
#                     matches.append(group)
#
#             group = matches[0] if len(matches) == 1 else None
#             if group is None:
#                 group = {
#                     "vendor_key": vendor_key,
#                     "invoice_key": invoice_key,
#                     "field_candidates": {
#                         name: [] for name in VoucherService.HEADER_FIELDS
#                     },
#                     "line_items": [],
#                     "pages": [],
#                     "is_invoice": False,
#                 }
#                 groups.append(group)
#             elif not group["vendor_key"] and vendor_key:
#                 group["vendor_key"] = vendor_key
#             elif not group["invoice_key"] and invoice_key:
#                 group["invoice_key"] = invoice_key
#
#             group["pages"].append(page_number)
#             group["is_invoice"] = group["is_invoice"] or result.is_invoice
#             for name, field_value in fields.items():
#                 if field_value.value is not None:
#                     group["field_candidates"][name].append(field_value)
#             group["line_items"].extend(result.line_items)
#
#         invoices = []
#         totals = []
#         for group in groups:
#             if not group["is_invoice"]:
#                 continue
#
#             selected = {
#                 name: max(
#                     candidates,
#                     key=lambda field_value: (
#                         field_value.confidence
#                         if field_value.confidence is not None
#                         else Decimal("-1")
#                     ),
#                     default=None,
#                 )
#                 for name, candidates in group["field_candidates"].items()
#             }
#             def formatted_value(name: str) -> Optional[str]:
#                 field_value = selected[name]
#                 value = field_value.value if field_value else None
#                 if value is None:
#                     return None
#                 return value.isoformat() if isinstance(value, date) else str(value)
#
#             total_field = selected["total_amount"]
#             total = total_field.value if total_field else None
#             if total is not None:
#                 totals.append(total)
#
#             invoices.append({
#                 "invoice_number": formatted_value("invoice_number"),
#                 "date": formatted_value("invoice_date"),
#                 "vendor": formatted_value("vendor_name"),
#                 "subtotal": formatted_value("subtotal"),
#                 "ppn": formatted_value("tax_amount"),
#                 "total": formatted_value("total_amount"),
#                 "currency": "IDR",
#                 "line_items": [
#                     {
#                         "description": item.description,
#                         "quantity": (
#                             str(item.quantity) if item.quantity is not None else None
#                         ),
#                         "unit_price": (
#                             str(item.unit_price) if item.unit_price is not None else None
#                         ),
#                         "total": (
#                             str(item.amount) if item.amount is not None else None
#                         ),
#                     }
#                     for item in group["line_items"]
#                 ],
#                 "pages": group["pages"],
#             })
#
#         has_all_totals = bool(invoices) and all(
#             invoice["total"] is not None for invoice in invoices
#         )
#         return {
#             "is_invoice": bool(invoices),
#             "invoice_count": len(invoices),
#             "page_count": len(results),
#             "invoices": invoices,
#             "grand_total": (
#                 str(sum(totals, Decimal("0"))) if has_all_totals else None
#             ),
#             "grand_total_currency": "IDR" if has_all_totals else None,
#         }