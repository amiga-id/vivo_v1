from datetime import date, timedelta

from httpx import AsyncClient
from pytest import mark

from app.models.account import Account, AccountRole
from app.models.client import Client, Submission
from app.models.lead_audit import LeadAuditEvent
from app.services.auth import create_access_token, hash_password

pytestmark = mark.asyncio(loop_scope="session")


async def test_audit_events_are_persisted_and_scoped_by_role(
    client: AsyncClient,
    db_session,
    default_user: Account,
    admin_user: Account,
):
    reviewer = Account(
        name="Audit Reviewer",
        email="audit.reviewer@example.com",
        password_hash=hash_password("12345678"),
        role=AccountRole.REVIEWER,
    )
    lead = Account(
        name="Audit Lead",
        email="audit.lead@example.com",
        password_hash=hash_password("12345678"),
        role=AccountRole.LEAD,
    )
    other_support = Account(
        name="Other Support",
        email="other.support.audit@example.com",
        password_hash=hash_password("12345678"),
        role=AccountRole.SUPPORT,
    )
    db_session.add_all([reviewer, lead, other_support])
    await db_session.flush()

    first_client = Client(name="Audit Client One", created_by=default_user.id)
    second_client = Client(name="Audit Client Two", created_by=other_support.id)
    db_session.add_all([first_client, second_client])
    await db_session.flush()
    submissions = [
        Submission(
            request_number="REQ-AUDIT-OWN",
            client_id=first_client.id,
            kind="Invoice",
            receive_date=date.today(),
            uploader_id=default_user.id,
            reviewer_id=reviewer.id,
            due_date=date.today() + timedelta(days=3),
            status="Dalam Review",
            files=[],
            invoices=[],
            tax=[],
        ),
        Submission(
            request_number="REQ-AUDIT-OTHER",
            client_id=second_client.id,
            kind="Invoice",
            receive_date=date.today(),
            uploader_id=other_support.id,
            reviewer_id=reviewer.id,
            due_date=date.today() + timedelta(days=3),
            status="Dalam Review",
            files=[],
            invoices=[],
            tax=[],
        ),
    ]
    db_session.add_all(submissions)
    await db_session.flush()

    events = [
        LeadAuditEvent(
            actor_id=default_user.id,
            actor_name=default_user.name,
            entity_type="session",
            action="Audit test support session",
        ),
        LeadAuditEvent(
            actor_id=reviewer.id,
            actor_name=reviewer.name,
            entity_type="submission",
            entity_id=submissions[0].id,
            entity_label=submissions[0].request_number,
            action="Audit test own submission",
        ),
        LeadAuditEvent(
            actor_id=admin_user.id,
            actor_name=admin_user.name,
            entity_type="account",
            entity_label="Audit-only account",
            action="Audit test admin-only account change",
        ),
    ]
    db_session.add_all(events)
    await db_session.commit()

    async def fetch_events(user: Account) -> list[dict]:
        token = create_access_token(user.id, user.email, user.role)
        response = await client.get(
            "/api/v1/audit/events",
            headers={"Authorization": token.authorization},
        )
        assert response.status_code == 200
        return response.json()["data"]

    support_events = await fetch_events(default_user)
    support_actions = {event["action"] for event in support_events}
    assert "Audit test support session" in support_actions
    assert "Audit test own submission" in support_actions
    assert "Audit test admin-only account change" not in support_actions

    reviewer_events = await fetch_events(reviewer)
    reviewer_actions = {event["action"] for event in reviewer_events}
    assert "Audit test own submission" in reviewer_actions
    assert "Audit test admin-only account change" not in reviewer_actions

    lead_events = await fetch_events(lead)
    lead_actions = {event["action"] for event in lead_events}
    assert "Audit test own submission" in lead_actions
    assert "Audit test admin-only account change" not in lead_actions

    admin_events = await fetch_events(admin_user)
    admin_actions = {event["action"] for event in admin_events}
    assert "Audit test support session" in admin_actions
    assert "Audit test admin-only account change" in admin_actions
