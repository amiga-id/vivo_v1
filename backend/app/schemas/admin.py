from pydantic import BaseModel

from app.schemas.audit import AuditEventResponse


class AdminDashboardResponse(BaseModel):
    account_count: int
    vendor_count: int
    submission_count: int
    open_submission_count: int
    accounts_by_role: dict[str, int]
    submissions_by_status: dict[str, int]
    recent_events: list[AuditEventResponse]
