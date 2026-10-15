from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DocumentModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ClientResponse(DocumentModel):
    id: str
    name: str


class ClientAssignmentRequest(BaseModel):
    client_ids: list[str]


class AssignmentResponse(BaseModel):
    support_id: str
    client_ids: list[str]


class ExtractedInvoice(BaseModel):
    no: str = ""
    tgl: str = ""
    vendor: str = ""
    npwp: str = ""
    dpp: float = 0
    ppn: float = 0
    total: float = 0
    rek: str = ""
    confidence: dict[str, float] = Field(default_factory=dict)


class UploadedFileData(BaseModel):
    upload_id: str
    is_invoice: bool
    invoice_count: int
    page_count: int
    grand_total: float
    invoices: list[ExtractedInvoice]
    file_name: str
    file_size: int
    s3_key: str
    document_url: str
    document_url_expires_in: int
    extraction_status: Literal["done", "failed"]
    extraction_error: str | None = None


class SubmissionCreateRequest(BaseModel):
    upload_ids: list[str] = Field(min_length=1)
    client_id: str
    revision_of_submission_id: str | None = None
    kind: str = Field(min_length=1, max_length=100)
    channel: str | None = Field(default=None, max_length=100)
    receive_date: date
    note: str | None = Field(default=None, max_length=2000)
    approvers: Literal[1, 2] = 1
    tax: list[dict[str, str | float]] = Field(default_factory=list)

    @field_validator("kind")
    @classmethod
    def strip_kind(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Jenis permintaan wajib diisi.")
        return value


class SubmissionFile(BaseModel):
    file_name: str
    file_size: int
    page_count: int
    s3_key: str
    document_url: str
    extraction_status: Literal["done", "failed"]
    extraction_error: str | None = None


class SubmissionResponse(BaseModel):
    id: str
    request_number: str
    client_id: str
    client_name: str
    kind: str
    channel: str | None = None
    receive_date: date
    note: str | None
    approvers: int
    uploader_id: str
    reviewer_id: str
    due_date: date
    status: str
    decision_reason: str | None = None
    files: list[SubmissionFile]
    invoices: list[ExtractedInvoice]
    invoice_count: int
    page_count: int
    grand_total: float
    tax: list[dict[str, str | float]]
    created_at: datetime


class SubmissionDecisionRequest(BaseModel):
    decision: Literal["approve", "return", "reject"]
    reason: str | None = Field(default=None, max_length=2000)


class SubmissionInvoicesUpdateRequest(BaseModel):
    invoices: list[ExtractedInvoice]


class RevisionHistoryEntry(BaseModel):
    id: str
    request_number: str
    team: Literal["Financial", "Intake"]
    actor_name: str
    action: str
    detail: str | None = None
    created_at: datetime
