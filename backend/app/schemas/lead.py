from datetime import date, datetime

from pydantic import BaseModel


class LeadReviewerResponse(BaseModel):
    id: str
    name: str


class LeadSupportResponse(BaseModel):
    id: str
    name: str
    email: str


class LeadWorkloadRow(BaseModel):
    id: str
    request_number: str
    client_name: str
    kind: str
    due_date: date
    status: str
    reviewer_id: str
    reviewer_name: str
    uploader_id: str
    uploader_name: str
    conflict: bool


class LeadWorkloadResponse(BaseModel):
    submissions: list[LeadWorkloadRow]
    reviewers: list[LeadReviewerResponse]


class LeadReviewerUpdateRequest(BaseModel):
    reviewer_id: str


class LeadActionResponse(BaseModel):
    message: str


class LeadAuditResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str | None
    entity_label: str | None
    actor_name: str
    action: str
    detail: str | None
    created_at: datetime
