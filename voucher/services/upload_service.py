"""
Layanan upload invoice PDF ke S3.

Alur:
  1. Otorisasi sesuai BRD:
       - PIC Klien       -> hanya untuk klien miliknya
       - Intake Support  -> hanya untuk klien yang didelegasikan (tabel delegations)
       - peran lain      -> ditolak
  2. Baca file utuh: hitung SHA-256 + ukuran, batasi ukuran, cek magic bytes %PDF
  3. Validasi PDF (tidak terenkripsi, jumlah halaman) dengan pypdf
  4. Tolak duplikat (klien + hash file)
  5. Upload file utuh ke S3 + enkripsi SSE
  6. Buat baris Invoice (status UPLOADED) + riwayat status
  7. Jika insert DB gagal, objek S3 dihapus (kompensasi)

Env:
  S3_BUCKET                 wajib
  S3_PREFIX                 default "invoices"
  S3_SSE                    default "AES256" (atau "aws:kms")
  S3_KMS_KEY_ID             opsional, dipakai jika S3_SSE=aws:kms
  UPLOAD_MAX_BYTES          default 4_500_000 (selaras batas dokumen Bedrock Converse)
  UPLOAD_MAX_PAGES          default 50
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from typing import TYPE_CHECKING, BinaryIO, Callable, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from pypdf import PdfReader
from pypdf.errors import PdfReadError

if TYPE_CHECKING:
    try:
        from ..models.invoice import Invoice
        from ..models.user import User
    except ImportError:
        from models.invoice import Invoice
        from models.user import User

logger = logging.getLogger(__name__)

MIB = 1024 * 1024
DOCUMENT_URL_EXPIRATION = 3600


# ───────────────────────── Error ─────────────────────────

class UploadError(Exception):
    """Kesalahan validasi upload (aman ditampilkan ke pengguna)."""
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class DuplicateInvoiceError(UploadError):
    def __init__(self, existing_invoice_id: int):
        super().__init__("DUPLICATE_FILE", f"File yang sama sudah diunggah (invoice ID {existing_invoice_id})")
        self.existing_invoice_id = existing_invoice_id


# ───────────────────────── Konfigurasi ─────────────────────────

@dataclass(frozen=True)
class UploadSettings:
    bucket: str
    prefix: str = "invoices"
    sse: str = "AES256"
    kms_key_id: Optional[str] = None
    max_bytes: int = 4_500_000
    max_pages: int = 50
    region: str = "ap-southeast-1"

    @classmethod
    def from_env(cls) -> "UploadSettings":
        bucket = os.getenv("S3_BUCKET") or os.getenv("AWS_BUCKET")
        if not bucket:
            raise RuntimeError("S3_BUCKET atau AWS_BUCKET belum diatur")
        return cls(
            bucket=bucket,
            prefix=os.getenv("S3_PREFIX", "invoices").strip("/"),
            sse=os.getenv("S3_SSE", "AES256"),
            kms_key_id=os.getenv("S3_KMS_KEY_ID") or None,
            max_bytes=int(os.getenv("UPLOAD_MAX_BYTES", 4_500_000)),
            max_pages=int(os.getenv("UPLOAD_MAX_PAGES", 50)),
            region=os.getenv("AWS_REGION"),
        )


@dataclass
class _Scanned:
    data: bytes
    size: int
    sha256: str


# ───────────────────────── Service ─────────────────────────

class InvoiceUploadService:
    def __init__(self, settings: Optional[UploadSettings] = None, s3_client=None,
                 enqueue_extraction: Optional[Callable[[int], None]] = None):
        """
        enqueue_extraction: callback menerima invoice_id, dipanggil setelah commit
        (mis. kirim pesan ke SQS / Celery) agar Robot Admin memulai ekstraksi.
        """
        self.settings = settings or UploadSettings.from_env()
        self.s3 = s3_client or boto3.client(
            "s3",
            config=Config(region_name=self.settings.region,
                          retries={"max_attempts": 5, "mode": "standard"}),
        )
        self.enqueue_extraction = enqueue_extraction

    # ───────── API utama ─────────

    def upload_pdf(self, *, file: BinaryIO, filename: str, client_id: int) -> dict:
        """Validate and store a PDF in S3 without requiring user or client records."""
        scanned = self._read_file(file)
        page_count = self._validate_pdf(scanned.data)
        key = self._build_upload_key(client_id)
        self._put_object(scanned, key)
        try:
            document_url = self.create_document_url(key)
        except UploadError:
            self._delete_object(key)
            raise
        return {
            "file_name": self._safe_filename(filename),
            "file_size": scanned.size,
            "page_count": page_count,
            "s3_key": key,
            "document_url": document_url,
            "document_url_expires_in": DOCUMENT_URL_EXPIRATION,
        }

    def create_document_url(
        self,
        key: str,
        *,
        bucket: Optional[str] = None,
        download: bool = False,
    ) -> str:
        """Create a short-lived URL that the frontend can use to display a PDF."""
        try:
            return self.s3.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": bucket or self.settings.bucket,
                    "Key": key,
                    "ResponseContentType": "application/pdf",
                    "ResponseContentDisposition": (
                        "attachment" if download else "inline"
                    ),
                },
                ExpiresIn=DOCUMENT_URL_EXPIRATION,
            )
        except (ClientError, BotoCoreError) as exc:
            logger.exception("Gagal membuat URL dokumen S3 untuk key %s", key)
            raise UploadError(
                "STORAGE_ERROR", "Gagal membuat link dokumen, silakan coba lagi"
            ) from exc

    def build_voucher_key(self, client_id: int, invoice_id: int | str) -> str:
        """Return a stable client-scoped S3 key for a generated voucher PDF."""
        return f"voucher/{client_id}/{invoice_id}.pdf"

    def download_pdf(self, key: str, *, bucket: Optional[str] = None) -> bytes:
        """Download a PDF object from S3 and always close its response stream."""
        target_bucket = bucket or self.settings.bucket
        try:
            response = self.s3.get_object(Bucket=target_bucket, Key=key)
            body = response["Body"]
            try:
                return body.read()
            finally:
                body.close()
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise UploadError("NOT_FOUND", "Dokumen tidak ditemukan di S3") from exc
            logger.exception("Gagal mengunduh objek S3 %s/%s", target_bucket, key)
            raise UploadError("STORAGE_ERROR", "Gagal mengunduh dokumen dari S3") from exc
        except BotoCoreError as exc:
            logger.exception("Gagal mengunduh objek S3 %s/%s", target_bucket, key)
            raise UploadError("STORAGE_ERROR", "Gagal mengunduh dokumen dari S3") from exc

    def upload_generated_pdf(
        self,
        *,
        pdf_bytes: bytes,
        client_id: int,
        invoice_id: int | str,
        bucket: Optional[str] = None,
    ) -> str:
        """Store a generated voucher PDF using the configured S3 encryption."""
        if not pdf_bytes.startswith(b"%PDF-"):
            raise UploadError("INVALID_PDF", "File voucher yang dihasilkan bukan PDF valid")

        target_bucket = bucket or self.settings.bucket
        key = self.build_voucher_key(client_id, invoice_id)
        extra: dict[str, str] = {
            "ServerSideEncryption": self.settings.sse,
        }
        if self.settings.sse == "aws:kms" and self.settings.kms_key_id:
            extra["SSEKMSKeyId"] = self.settings.kms_key_id
        try:
            self.s3.put_object(
                Bucket=target_bucket,
                Key=key,
                Body=pdf_bytes,
                ContentType="application/pdf",
                **extra,
            )
        except (ClientError, BotoCoreError) as exc:
            logger.exception("Gagal mengunggah PDF voucher ke S3: %s/%s", target_bucket, key)
            raise UploadError("STORAGE_ERROR", "Gagal menyimpan PDF voucher") from exc
        return key

#     def ensure_pdf_exists(self, key: str, *, bucket: Optional[str] = None) -> None:
#         """Raise a typed upload error when an S3 PDF is missing or inaccessible."""
#         target_bucket = bucket or self.settings.bucket
#         try:
#             self.s3.head_object(Bucket=target_bucket, Key=key)
#         except ClientError as exc:
#             code = exc.response.get("Error", {}).get("Code")
#             if code in {"404", "NoSuchKey", "NotFound"}:
#                 raise UploadError("NOT_FOUND", "Dokumen tidak ditemukan di S3") from exc
#             logger.exception("Gagal memeriksa objek S3 %s/%s", target_bucket, key)
#             raise UploadError("STORAGE_ERROR", "Gagal memeriksa dokumen di S3") from exc
#         except BotoCoreError as exc:
#             logger.exception("Gagal memeriksa objek S3 %s/%s", target_bucket, key)
#             raise UploadError("STORAGE_ERROR", "Gagal memeriksa dokumen di S3") from exc

    def upload_invoice(
        self,
        db: Session,
        *,
        uploader_id: int,
        client_id: int,
        file: BinaryIO,
        filename: str,
        client_metadata: Optional[dict] = None,
    ) -> Invoice:
        try:
            from ..models.invoice import Invoice, InvoiceStatus, InvoiceStatusHistory
        except ImportError:
            from models.invoice import Invoice, InvoiceStatus, InvoiceStatusHistory

        uploader = self._authorize(db, uploader_id, client_id)

        scanned = self._read_file(file)
        page_count = self._validate_pdf(scanned.data)
        self._ensure_not_duplicate(db, client_id, scanned.sha256)

        key = self._build_key(client_id)
        self._put_object(scanned, key)

        try:
            invoice = Invoice(
                client_id=client_id,
                uploaded_by_id=uploader.id,
                status=InvoiceStatus.UPLOADED,
                file_name=self._safe_filename(filename),
                content_type="application/pdf",
                file_size=scanned.size,
                file_sha256=scanned.sha256,
                s3_bucket=self.settings.bucket,
                s3_key=key,
                page_count=page_count,
                client_metadata=client_metadata,
            )
            db.add(invoice)
            db.flush()
            db.add(InvoiceStatusHistory(
                invoice_id=invoice.id, from_status=None,
                to_status=InvoiceStatus.UPLOADED, actor_id=uploader.id,
                note="Invoice diunggah",
            ))
            db.commit()
        except IntegrityError:
            db.rollback()
            self._delete_object(key)
            existing = db.execute(
                select(Invoice.id).where(Invoice.client_id == client_id,
                                         Invoice.file_sha256 == scanned.sha256)
            ).scalar_one_or_none()
            if existing is not None:
                raise DuplicateInvoiceError(existing)
            raise
        except Exception:
            db.rollback()
            self._delete_object(key)  # kompensasi: jangan tinggalkan objek yatim
            raise

        self._notify(invoice.id)
        return invoice

    # ───────── Otorisasi (BRD) ─────────

    @staticmethod
    def _authorize(db: Session, uploader_id: int, client_id: int) -> User:
        try:
            from ..models.user import (
                User, UserRole, Client, Delegation, Permission, has_permission,
            )
        except ImportError:
            from models.user import (
                User, UserRole, Client, Delegation, Permission, has_permission,
            )

        user = db.get(User, uploader_id)
        if user is None or not user.is_active:
            raise PermissionError("Akun tidak aktif atau tidak ditemukan")
        if not has_permission(user.role, Permission.UPLOAD_INVOICE):
            raise PermissionError("Peran ini tidak berwenang mengunggah invoice")

        client = db.get(Client, client_id)
        if client is None or not client.is_active:
            raise LookupError("Klien tidak ditemukan atau tidak aktif")

        if user.role == UserRole.PIC_CLIENT:
            if user.client_id != client_id:
                raise PermissionError("PIC Klien hanya dapat mengunggah untuk klien sendiri")
        elif user.role == UserRole.INTAKE_SUPPORT:
            delegated = db.execute(
                select(Delegation.id).where(
                    Delegation.intake_user_id == user.id,
                    Delegation.client_id == client_id,
                    Delegation.is_active.is_(True),
                ).limit(1)
            ).first()
            if delegated is None:
                raise PermissionError("Intake Support tidak memiliki delegasi untuk klien ini")
        else:
            raise PermissionError("Peran ini tidak berwenang mengunggah invoice")
        return user

    # ───────── Baca dan validasi file ─────────

    def _read_file(self, file: BinaryIO) -> _Scanned:
        """Read the complete file once, enforcing size and PDF signature limits."""
        data = file.read(self.settings.max_bytes + 1)
        if not data:
            raise UploadError("EMPTY_FILE", "File kosong")
        if len(data) > self.settings.max_bytes:
            raise UploadError(
                "FILE_TOO_LARGE",
                f"Ukuran file melebihi batas {self.settings.max_bytes / MIB:.1f} MiB",
            )
        if not data.startswith(b"%PDF-"):
            raise UploadError("NOT_PDF", "File bukan PDF yang valid")
        return _Scanned(data=data, size=len(data), sha256=hashlib.sha256(data).hexdigest())

    def _validate_pdf(self, pdf_bytes: bytes) -> int:
        try:
            reader = PdfReader(BytesIO(pdf_bytes))
            if reader.is_encrypted:
                raise UploadError("ENCRYPTED_PDF", "PDF terenkripsi/berpassword tidak didukung")
            pages = len(reader.pages)
        except UploadError:
            raise
        except (PdfReadError, ValueError, KeyError, OSError) as e:
            raise UploadError("CORRUPT_PDF", "PDF rusak atau tidak dapat dibaca") from e
        if pages < 1:
            raise UploadError("EMPTY_PDF", "PDF tidak memiliki halaman")
        if pages > self.settings.max_pages:
            raise UploadError("TOO_MANY_PAGES",
                              f"Jumlah halaman {pages} melebihi batas {self.settings.max_pages}")
        return pages

    @staticmethod
    def _ensure_not_duplicate(db: Session, client_id: int, sha256: str) -> None:
        try:
            from ..models.invoice import Invoice
        except ImportError:
            from models.invoice import Invoice

        existing = db.execute(
            select(Invoice.id).where(Invoice.client_id == client_id,
                                     Invoice.file_sha256 == sha256).limit(1)
        ).scalar_one_or_none()
        if existing is not None:
            raise DuplicateInvoiceError(existing)

    # ───────── S3 ─────────

    def _build_key(self, client_id: int) -> str:
        # Nama file asli TIDAK dipakai di key (hindari path traversal / karakter aneh)
        now = datetime.now(timezone.utc)
        return (
            f"{self.settings.prefix}/{client_id}/"
            f"{now:%Y/%m}/{uuid.uuid4().hex}.pdf"
        )

    def _build_upload_key(self, client_id: int) -> str:
        now = datetime.now(timezone.utc)
        return (
            f"{self.settings.prefix}/{client_id}/uploads/"
            f"{now:%Y/%m}/{uuid.uuid4().hex}.pdf"
        )

    def _put_object(self, scanned: _Scanned, key: str) -> None:
        extra = {
            "ContentType": "application/pdf",
            "ServerSideEncryption": self.settings.sse,
            "Metadata": {"sha256": scanned.sha256},
        }
        if self.settings.sse == "aws:kms" and self.settings.kms_key_id:
            extra["SSEKMSKeyId"] = self.settings.kms_key_id
        try:
            self.s3.put_object(
                Bucket=self.settings.bucket,
                Key=key,
                Body=scanned.data,
                **extra,
            )
        except (ClientError, BotoCoreError) as e:
            logger.exception("Upload S3 gagal untuk key %s", key)
            raise UploadError("STORAGE_ERROR", "Gagal menyimpan file, silakan coba lagi") from e

    def _delete_object(self, key: str) -> None:
        try:
            self.s3.delete_object(Bucket=self.settings.bucket, Key=key)
        except (ClientError, BotoCoreError):
            logger.exception("Gagal menghapus objek S3: %s", key)

    # ───────── Helper ─────────

    @staticmethod
    def _safe_filename(name: str) -> str:
        base = os.path.basename((name or "").replace("\\", "/"))
        base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip()
        return (base or "invoice.pdf")[:255]

    def _notify(self, invoice_id: int) -> None:
        if self.enqueue_extraction is None:
            return
        try:
            self.enqueue_extraction(invoice_id)
        except Exception:
            # Upload sudah sukses; kegagalan antrian tidak boleh menggagalkan request
            logger.exception("Gagal mengantrekan ekstraksi invoice %s", invoice_id)