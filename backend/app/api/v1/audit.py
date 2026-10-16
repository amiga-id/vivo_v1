from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.sid import from_uuid
from app.models.account import Account, AccountRole
from app.models.client import RevisionHistory, Submission
from app.models.lead_audit import LeadAuditEvent
from app.schemas.audit import AuditEventResponse
from app.schemas.response import ApiResponse
from app.services.auth import current_account

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("/events", response_model=ApiResponse[list[AuditEventResponse]])
async def list_audit_events(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    audit_query = select(LeadAuditEvent)
    revision_query = select(RevisionHistory, Submission)
    revision_query = revision_query.where(
        ~exists(
            select(LeadAuditEvent.id).where(
                LeadAuditEvent.entity_type == "submission",
                LeadAuditEvent.entity_id == Submission.id,
                or_(
                    (
                        (RevisionHistory.event_type == "intake_revision")
                        & (LeadAuditEvent.action == "Pengajuan revisi dikirim")
                    ),
                    (
                        (RevisionHistory.event_type == "financial_return")
                        & (LeadAuditEvent.action == "Pengajuan dikembalikan")
                    ),
                ),
            )
        )
    )

    if current_user.role == AccountRole.SUPPORT:
        audit_query = audit_query.where(
            exists(
                select(Submission.id).where(
                    Submission.id == LeadAuditEvent.entity_id,
                    Submission.uploader_id == current_user.id,
                )
            )
            | (LeadAuditEvent.actor_id == current_user.id)
        )
        revision_query = revision_query.where(
            Submission.uploader_id == current_user.id
        )
    elif current_user.role == AccountRole.REVIEWER:
        audit_query = audit_query.where(
            exists(
                select(Submission.id).where(
                    Submission.id == LeadAuditEvent.entity_id,
                    Submission.reviewer_id == current_user.id,
                )
            )
            | (LeadAuditEvent.actor_id == current_user.id)
        )
        revision_query = revision_query.where(
            Submission.reviewer_id == current_user.id
        )
    elif current_user.role == AccountRole.LEAD:
        audit_query = audit_query.where(
            (LeadAuditEvent.entity_type.in_(
                ["submission", "client_assignment", "vendor"]
            ))
            | (LeadAuditEvent.actor_id == current_user.id)
        )
        revision_query = revision_query.where(False)
    elif current_user.is_admin:
        pass
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anda tidak memiliki izin untuk melihat riwayat audit.",
        )

    audit_rows = (
        await session.scalars(
            audit_query.order_by(
                LeadAuditEvent.created_at.desc(),
                LeadAuditEvent.id.desc(),
            ).limit(500)
        )
    ).all()
    revision_rows = (
        await session.execute(
            revision_query.order_by(
                RevisionHistory.created_at.desc(),
                RevisionHistory.id.desc(),
            ).limit(500)
        )
    ).all()

    events = [
        AuditEventResponse(
            id=from_uuid(event.id),
            entity_type=event.entity_type,
            entity_id=from_uuid(event.entity_id) if event.entity_id else None,
            entity_label=event.entity_label,
            actor_name=event.actor_name,
            action=event.action,
            detail=event.detail,
            created_at=event.created_at,
        )
        for event in audit_rows
    ]
    events.extend(
        AuditEventResponse(
            id=from_uuid(event.id),
            entity_type="submission",
            entity_id=from_uuid(submission.id),
            entity_label=submission.request_number,
            actor_name=event.actor_name,
            action=event.action,
            detail=event.detail,
            created_at=event.created_at,
        )
        for event, submission in revision_rows
    )
    events.sort(key=lambda event: (event.created_at, event.id), reverse=True)
    return ApiResponse(success=True, data=events[:500])
