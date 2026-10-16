from datetime import date, timedelta

from httpx import AsyncClient
from pytest import mark

from app.models.account import Account
from app.models.client import Client, Submission
from app.models.lead_audit import LeadAuditEvent
from app.models.vendor import Vendor
from app.services.auth import create_access_token

pytestmark = mark.asyncio(loop_scope="session")


async def test_admin_dashboard_uses_database_data(
    client: AsyncClient,
    db_session,
    default_user: Account,
    admin_user: Account,
):
    vendor = Vendor(
        name="Dashboard Vendor",
        pic="Dashboard PIC",
        email="dashboard.vendor@example.com",
        created_by=admin_user.id,
    )
    db_session.add(vendor)
    await db_session.flush()
    managed_client = Client(
        name=vendor.name,
        vendor_id=vendor.id,
        created_by=admin_user.id,
    )
    db_session.add(managed_client)
    await db_session.flush()
    submission = Submission(
        request_number="REQ-ADMIN-DASHBOARD",
        client_id=managed_client.id,
        kind="Invoice",
        receive_date=date.today(),
        uploader_id=default_user.id,
        reviewer_id=admin_user.id,
        due_date=date.today() + timedelta(days=3),
        status="Dalam Review",
        files=[],
        invoices=[],
        tax=[],
    )
    db_session.add(submission)
    db_session.add(
        LeadAuditEvent(
            actor_id=admin_user.id,
            actor_name=admin_user.name,
            entity_type="submission",
            entity_id=submission.id,
            entity_label=submission.request_number,
            action="Admin dashboard test event",
        )
    )
    await db_session.commit()

    admin_token = create_access_token(
        admin_user.id,
        admin_user.email,
        admin_user.role,
    )
    response = await client.get(
        "/api/v1/admin/dashboard",
        headers={"Authorization": admin_token.authorization},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["account_count"] >= 3
    assert data["vendor_count"] >= 1
    assert data["submission_count"] >= 1
    assert data["open_submission_count"] >= 1
    assert data["accounts_by_role"]["support"] >= 1
    assert data["accounts_by_role"]["admin"] >= 1
    assert data["submissions_by_status"]["Dalam Review"] >= 1
    assert data["recent_events"][0]["action"] == "Admin dashboard test event"

    support_token = create_access_token(
        default_user.id,
        default_user.email,
        default_user.role,
    )
    denied = await client.get(
        "/api/v1/admin/dashboard",
        headers={"Authorization": support_token.authorization},
    )
    assert denied.status_code == 403
