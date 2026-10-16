from datetime import UTC, datetime
from uuid import UUID

from pytest import (
    mark,
    raises,
)

from app.core.config import settings
from app.models.account import Account, AccountRole
from app.schemas.auth import AccountFilterRequest, AccountUpdateRequest
from app.schemas.response import PagedRequest
from app.services.auth import (
    AuthenticationError,
    create_account,
    filter_accounts,
    find_account,
    from_account,
    hash_password,
    login_account,
    remove_account,
    update_account,
    verify_password,
)

pytestmark = mark.asyncio(loop_scope="session")


async def test_create_account(db_session):
    name = "Alice"
    email = "alice@example.com"
    abcde = "12345678"

    account = await create_account(db_session, name, email, abcde)

    # Assert: Verify the user was saved and assigned an ID
    saved_account: Account = await db_session.get(Account, account.id)

    assert saved_account is not None
    assert saved_account.id == account.id
    assert saved_account.name == name
    assert saved_account.email == email
    assert saved_account.role == AccountRole.SUPPORT
    assert verify_password(abcde, saved_account.password_hash)


async def test_create_account_with_same_email(db_session):
    account = await create_account(db_session, "Bob", "bob@example.com", "12345678")

    assert account is not None
    assert account.id is not None

    with raises(ValueError) as exc:
        _ = await create_account(db_session, "Bobby", "bob@example.com", "11223344")

    assert exc.type is ValueError
    assert "Email already registered" in str(exc.value)


async def test_login_account_success(db_session, default_user, test_password):
    token = await login_account(db_session, default_user.email, test_password)

    assert token is not None
    assert token.access_token is not None
    assert token.token_type == "bearer"  # noqa: S105
    assert datetime.fromisoformat(token.expires) > datetime.now(UTC)


async def test_login_account_failed(db_session):
    with raises(AuthenticationError) as exc:
        _ = await login_account(db_session, "foo-bar@example.com", "87654321")

    assert exc.type is AuthenticationError
    assert "Invalid email or password" in str(exc.value)


async def test_filter_account(db_session):
    [data, total] = await filter_accounts(db_session, None)

    assert data is not None
    assert total is not None


async def test_configured_system_email_is_admin_and_hidden_from_account_list(
    db_session, monkeypatch
):
    email = "configured-superadmin@example.com"
    monkeypatch.setattr(settings, "APP_SYSTEM_USER_EMAIL", email)
    [before, before_total] = await filter_accounts(db_session, None)
    account = Account(
        name="Configured Superadmin",
        email=email,
        password_hash=hash_password("12345678"),
        role=AccountRole.REVIEWER,
    )
    db_session.add(account)
    await db_session.commit()

    try:
        [accounts, total] = await filter_accounts(db_session, None)

        assert account.is_admin
        assert from_account(account).role == AccountRole.SYSTEM
        assert email not in {entry.email for entry in accounts}
        assert total == before_total
        assert before is not None
    finally:
        await db_session.delete(account)
        await db_session.commit()


async def test_filter_account_with_query(db_session):
    [data, total] = await filter_accounts(
        db_session, PagedRequest[AccountFilterRequest](query="j")
    )

    assert data is not None
    assert total is not None


async def test_find_account(db_session, default_user):
    data = await find_account(db_session, default_user.id)

    assert data is not None


async def test_update_account(db_session, default_user):
    [success, data] = await update_account(
        db_session, default_user.id, AccountUpdateRequest(name="updated")
    )

    assert success
    assert data is not None
    assert data.name == "updated"
    assert data.updated_at is not None


async def test_update_account_phone_number(db_session, default_user):
    [success, data] = await update_account(
        db_session,
        default_user.id,
        AccountUpdateRequest(
            phone_number="628567890123",
        ),
    )

    assert success
    assert data is not None
    assert data.phone_number == "628567890123"
    assert not data.phone_verified


async def test_update_account_avatar_url(db_session, default_user):
    [success, data] = await update_account(
        db_session,
        default_user.id,
        AccountUpdateRequest(
            avatar_url="http://example.com/avatars/foo_bar",
        ),
    )

    assert success
    assert data is not None
    assert data.avatar_url == "http://example.com/avatars/foo_bar"
    assert data.avatar_provider == "global"


async def test_update_missing_account(db_session):
    [success, data] = await update_account(
        db_session,
        UUID("00000000-0000-0000-0000-000000000000"),
        AccountUpdateRequest(name="updated"),
    )

    assert success
    assert data is None


async def test_update_system_account(db_session, system_user):
    [success, data] = await update_account(
        db_session,
        system_user.id,
        AccountUpdateRequest(name="updated"),
    )

    assert not success
    assert data is not None


async def test_remove_account(db_session, default_user):
    [success, removed] = await remove_account(db_session, default_user.id)

    assert success
    assert removed is not None


async def test_remove_missing_account(db_session):
    [success, removed] = await remove_account(
        db_session, UUID("00000000-0000-0000-0000-000000000000")
    )

    assert success
    assert removed is None


async def test_remove_system_account(db_session, system_user):
    [success, removed] = await remove_account(db_session, system_user.id)

    assert not success
    assert removed is not None
