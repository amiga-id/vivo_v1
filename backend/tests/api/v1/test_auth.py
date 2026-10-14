from datetime import UTC, datetime

from httpx import (
    AsyncClient,
)
from pytest import mark

from app.core.sid import from_uuid
from app.models.account import Account
from app.services.auth import create_access_token

pytestmark = mark.asyncio(loop_scope="session")


async def test_auth_register_success(client: AsyncClient):
    name = "Newton"
    email = "newton@example.com"
    password = "12345678"  # noqa: S105

    response = await client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": password},
    )

    assert response.status_code == 201

    result = response.json()
    assert result["success"]

    data = result["data"]
    assert data["id"] is not None
    assert data["name"] is not name
    assert data["email"] is not email


async def test_auth_register_failed(client: AsyncClient, default_user: Account):
    response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Newton", "email": default_user.email, "password": "87654321"},
    )

    assert response.status_code == 409
    result = response.json()
    assert not result["success"]

    error = result["error"]["message"]
    assert "Email already registered" == error


async def test_auth_register_invalid_email(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register",
        json={"name": "foo", "email": "foo.bar", "password": "12345678"},
    )

    assert response.status_code == 400
    result = response.json()
    assert not result["success"]

    error = result["error"]["message"]
    assert "Validation error" == error


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
