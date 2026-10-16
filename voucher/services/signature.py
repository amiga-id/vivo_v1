"""Upload signature images and apply them to stored voucher PDFs."""
from __future__ import annotations

import logging
import mimetypes
import uuid
from io import BytesIO
from typing import BinaryIO, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, UnidentifiedImageError
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from .upload_service import MIB, UploadError, UploadSettings

logger = logging.getLogger(__name__)

SIGNATURE_MAX_BYTES = 5 * MIB
SIGNATURE_FORMAT_EXTENSIONS = {
    "JPEG": "jpg",
    "TIFF": "tiff",
    "MPO": "jpg",
}
SIGNATURE_ROLES = ("admin", "finance", "bod")


class SignatureService:
    def __init__(self, settings: Optional[UploadSettings] = None, s3_client=None):
        self.settings = settings or UploadSettings.from_env()
        self.s3 = s3_client or boto3.client(
            "s3",
            config=Config(
                region_name=self.settings.region,
                retries={"max_attempts": 5, "mode": "standard"},
            ),
        )

    def upload_signature_image(self, *, file: BinaryIO, role: str) -> dict:
        """Validate and upload a signature image to ``signature/{role}/``."""
        normalized_role = role.strip().lower()
        if normalized_role not in SIGNATURE_ROLES:
            raise UploadError(
                "INVALID_ROLE",
                "role tanda tangan harus admin, finance, atau bod",
            )

        image_bytes = file.read(SIGNATURE_MAX_BYTES + 1)
        if not image_bytes:
            raise UploadError("EMPTY_FILE", "File gambar kosong")
        if len(image_bytes) > SIGNATURE_MAX_BYTES:
            raise UploadError(
                "FILE_TOO_LARGE",
                "Ukuran gambar tanda tangan melebihi 5 MiB",
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
            raise UploadError(
                "INVALID_IMAGE",
                "File bukan gambar dengan format yang didukung",
            ) from exc
        if not image_format:
            raise UploadError("INVALID_IMAGE", "Format gambar tidak dikenali")

        extension = SIGNATURE_FORMAT_EXTENSIONS.get(image_format)
        if extension is None:
            extension = next(
                (
                    ext.lstrip(".")
                    for ext, registered_format in Image.registered_extensions().items()
                    if registered_format == image_format
                ),
                image_format.lower(),
            )
        content_type = Image.MIME.get(image_format) or mimetypes.guess_type(
            f"signature.{extension}"
        )[0]
        if not content_type or not content_type.startswith("image/"):
            raise UploadError(
                "INVALID_IMAGE",
                "Tipe konten gambar tidak dapat ditentukan",
            )

        signature_id = str(uuid.uuid4())
        key = f"signature/{normalized_role}/{signature_id}.{extension}"
        self._put_object(
            key,
            image_bytes,
            content_type,
        )
        return {
            "role": normalized_role,
            "signature_id": signature_id,
            "s3_key": key,
            "content_type": content_type,
            "file_size": len(image_bytes),
        }

    def attach_signatures_to_voucher(
        self,
        *,
        voucher_key: str,
        bucket: Optional[str] = None,
        admin_signature_id: Optional[str] = None,
        finance_signature_id: Optional[str] = None,
        bod_signature_id: Optional[str] = None,
    ) -> bytes:
        """Apply selected admin, finance, and BOD signatures to an S3 voucher."""
        target_bucket = bucket or self.settings.bucket
        unsigned_key = self._unsigned_voucher_key(voucher_key)
        try:
            voucher_pdf = self._get_object(unsigned_key, target_bucket)
        except UploadError as exc:
            if exc.code != "NOT_FOUND":
                raise
            voucher_pdf = self._get_object(voucher_key, target_bucket)
            self._put_object(unsigned_key, voucher_pdf, "application/pdf")

        selected_ids = {
            "admin": admin_signature_id,
            "finance": finance_signature_id,
            "bod": bod_signature_id,
        }
        signatures = {
            role: self._get_signature(role, target_bucket, selected_ids[role])
            for role in SIGNATURE_ROLES
        }
        signed_pdf = self._stamp_signatures(voucher_pdf, signatures)
        self._put_object(
            voucher_key,
            signed_pdf,
            "application/pdf",
        )
        return signed_pdf

    def list_signatures(self, *, bucket: Optional[str] = None) -> dict[str, list[dict]]:
        """List selectable signature images in S3 for all approval roles."""
        target_bucket = bucket or self.settings.bucket
        return {
            role: self._list_signatures(role, target_bucket)
            for role in SIGNATURE_ROLES
        }

    @staticmethod
    def _unsigned_voucher_key(voucher_key: str) -> str:
        folder, filename = voucher_key.rsplit("/", 1)
        return f"{folder}/unsigned/{filename}"

    def _list_signatures(self, role: str, bucket: str) -> list[dict]:
        prefix = f"signature/{role}/"
        try:
            paginator = self.s3.get_paginator("list_objects_v2")
            objects = [
                item
                for page in paginator.paginate(Bucket=bucket, Prefix=prefix)
                for item in page.get("Contents", [])
                if item.get("Key", "").startswith(prefix)
            ]
            return [
                {
                    "signature_id": key.rsplit("/", 1)[-1].rsplit(".", 1)[0],
                    "s3_key": key,
                    "last_modified": item.get("LastModified").isoformat()
                    if item.get("LastModified")
                    else None,
                }
                for item in sorted(
                    objects,
                    key=lambda value: value.get("LastModified"),
                    reverse=True,
                )
                if (key := item.get("Key"))
            ]
        except (ClientError, BotoCoreError) as exc:
            logger.exception("Gagal mengambil daftar tanda tangan role %s dari S3", role)
            raise UploadError(
                "STORAGE_ERROR",
                f"Gagal mengambil daftar tanda tangan untuk role {role}",
            ) from exc

    def _get_signature(
        self,
        role: str,
        bucket: str,
        signature_id: Optional[str],
    ) -> bytes:
        objects = self._list_signatures(role, bucket)
        if not objects:
            raise UploadError(
                "SIGNATURE_NOT_FOUND",
                f"Tanda tangan untuk role {role} belum diunggah",
            )

        if signature_id is None:
            selected = objects[0]
        else:
            selected = next(
                (
                    item for item in objects
                    if signature_id in {
                        item["signature_id"],
                        item["s3_key"],
                        item["s3_key"].rsplit("/", 1)[-1],
                    }
                ),
                None,
            )
            if selected is None:
                raise UploadError(
                    "SIGNATURE_NOT_FOUND",
                    f"Identifier tanda tangan '{signature_id}' tidak ditemukan "
                    f"di folder signature/{role}/. Gunakan signature_id atau "
                    "s3_key dari GET /api/v1/signatures",
                )
        return self._get_object(selected["s3_key"], bucket)

    def _get_object(self, key: str, bucket: str) -> bytes:
        try:
            response = self.s3.get_object(Bucket=bucket, Key=key)
            body = response["Body"]
            try:
                return body.read()
            finally:
                body.close()
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise UploadError("NOT_FOUND", f"Objek S3 tidak ditemukan: {key}") from exc
            logger.exception("Gagal mengunduh objek S3 %s/%s", bucket, key)
            raise UploadError("STORAGE_ERROR", "Gagal mengunduh objek dari S3") from exc
        except BotoCoreError as exc:
            logger.exception("Gagal mengunduh objek S3 %s/%s", bucket, key)
            raise UploadError("STORAGE_ERROR", "Gagal mengunduh objek dari S3") from exc

    def _put_object(self, key: str, body: bytes, content_type: str) -> None:
        extra: dict[str, str] = {
            "ContentType": content_type,
            "ServerSideEncryption": self.settings.sse,
        }
        if self.settings.sse == "aws:kms" and self.settings.kms_key_id:
            extra["SSEKMSKeyId"] = self.settings.kms_key_id
        try:
            self.s3.put_object(
                Bucket=self.settings.bucket,
                Key=key,
                Body=body,
                **extra,
            )
        except (ClientError, BotoCoreError) as exc:
            logger.exception("Gagal menyimpan objek tanda tangan/voucher ke S3: %s", key)
            raise UploadError("STORAGE_ERROR", "Gagal menyimpan file ke S3") from exc

    @staticmethod
    def _stamp_signatures(
        voucher_pdf: bytes,
        signatures: dict[str, bytes],
    ) -> bytes:
        try:
            reader = PdfReader(BytesIO(voucher_pdf))
            if reader.is_encrypted or not reader.pages:
                raise ValueError("Voucher kosong atau terenkripsi")

            positions: dict[str, tuple[int, float, float]] = {}
            for page_index, page in enumerate(reader.pages):
                def capture(text, *args):
                    normalized = " ".join(text.split()).casefold()
                    if normalized in SIGNATURE_ROLES:
                        ctm = args[0]
                        text_matrix = args[1]
                        positions.setdefault(
                            normalized,
                            (
                                page_index,
                                float(
                                    ctm[0] * text_matrix[4]
                                    + ctm[2] * text_matrix[5]
                                    + ctm[4]
                                ),
                                float(
                                    ctm[1] * text_matrix[4]
                                    + ctm[3] * text_matrix[5]
                                    + ctm[5]
                                ),
                            ),
                        )

                page.extract_text(visitor_text=capture)

            missing = set(SIGNATURE_ROLES) - positions.keys()
            if missing:
                raise ValueError(
                    "Area tanda tangan tidak ditemukan di voucher: "
                    + ", ".join(sorted(missing))
                )

            overlay_stream = BytesIO()
            first_page = reader.pages[0]
            overlay = canvas.Canvas(
                overlay_stream,
                pagesize=(
                    float(first_page.mediabox.width),
                    float(first_page.mediabox.height),
                ),
            )
            max_width = 145
            max_height = 42
            for page_index, page in enumerate(reader.pages):
                page_width = float(page.mediabox.width)
                page_height = float(page.mediabox.height)
                overlay.setPageSize((page_width, page_height))
                for role, image_bytes in signatures.items():
                    signature_page, label_x, label_y = positions[role]
                    if signature_page != page_index:
                        continue
                    image = ImageReader(BytesIO(image_bytes))
                    image_width, image_height = image.getSize()
                    scale = min(max_width / image_width, max_height / image_height)
                    draw_width = image_width * scale
                    draw_height = image_height * scale
                    role_x = label_x - draw_width / 2
                    overlay.drawImage(
                        image,
                        min(role_x, page_width - draw_width),
                        min(label_y + 22, page_height - draw_height),
                        width=draw_width,
                        height=draw_height,
                        mask="auto",
                    )
                overlay.showPage()
            overlay.save()

            overlay_reader = PdfReader(BytesIO(overlay_stream.getvalue()))
            writer = PdfWriter()
            for page_index, page in enumerate(reader.pages):
                if page_index in {value[0] for value in positions.values()}:
                    page.merge_page(overlay_reader.pages[page_index])
                writer.add_page(page)
            output = BytesIO()
            writer.write(output)
            return output.getvalue()
        except (PdfReadError, OSError, ValueError) as exc:
            raise UploadError(
                "INVALID_VOUCHER",
                f"Gagal menempelkan tanda tangan pada voucher: {exc}",
            ) from exc
