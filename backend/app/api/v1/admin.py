from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.sid import from_uuid
from app.models.account import Account, AccountRole
from app.models.client import RevisionHistory, Submission
from app.models.lead_audit import LeadAuditEvent
from app.models.vendor import Vendor
from app.schemas.admin import AdminDashboardResponse
from app.schemas.audit import AuditEventResponse
from app.schemas.response import ApiResponse
from app.services.auth import current_account

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get(
    "/dashboard",
    response_model=ApiResponse[AdminDashboardResponse],
)
async def get_admin_dashboard(
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya administrator yang dapat melihat dashboard ini.",
        )

    account_count = await session.scalar(select(func.count(Account.id))) or 0
    vendor_count = await session.scalar(select(func.count(Vendor.id))) or 0
    submission_count = await session.scalar(select(func.count(Submission.id))) or 0
    open_submission_count = (
        await session.scalar(
            select(func.count(Submission.id)).where(
                Submission.status.not_in(["Disetujui", "Ditolak"])
            )
        )
        or 0
    )

    role_counts = (
        await session.execute(
            select(Account.role, func.count(Account.id)).group_by(Account.role)
        )
    ).all()
    status_counts = (
        await session.execute(
            select(Submission.status, func.count(Submission.id)).group_by(
                Submission.status
            )
        )
    ).all()
    account_roles = {
        "support": 0,
        "finance": 0,
        "lead": 0,
        "admin": 0,
    }
    role_buckets = {
        AccountRole.SUPPORT: "support",
        AccountRole.REVIEWER: "finance",
        AccountRole.LEAD: "lead",
        AccountRole.ADMIN: "admin",
        AccountRole.SYSTEM: "admin",
    }
    for role, count in role_counts:
        account_roles[role_buckets[role]] += count
    submissions_by_status = dict(status_counts)

    audit_rows = (
        await session.scalars(
            select(LeadAuditEvent)
            .order_by(LeadAuditEvent.created_at.desc(), LeadAuditEvent.id.desc())
            .limit(10)
        )
    ).all()
    revision_rows = (
        await session.execute(
            select(RevisionHistory, Submission)
            .join(Submission, Submission.id == RevisionHistory.submission_id)
            .where(
                ~exists(
                    select(LeadAuditEvent.id).where(
                        LeadAuditEvent.entity_type == "submission",
                        LeadAuditEvent.entity_id == Submission.id,
                        or_(
                            (
                                (RevisionHistory.event_type == "intake_revision")
                                & (
                                    LeadAuditEvent.action
                                    == "Pengajuan revisi dikirim"
                                )
                            ),
                            (
                                (RevisionHistory.event_type == "financial_return")
                                & (
                                    LeadAuditEvent.action
                                    == "Pengajuan dikembalikan"
                                )
                            ),
                        ),
                    )
                )
            )
            .order_by(
                RevisionHistory.created_at.desc(),
                RevisionHistory.id.desc(),
            )
            .limit(10)
        )
    ).all()

    recent_events = [
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
    recent_events.extend(
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
    recent_events.sort(
        key=lambda event: (event.created_at, event.id),
        reverse=True,
    )

    return ApiResponse(
        success=True,
        data=AdminDashboardResponse(
            account_count=account_count,
            vendor_count=vendor_count,
            submission_count=submission_count,
            open_submission_count=open_submission_count,
            accounts_by_role=account_roles,
            submissions_by_status=submissions_by_status,
            recent_events=recent_events[:10],
        ),
    )
