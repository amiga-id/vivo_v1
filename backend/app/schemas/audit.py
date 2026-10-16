from datetime import datetime

from pydantic import BaseModel


class AuditEventResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str | None = None
    entity_label: str | None = None
    actor_name: str
    action: str
    detail: str | None = None
    created_at: datetime
