from datetime import UTC, datetime
from unittest.mock import AsyncMock

from httpx import (
    AsyncClient,
)
from pytest import mark

from app.core.sid import from_uuid
from app.models.account import Account
from app.services.auth import create_access_token

pytestmark = mark.asyncio(loop_scope="session")


async def test_public_account_registration_is_not_available(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Newton",
            "email": "newton@example.com",
            "password": "12345678",
        },
    )

    assert response.status_code == 404


async def test_admin_can_create_account(
    client: AsyncClient, admin_user: Account
):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)

    response = await client.post(
        "/api/v1/auth/accounts/create",
        headers={"Authorization": token.authorization},
        json={
            "name": "Newton",
            "email": "newton@example.com",
            "password": "12345678",
            "role": "support",
        },
    )

    assert response.status_code == 201
    assert response.json()["data"]["email"] == "newton@example.com"


async def test_admin_cannot_create_finance_account_without_signature(
    client: AsyncClient,
    admin_user: Account,
):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)

    response = await client.post(
        "/api/v1/auth/accounts/create",
        headers={"Authorization": token.authorization},
        json={
            "name": "Finance Reviewer",
            "email": "finance-reviewer@example.com",
            "password": "12345678",
            "role": "reviewer",
        },
    )

    assert response.status_code == 422


async def test_admin_can_create_finance_account_with_signature(
    client: AsyncClient,
    admin_user: Account,
    monkeypatch,
):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)
    register_signature = AsyncMock()
    monkeypatch.setattr(
        "app.api.v1.auth.register_voucher_signature",
        register_signature,
    )

    response = await client.post(
        "/api/v1/auth/accounts/create-with-signature",
        headers={"Authorization": token.authorization},
        data={
            "name": "Finance Reviewer",
            "email": "finance-reviewer@example.com",
            "password": "12345678",
            "role": "reviewer",
        },
        files={"file": ("signature.png", b"signature-image", "image/png")},
    )

    assert response.status_code == 201
    assert response.json()["data"]["email"] == "finance-reviewer@example.com"
    assert response.json()["data"]["role"] == "reviewer"
    register_signature.assert_awaited_once()
    assert register_signature.await_args.args[1].email == "finance-reviewer@example.com"
    assert register_signature.await_args.kwargs["created_by"] == admin_user


@mark.parametrize("role", ["support", "reviewer", "lead", "admin"])
async def test_admin_can_create_any_role_with_signature(
    client: AsyncClient,
    admin_user: Account,
    monkeypatch,
    role: str,
):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)
    register_signature = AsyncMock()
    monkeypatch.setattr(
        "app.api.v1.auth.register_voucher_signature",
        register_signature,
    )
    email = f"{role}-signature@example.com"

    response = await client.post(
        "/api/v1/auth/accounts/create-with-signature",
        headers={"Authorization": token.authorization},
        data={
            "name": f"{role.title()} Account",
            "email": email,
            "password": "12345678",
            "role": role,
        },
        files={"file": ("signature.png", b"signature-image", "image/png")},
    )

    assert response.status_code == 201
    assert response.json()["data"]["email"] == email
    assert register_signature.await_args.args[1].role.value == role
    assert register_signature.await_args.kwargs["created_by"] == admin_user


async def test_non_admin_cannot_create_account(
    client: AsyncClient, default_user: Account
):
    token = create_access_token(default_user.id, default_user.email, default_user.role)

    response = await client.post(
        "/api/v1/auth/accounts/create",
        headers={"Authorization": token.authorization},
        json={
            "name": "Newton",
            "email": "newton@example.com",
            "password": "12345678",
            "role": "support",
        },
    )

    assert response.status_code == 403


async def test_auth_login_success(
    client: AsyncClient, default_user: Account, test_password: str
):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": default_user.email, "password": test_password},
    )

    assert response.status_code == 200

    result = response.json()
    assert result["success"]

    data = result["data"]
    assert data["email"] == default_user.email
    assert data["access_token"] is not None
    assert data["token_type"] == "bearer"  # noqa: S105
    assert datetime.fromisoformat(data["expires"]) > datetime.now(UTC)


async def test_auth_login_failed(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "foo-bar@example.com", "password": "87654321"},
    )

    assert response.status_code == 401

    result = response.json()
    assert not result["success"]

    error = result["error"]
    assert error["code"] == 401
    assert error["message"] == "Invalid email or password"


async def test_auth_me_returns_database_account(
    client: AsyncClient, default_user: Account
):
    token = create_access_token(default_user.id, default_user.email, default_user.role)

    response = await client.post(
        "/api/v1/auth/me",
        headers={"Authorization": token.authorization},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["success"]
    assert result["data"]["email"] == default_user.email
    assert result["data"]["role"] == "support"


async def test_admin_account_list_excludes_system_superadmin(
    client: AsyncClient, admin_user: Account, system_user: Account
):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)

    response = await client.post(
        "/api/v1/auth/accounts",
        headers={"Authorization": token.authorization},
        json={"page": {"index": 1, "size": 100}},
    )

    assert response.status_code == 200
    result = response.json()
    listed_emails = [account["email"] for account in result["data"]]
    assert system_user.email not in listed_emails
    assert all(account["role"] != "system" for account in result["data"])
    assert result["page"]["total"] == len(result["data"])


async def test_admin_can_update_account_role(
    client: AsyncClient, admin_user: Account, default_user: Account
):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)

    response = await client.patch(
        f"/api/v1/auth/accounts/{from_uuid(default_user.id)}",
        headers={"Authorization": token.authorization},
        json={"role": "reviewer"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["role"] == "reviewer"


async def test_admin_cannot_update_own_role(client: AsyncClient, admin_user: Account):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)

    response = await client.patch(
        f"/api/v1/auth/accounts/{from_uuid(admin_user.id)}",
        headers={"Authorization": token.authorization},
        json={"role": "support"},
    )

    assert response.status_code == 400


async def test_auth_login_invalid_email(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/login",
        json={"name": "foo", "email": "foo.bar", "password": "12345678"},
    )

    assert response.status_code == 400
    result = response.json()
    assert not result["success"]

    error = result["error"]["message"]
    assert "Validation error" == error


async def test_auth_logout_logged_in(
    client: AsyncClient,
    default_user: Account,
):
    token = create_access_token(default_user.id, default_user.email, default_user.role)

    response = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": token.authorization},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["success"]

    profile = await client.post(
        "/api/v1/auth/me",
        headers={"Authorization": token.authorization},
    )
    assert profile.status_code == 401


async def test_auth_logout_not_logged_in(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/logout",
    )

    assert response.status_code == 401
    result = response.json()
    assert not result["success"]


async def test_auth_get_account_by_admin(client: AsyncClient, admin_user: Account):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)

    response = await client.get(
        "/api/v1/auth/accounts/" + from_uuid(admin_user.id),
        headers={"Authorization": token.authorization},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["success"]


async def test_auth_get_account_by_user(client: AsyncClient, default_user: Account):
    token = create_access_token(default_user.id, default_user.email, default_user.role)

    response = await client.get(
        "/api/v1/auth/accounts/" + from_uuid(default_user.id),
        headers={"Authorization": token.authorization},
    )

    assert response.status_code == 401
    result = response.json()
    assert not result["success"]


async def test_auth_get_account_by_guest(client: AsyncClient):
    response = await client.get(
        "/api/v1/auth/accounts/2JWYA8EPvheESx7NN3PGBj",
    )

    assert response.status_code == 401
    result = response.json()
    assert not result["success"]


async def test_auth_update_account_by_admin(
    client: AsyncClient, admin_user: Account, default_user: Account
):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)
    response = await client.patch(
        "/api/v1/auth/accounts/" + from_uuid(default_user.id),
        headers={"Authorization": token.authorization},
        json={"name": "updated"},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["success"]
    data = result["data"]
    assert data["name"] == "updated"


async def test_auth_update_account_by_user(client: AsyncClient, default_user: Account):
    token = create_access_token(default_user.id, default_user.email, default_user.role)
    response = await client.patch(
        "/api/v1/auth/accounts/" + from_uuid(default_user.id),
        headers={"Authorization": token.authorization},
        json={"name": "updated"},
    )

    assert response.status_code == 401
    result = response.json()
    assert not result["success"]


async def test_auth_update_system_account_by_admin(
    client: AsyncClient,
    admin_user: Account,
    system_user: Account,
):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)
    response = await client.patch(
        "/api/v1/auth/accounts/" + from_uuid(system_user.id),
        headers={"Authorization": token.authorization},
        json={"name": "updated"},
    )

    assert response.status_code == 400
    result = response.json()
    assert not result["success"]


async def test_auth_update_missing_account_by_admin(
    client: AsyncClient,
    admin_user: Account,
):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)
    response = await client.patch(
        "/api/v1/auth/accounts/2JWYA8EPvheESx7NN3PGBj",
        headers={"Authorization": token.authorization},
        json={"name": "updated"},
    )

    assert response.status_code == 404
    result = response.json()
    assert not result["success"]


async def test_auth_update_account_by_guest(client: AsyncClient):
    response = await client.patch(
        "/api/v1/auth/accounts/2JWYA8EPvheESx7NN3PGBj",
    )

    assert response.status_code == 401
    result = response.json()
    assert not result["success"]


async def test_auth_delete_account_by_admin(client: AsyncClient, admin_user: Account):
    token = create_access_token(admin_user.id, admin_user.email, admin_user.role)
    response = await client.delete(
        "/api/v1/auth/accounts/2JWYA8EPvheESx7NN3PGBj",
        headers={"Authorization": token.authorization},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["success"]


async def test_auth_delete_account_by_guest(client: AsyncClient):
    response = await client.delete(
        "/api/v1/auth/accounts/2JWYA8EPvheESx7NN3PGBj",
    )

    assert response.status_code == 401
    result = response.json()
    assert not result["success"]
