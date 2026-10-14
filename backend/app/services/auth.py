from datetime import (
    UTC,
    datetime,
    timedelta,
)
from typing import Annotated
from uuid import UUID

from bcrypt import (
    checkpw,
    gensalt,
    hashpw,
)
from fastapi import Depends
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from jwt import (
    ExpiredSignatureError,
    InvalidTokenError,
    decode,
    encode,
)
from sqlalchemy import (
    desc,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.paging import resolve_paging
from app.core.sid import from_uuid, to_uuid
from app.models.account import Account, AccountRole
from app.schemas.auth import (
    AccountFilterRequest,
    AccountResponse,
    AccountUpdateRequest,
    AuthToken,
)
from app.schemas.response import PagedRequest


class AuthenticationError(Exception):
    """Exception raised when authentication process failed."""

    pass


def hash_password(plain_password: str) -> str:
    """Hash a plain-text password using bcrypt. Returns the hash as a UTF-8 string."""

    salt = gensalt()
    hashed = hashpw(plain_password.encode("utf-8"), salt)

    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if plain_password matches the stored bcrypt hash."""
    return checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def create_access_token(
    id: UUID,
    email: str,
    role: str = AccountRole.SUPPORT,
) -> AuthToken:
    """Create a signed JWT containing the user's id and email."""

    exp = datetime.now(UTC) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": from_uuid(id), "email": email, "role": role, "exp": exp}

    access_token = encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )

    # Return access_token with its type and expiration time
    return AuthToken(
        access_token=access_token,
        token_type="bearer",  # noqa: S106
        expires=exp.isoformat().replace("+00:00", "Z"),
    )


def from_account(entry: Account) -> AccountResponse:
    return AccountResponse(
        id=from_uuid(entry.id),
        name=entry.name,
        email=entry.email,
        email_verified=entry.email_verified,
        phone_number=entry.phone_number,
        phone_verified=entry.phone_verified,
        avatar_url=entry.avatar_url,
        avatar_provider=entry.avatar_provider or "local",
        about=entry.about,
        created_at=entry.created_at_iso,
        updated_at=entry.updated_at_iso,
    )


async def create_account(
    session: Annotated[AsyncSession, Depends(get_db)],
    name: str,
    email: str,
    password: str,
    role: AccountRole = AccountRole.SUPPORT,
) -> Account:
    """
    Create and persist a new Account.

    Raises ValueError if the email is already taken.
    The caller is responsible for managing the session lifecycle.
    """
    result = await session.execute(
        select(Account).where(Account.email == email).limit(1)
    )
    existing = result.scalars().first()

    if existing:
        raise ValueError("Email already registered")

    account = Account(
        name=name,
        email=email,
        email_verified=role == AccountRole.SYSTEM,
        password_hash=hash_password(password),
        role=role,
    )
    session.add(account)

    await session.commit()
    await session.refresh(account)

    return account


async def login_account(
    session: Annotated[AsyncSession, Depends(get_db)],
    email: str,
    password: str,
) -> AuthToken:
    """
    Validate credentials and return a JWT token response.

    Returns {"access_token": "...", "token_type": "bearer"}.
    Raises ValueError on invalid email or wrong password.
    """

    result = await session.execute(
        select(Account).where(Account.email == email).limit(1)
    )
    account = result.scalars().first()

    if account is None or not verify_password(password, account.password_hash):
        raise AuthenticationError("Invalid email or password")

    token = create_access_token(account.id, account.email, account.role)

    if token is not None:
        account.last_login = datetime.now(UTC)
        await session.commit()

    return token


async def logout_account(
    session: Annotated[AsyncSession, Depends(get_db)], id: UUID
) -> AuthToken:
    await session.execute(
        update(Account).where(Account.id == id).values(last_logout=datetime.now(UTC))
    )


async def current_account(
    session: Annotated[AsyncSession, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())],
) -> Account:
    """
    FastAPI dependency — decode the Bearer JWT and return the matching User.
    Raises HTTP 401 if the token is missing, invalid, or expired.
    """

    try:
        token = credentials.credentials

        payload = decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        account_id = to_uuid(payload["sub"])
        account = await session.get(Account, account_id)

    except (ExpiredSignatureError, InvalidTokenError, KeyError) as exc:
        raise AuthenticationError("Invalid or expired token") from exc

    if account is None:
        raise AuthenticationError("Invalid or expired token")

    return account


async def filter_accounts(
    session: Annotated[AsyncSession, Depends(get_db)],
    filter: PagedRequest[AccountFilterRequest] | None = None,
) -> tuple[list[AccountResponse], int]:
    query = select(Account).order_by(desc(Account.created_at))
    if filter and filter.query:
        query = query.where(
            or_(
                Account.name.ilike(f"%{filter.query}%"),
                Account.email.ilike(f"%{filter.query}%"),
            )
        )

    total = await session.scalar(
        query.with_only_columns(func.count(Account.id)).order_by(None)
    )

    size, offset = resolve_paging(filter and filter.page)
    result = await session.scalars(query.limit(size).offset(offset))
    data = [from_account(entry) for entry in result.all()]

    return [data, total]


async def find_account(
    session: Annotated[AsyncSession, Depends(get_db)],
    id: str | UUID,
) -> AccountResponse | None:
    uuid = id if isinstance(id, UUID) else to_uuid(id)
    entry = await session.get(Account, uuid)

    return from_account(entry) if entry is not None else None


async def update_account(
    session: Annotated[AsyncSession, Depends(get_db)],
    id: str | UUID,
    updates: AccountUpdateRequest,
) -> tuple[bool, AccountResponse | None]:
    uuid = id if isinstance(id, UUID) else to_uuid(id)
    entry = await session.get(Account, uuid)

    if entry is None:
        return [True, None]

    if entry.role == AccountRole.SYSTEM:
        return [False, entry]

    update = updates.model_dump(exclude_unset=True)
    for key, value in update.items():
        if key == "phone_number" and value != getattr(entry, key):
            entry.phone_verified = False

        if key == "avatar_url" and value != getattr(entry, key) and value != "":
            entry.avatar_provider = "global"

        setattr(entry, key, value)

    session.commit()
    session.refresh(entry)

    return [True, from_account(entry)]


async def remove_account(
    session: Annotated[AsyncSession, Depends(get_db)], id: str | UUID
) -> tuple[bool, Account]:
    uuid = id if isinstance(id, UUID) else to_uuid(id)
    entry = await session.get(Account, uuid)

    if entry is None:
        return [True, None]

    if entry.role == AccountRole.SYSTEM:
        return [False, entry]

    session.delete(entry)
    session.commit()

    return [True, entry]
