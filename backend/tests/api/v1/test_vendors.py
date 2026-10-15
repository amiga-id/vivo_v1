from httpx import AsyncClient
from pytest import mark

from app.models.account import Account
from app.services.auth import create_access_token

pytestmark = mark.asyncio(loop_scope="session")


async def test_admin_can_create_and_list_vendor(
    client: AsyncClient, admin_user: Account, default_user: Account
):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)
    headers = {"Authorization": token.authorization}
    vendor_data = {
        "name": "PT Vendor Test",
        "pic": "Dewi",
        "email": "DEWI@EXAMPLE.COM",
        "phone_number": "",
        "address": "Jakarta",
    }

    created = await client.post(
        "/api/v1/vendors/create",
        headers=headers,
        json=vendor_data,
    )

    assert created.status_code == 201
    vendor = created.json()["data"]
    assert vendor["name"] == vendor_data["name"]
    assert vendor["email"] == "dewi@example.com"
    assert vendor["phone_number"] is None
    assert vendor["address"] == vendor_data["address"]

    listed = await client.post(
        "/api/v1/vendors",
        headers=headers,
        json={
            "page": {"index": 1, "size": 100},
            "query": "PT Vendor Test",
        },
    )

    assert listed.status_code == 200
    assert listed.json()["page"]["total"] == 1
    assert listed.json()["data"][0]["id"] == vendor["id"]

    clients = await client.get("/api/v1/clients", headers=headers)

    assert clients.status_code == 200
    assert any(entry["name"] == vendor_data["name"] for entry in clients.json()["data"])
    vendor_client = next(
        entry
        for entry in clients.json()["data"]
        if entry["name"] == vendor_data["name"]
    )

    assigned = await client.put(
        f"/api/v1/clients/assignments/{default_user.id}",
        headers=headers,
        json={"client_ids": [vendor_client["id"]]},
    )

    assert assigned.status_code == 200
    assert assigned.json()["data"]["client_ids"] == [vendor_client["id"]]

    refreshed_vendor = await client.post(
        "/api/v1/vendors",
        headers=headers,
        json={"page": {"index": 1, "size": 100}, "query": vendor_data["name"]},
    )
    assert refreshed_vendor.status_code == 200
    assert refreshed_vendor.json()["data"][0]["pic"] == default_user.name


async def test_non_admin_cannot_manage_vendors(
    client: AsyncClient, default_user: Account
):
    token = create_access_token(default_user.id, default_user.email, default_user.role)
    headers = {"Authorization": token.authorization}

    listed = await client.post("/api/v1/vendors", headers=headers, json={})
    created = await client.post(
        "/api/v1/vendors/create",
        headers=headers,
        json={
            "name": "PT Unauthorized",
            "pic": "User",
            "email": "user@example.com",
        },
    )

    assert listed.status_code == 403
    assert created.status_code == 403
