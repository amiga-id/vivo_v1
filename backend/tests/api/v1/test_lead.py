from datetime import date, timedelta

from httpx import AsyncClient
from pytest import mark
from sqlalchemy import select

from app.core.sid import from_uuid
from app.models.account import Account, AccountRole
from app.models.client import Client, ClientAssignment, Submission
from app.models.lead_audit import LeadAuditEvent
from app.models.vendor import Vendor
from app.services.auth import create_access_token, hash_password

pytestmark = mark.asyncio(loop_scope="session")


async def test_lead_workload_assignments_and_audit(
    client: AsyncClient, db_session, default_user: Account
):
    lead = Account(
        name="Lead Test",
        email="lead.test@example.com",
        password_hash=hash_password("12345678"),
        role=AccountRole.LEAD,
    )
    first_reviewer = Account(
        name="Reviewer One",
        email="reviewer.one@example.com",
        password_hash=hash_password("12345678"),
        role=AccountRole.REVIEWER,
    )
    next_reviewer = Account(
        name="Reviewer Two",
        email="reviewer.two@example.com",
        password_hash=hash_password("12345678"),
        role=AccountRole.REVIEWER,
    )
    db_session.add_all([lead, first_reviewer, next_reviewer])
    await db_session.flush()

    vendor = Vendor(
        name="PT Lead Test",
        pic=default_user.name,
        email="vendor.lead@example.com",
        created_by=default_user.id,
    )
    db_session.add(vendor)
    await db_session.flush()
    managed_client = Client(
        name=vendor.name,
        vendor_id=vendor.id,
        created_by=default_user.id,
    )
    db_session.add(managed_client)
    await db_session.flush()

    submission = Submission(
        request_number="REQ-LEAD-TEST",
        client_id=managed_client.id,
        kind="Invoice",
        receive_date=date.today(),
        uploader_id=default_user.id,
        reviewer_id=first_reviewer.id,
        due_date=date.today() + timedelta(days=3),
        status="Dalam Review",
        files=[],
        invoices=[],
        tax=[],
    )
    db_session.add(submission)
    await db_session.commit()

    token = create_access_token(lead.id, lead.email, lead.role)
    headers = {"Authorization": token.authorization}

    workload = await client.get("/api/v1/lead/workload", headers=headers)
    assert workload.status_code == 200
    workload_data = workload.json()["data"]
    row = next(
        item
        for item in workload_data["submissions"]
        if item["request_number"] == submission.request_number
    )
    assert row["client_name"] == managed_client.name
    assert row["reviewer_name"] == first_reviewer.name
    assert "grand_total" not in row
    assert "invoices" not in row

    reassigned = await client.patch(
        f"/api/v1/lead/workload/{submission.id}/reviewer",
        headers=headers,
        json={"reviewer_id": next_reviewer.id},
    )
    assert reassigned.status_code == 200
    refreshed_submission = await db_session.get(Submission, submission.id)
    assert refreshed_submission is not None
    assert refreshed_submission.reviewer_id == next_reviewer.id

    support_accounts = await client.get(
        "/api/v1/lead/support-accounts", headers=headers
    )
    assert support_accounts.status_code == 200
    assert any(
        account["id"] == from_uuid(default_user.id)
        for account in support_accounts.json()["data"]
    )

    clients = await client.get("/api/v1/clients", headers=headers)
    assert clients.status_code == 200
    assert any(
        item["id"] == from_uuid(managed_client.id)
        for item in clients.json()["data"]
    )

    assigned = await client.put(
        f"/api/v1/clients/assignments/{default_user.id}",
        headers=headers,
        json={"client_ids": [from_uuid(managed_client.id)]},
    )
    assert assigned.status_code == 200
    assignment = await db_session.scalar(
        select(ClientAssignment).where(
            ClientAssignment.support_id == default_user.id,
            ClientAssignment.client_id == managed_client.id,
        )
    )
    assert assignment is not None

    audit = await client.get("/api/v1/lead/audit", headers=headers)
    assert audit.status_code == 200
    actions = {event["action"] for event in audit.json()["data"]}
    assert "Tugas dialihkan" in actions
    assert "Penugasan klien diperbarui" in actions
    assert await db_session.scalar(select(LeadAuditEvent.id)) is not None


async def test_non_lead_cannot_access_lead_workflows(
    client: AsyncClient, default_user: Account
):
    token = create_access_token(
        default_user.id,
        default_user.email,
        default_user.role,
    )
    headers = {"Authorization": token.authorization}

    workload = await client.get("/api/v1/lead/workload", headers=headers)
    audit = await client.get("/api/v1/lead/audit", headers=headers)
    support_accounts = await client.get(
        "/api/v1/lead/support-accounts", headers=headers
    )
    assignments = await client.get("/api/v1/clients/assignments", headers=headers)

    assert workload.status_code == 403
    assert audit.status_code == 403
    assert support_accounts.status_code == 403
    assert assignments.status_code == 403
