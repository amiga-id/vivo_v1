from httpx import AsyncClient
from pytest import MonkeyPatch, mark

from app.core.config import settings
from app.services.demo import reset_demo_state

pytestmark = mark.asyncio(loop_scope="session")


def enable_demo(monkeypatch: MonkeyPatch) -> None:
    reset_demo_state()
    monkeypatch.setattr(settings, "APP_DEMO", True)


async def test_demo_login_returns_frontend_user(
    client: AsyncClient, monkeypatch: MonkeyPatch
):
    enable_demo(monkeypatch)

    response = await client.post(
        "/api/v1/demo/auth/login",
        json={"email": "rina@amiga.demo", "password": "amiga2026"},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["success"]
    assert result["data"]["user"]["role"] == "finance"
    assert result["data"]["user"]["id"] == "rina"


async def test_demo_self_registration_is_not_available(
    client: AsyncClient, monkeypatch: MonkeyPatch
):
    enable_demo(monkeypatch)

    response = await client.post("/api/v1/demo/auth/register")

    assert response.status_code == 404


async def test_demo_queue_matches_role_scope(
    client: AsyncClient, monkeypatch: MonkeyPatch
):
    enable_demo(monkeypatch)

    response = await client.get("/api/v1/demo/queue", headers={"X-Demo-User": "rina"})

    assert response.status_code == 200
    assert {row["id"] for row in response.json()["data"]} == {
        "D-1041",
        "D-1042",
        "D-1039",
    }


async def test_demo_finance_decision_issues_voucher(
    client: AsyncClient, monkeypatch: MonkeyPatch
):
    enable_demo(monkeypatch)

    decision = await client.post(
        "/api/v1/demo/documents/D-1041/decision",
        headers={"X-Demo-User": "rina"},
        json={"kind": "approve"},
    )
    voucher = await client.get(
        "/api/v1/demo/vouchers/D-1041", headers={"X-Demo-User": "rina"}
    )

    assert decision.status_code == 200
    assert voucher.status_code == 200
    assert voucher.json()["data"]["number"] == "VCH-MJ-0008"
    assert voucher.json()["data"]["dpp"] == 12_500_000


async def test_demo_tax_contract_matches_frontend_shape(
    client: AsyncClient, monkeypatch: MonkeyPatch
):
    enable_demo(monkeypatch)

    response = await client.get(
        "/api/v1/demo/documents/D-1041/tax",
        headers={"X-Demo-User": "dewi"},
    )

    assert response.status_code == 200
    result = response.json()["data"]
    assert set(result) == {
        "id",
        "no",
        "klien",
        "vendor",
        "status",
        "dpp",
        "ppnInvoice",
        "tax",
        "approvers",
    }


async def test_demo_upload_requires_assigned_client(
    client: AsyncClient, monkeypatch: MonkeyPatch
):
    enable_demo(monkeypatch)

    response = await client.post(
        "/api/v1/demo/documents",
        headers={"X-Demo-User": "dewi"},
        json={
            "klien": "PT Karya Nusa",
            "jenis": "Pembayaran vendor",
            "tgl": "2026-10-14",
            "fileName": "invoice.pdf",
            "tax": [],
            "approvers": 1,
        },
    )

    assert response.status_code == 403
    assert "belum ditugaskan" in response.json()["error"]["message"]


async def test_demo_api_is_hidden_outside_development(
    client: AsyncClient, monkeypatch: MonkeyPatch
):
    reset_demo_state()
    monkeypatch.setattr(settings, "APP_DEMO", False)
    monkeypatch.setattr(settings, "FASTAPI_ENV", "production")

    response = await client.get("/api/v1/demo/workload")

    assert response.status_code == 404
