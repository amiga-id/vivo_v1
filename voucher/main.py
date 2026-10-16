import logging
import sys
import threading
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError
from starlette.responses import Response

from bedrock_db import get_extraction_result, save_extraction_result
from services.bedrock_service import BedrockInvoiceService
from services.signature import SignatureService
from services.upload_service import (
    InvoiceUploadService,
    UploadError,
)
from services.voucher_service import VoucherService, VoucherWorkflowError

load_dotenv()

logger = logging.getLogger(__name__)
extraction_jobs: dict[str, dict[str, Any]] = {}
extraction_jobs_lock = threading.Lock()


app = FastAPI(
    title="Amiga Invoice Extraction API",
    version="1.0.0",
    description="Upload PDF invoices to S3 and extract their data with Amazon Bedrock.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"app": "Amiga", "status": "ok"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


def _extract_document(job_id: str) -> None:
    with extraction_jobs_lock:
        job = extraction_jobs[job_id]
        job["status"] = "PROCESSING"
        client_id = job["_client_id"]
        source_key = job["_source_key"]
        bucket = job["_bucket"]

    try:
        upload_service = InvoiceUploadService()
        source_pdf = upload_service.download_pdf(source_key, bucket=bucket)
        extraction_result = BedrockInvoiceService().extract(
            source_pdf,
            formatted=True,
        )
        if not extraction_result.get("is_invoice"):
            raise VoucherWorkflowError("Dokumen tidak berisi invoice yang terdeteksi")

        save_extraction_result(job_id, client_id, extraction_result)

    except Exception as exc:
        logger.exception("Upload job processing failed for job %s", job_id)
        with extraction_jobs_lock:
            extraction_jobs[job_id].update(
                status="FAILED",
                error=f"{type(exc).__name__}: {exc}",
            )
        return

    with extraction_jobs_lock:
        extraction_jobs[job_id].update(
            status="COMPLETED",
            extraction_status="SUCCESS",
            result=extraction_result,
        )


@app.get(
    "/api/v1/documents/upload/{job_id}",
    summary="Get document upload and extraction status",
)
def get_upload_status(job_id: str):
    with extraction_jobs_lock:
        job = extraction_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Upload job tidak ditemukan")
        return {
            key: value for key, value in job.items()
            if not key.startswith("_")
        }


@app.post(
    "/api/v1/signatures/{role}",
    status_code=201,
    summary="Upload a signature image associated with a role",
)
async def upload_signature(role: str, file: UploadFile = File(...)):
    try:
        signature = SignatureService().upload_signature_image(
            file=file.file,
            role=role,
        )
        return signature
    except UploadError as exc:
        status_code = {
            "FILE_TOO_LARGE": 413,
            "STORAGE_ERROR": 502,
        }.get(exc.code, 400)
        raise HTTPException(status_code=status_code, detail=exc.message) from exc
    except RuntimeError as exc:
        logger.exception("S3 configuration is unavailable for signature upload")
        raise HTTPException(
            status_code=503,
            detail="S3 is not configured; check backend settings and logs",
        ) from exc
    finally:
        await file.close()


@app.get(
    "/api/v1/signatures",
    summary="List S3 signature choices for admin, finance, and BOD",
)
def list_signatures():
    try:
        return SignatureService().list_signatures()
    except UploadError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc
    except RuntimeError as exc:
        logger.exception("S3 configuration is unavailable for signature listing")
        raise HTTPException(
            status_code=503,
            detail="S3 is not configured; check backend settings and logs",
        ) from exc


@app.get(
    "/api/v1/documents/upload/{job_id}/voucher/signatures",
    summary="Apply selected admin, finance, and BOD signatures to the stored S3 voucher",
)
def apply_voucher_signatures(
    job_id: str,
    admin_signature_id: str | None = Query(default=None),
    finance_signature_id: str | None = Query(default=None),
    bod_signature_id: str | None = Query(default=None),
):
    with extraction_jobs_lock:
        job = extraction_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Upload job tidak ditemukan")
        job = dict(job)

    if job["status"] != "COMPLETED":
        raise HTTPException(
            status_code=409,
            detail="Voucher belum tersedia; tunggu ekstraksi selesai",
        )

    try:
        upload_service = InvoiceUploadService()
        voucher_key = job.get("voucher_s3_key") or upload_service.build_voucher_key(
            job["_client_id"],
            job_id,
        )
        signed_pdf = SignatureService().attach_signatures_to_voucher(
            voucher_key=voucher_key,
            bucket=job["_bucket"],
            admin_signature_id=admin_signature_id,
            finance_signature_id=finance_signature_id,
            bod_signature_id=bod_signature_id,
        )
        with extraction_jobs_lock:
            extraction_jobs[job_id]["voucher_s3_key"] = voucher_key

        return Response(
            content=signed_pdf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="voucher-{job_id}-signed.pdf"'
                ),
                "X-Voucher-S3-Key": voucher_key,
                "X-Admin-Signature-Id": admin_signature_id or "latest",
                "X-Finance-Signature-Id": finance_signature_id or "latest",
                "X-BOD-Signature-Id": bod_signature_id or "latest",
            },
        )
    except UploadError as exc:
        status_code = 404 if exc.code in {
            "NOT_FOUND",
            "SIGNATURE_NOT_FOUND",
        } else 502
        raise HTTPException(status_code=status_code, detail=exc.message) from exc
    except RuntimeError as exc:
        logger.exception("S3 configuration is unavailable while signing voucher")
        raise HTTPException(
            status_code=503,
            detail="S3 is not configured; check backend settings and logs",
        ) from exc


@app.get(
    "/api/v1/documents/upload/{job_id}/voucher",
    summary="Download a voucher PDF with the original S3 document attached",
)
def download_upload_voucher(job_id: str):
    with extraction_jobs_lock:
        job = extraction_jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Upload job tidak ditemukan")
        job = dict(job)

    if job["status"] in {"PENDING", "PROCESSING"}:
        raise HTTPException(
            status_code=409,
            detail="Ekstraksi masih berjalan; periksa status job terlebih dahulu",
        )
    if job["status"] != "COMPLETED":
        raise HTTPException(
            status_code=409,
            detail=job.get("error", "Ekstraksi gagal; voucher tidak dapat dibuat"),
        )

    try:
        extraction_result = get_extraction_result(job_id)
        if extraction_result is None:
            raise HTTPException(
                status_code=404,
                detail="Hasil ekstraksi tidak ditemukan di database",
            )

        upload_service = InvoiceUploadService()
        source_pdf = upload_service.download_pdf(
            job["_source_key"],
            bucket=job["_bucket"],
        )
        pdf_bytes = VoucherService.create_combined_pdf(
            source_pdf,
            extraction_result,
        )
        voucher_key = upload_service.upload_generated_pdf(
            pdf_bytes=pdf_bytes,
            client_id=job["_client_id"],
            invoice_id=job_id,
            bucket=job["_bucket"],
        )
        with extraction_jobs_lock:
            extraction_jobs[job_id]["voucher_s3_key"] = voucher_key

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="voucher-{job_id}.pdf"'
                ),
                "X-Voucher-S3-Key": voucher_key,
            },
        )
    except HTTPException:
        raise
    except UploadError as exc:
        status_code = 404 if exc.code == "NOT_FOUND" else 502
        raise HTTPException(status_code=status_code, detail=exc.message) from exc
    except SQLAlchemyError as exc:
        logger.exception("Failed to load extraction result for job %s", job_id)
        raise HTTPException(
            status_code=503,
            detail="Database is unavailable",
        ) from exc
    except ValueError as exc:
        logger.exception("Failed to generate voucher for job %s", job_id)
        raise HTTPException(
            status_code=502,
            detail="Gagal membuat voucher PDF",
        ) from exc
    except RuntimeError as exc:
        logger.exception("Voucher generation or database configuration failed")
        raise HTTPException(
            status_code=503,
            detail="S3 or database configuration is unavailable",
        ) from exc


@app.post(
    "/api/v1/documents/upload",
    status_code=202,
    summary="Upload a PDF document to S3",
    description=(
        "Accepts client_id and file as multipart form fields. The server selects "
        "an S3 client folder from client_id, stores the PDF, and starts extraction "
        "and voucher generation asynchronously. Successful extraction results are "
        "stored in the PostgreSQL data table. The voucher endpoint reads that result "
        "and appends the original S3 PDF to the generated voucher. Poll status_url "
        "and use voucher_url after extraction completes. Job status is process-local, "
        "so it is cleared on restart and requires a single API worker."
    ),
)
async def upload_document(
    background_tasks: BackgroundTasks,
    client_id: int = Form(
        ...,
        gt=0,
        description="ID klien yang terkait dengan dokumen.",
    ),
    file: UploadFile = File(
        ...,
        media_type="application/pdf",
        description="PDF document to store in S3.",
    ),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    job_id = str(uuid.uuid4())
    try:
        upload_service = InvoiceUploadService()
        upload_result = upload_service.upload_pdf(
            file=file.file,
            filename=file.filename,
            client_id=client_id,
        )
        with extraction_jobs_lock:
            extraction_jobs[job_id] = {
                "job_id": job_id,
                "status": "PENDING",
                "upload": upload_result,
                "_client_id": client_id,
                "_source_key": upload_result["s3_key"],
                "_bucket": upload_service.settings.bucket,
            }
        background_tasks.add_task(_extract_document, job_id)
        return {
            "job_id": job_id,
            "status": "PENDING",
            "status_url": f"/api/v1/documents/upload/{job_id}",
            "voucher_url": f"/api/v1/documents/upload/{job_id}/voucher",
            "upload": upload_result,
        }
    except UploadError as exc:
        status_code = {
            "FILE_TOO_LARGE": 413,
            "STORAGE_ERROR": 502,
        }.get(exc.code, 400)
        raise HTTPException(status_code=status_code, detail=exc.message) from exc
    except RuntimeError as exc:
        logger.exception("S3 configuration is unavailable")
        raise HTTPException(
            status_code=503,
            detail="S3 is not configured; check backend settings and logs",
        ) from exc
    finally:
        await file.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)