from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.lead_audit import LeadAuditEvent


def record_audit_event(
    session: AsyncSession,
    actor: Account,
    *,
    entity_type: str,
    action: str,
    entity_id: UUID | None = None,
    entity_label: str | None = None,
    detail: str | None = None,
) -> None:
    session.add(
        LeadAuditEvent(
            actor_id=actor.id,
            actor_name=actor.name,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_label=entity_label,
            action=action,
            detail=detail,
        )
    )
