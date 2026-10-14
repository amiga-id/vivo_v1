from collections.abc import (
    AsyncGenerator,
    Generator,
)

from httpx import (
    ASGITransport,
    AsyncClient,
)
from pytest_asyncio import fixture
from sqlalchemy import (
    event,
    select,
)
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    create_async_engine,
)
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.db import (
    Base,
    get_db,
)
from app.main import app
from app.models.account import (
    Account,
    AccountRole,
)
from app.services.auth import hash_password


@fixture(scope="session")
def test_password() -> Generator[str]:
    return "12345678"


@fixture(scope="session")
def test_users(test_password: str) -> Generator[dict]:
    return {
        "default_user": Account(
            name="Justin Case",
            email="justin@example.com",
            password_hash=hash_password(test_password),
            role=AccountRole.SUPPORT,
        ),
        "admin_user": Account(
            name="Jack Smith",
            email="jack@example.com",
            password_hash=hash_password(test_password),
            role=AccountRole.ADMIN,
        ),
        "system_user": Account(
            name="John Doe",
            email="john@example.com",
            password_hash=hash_password(test_password),
            role=AccountRole.SYSTEM,
        ),
    }


@fixture(scope="session", autouse=True)
async def test_engine() -> AsyncGenerator[AsyncEngine]:
    """Create the database engine once for the entire testing session."""
    engine = create_async_engine(
        str(settings.TEST_DATABASE_URL),
        pool_pre_ping=True,
        connect_args={
            "statement_cache_size": 0,  # Highly recommended for production stability
        },
    )

    # Tell SQLAlchemy to force all test tables to be UNLOGGED (In-Memory Speed)
    @event.listens_for(Base.metadata, "before_create")
    def insert_unlogged(target, connection, **kw):
        for table in target.tables.values():
            table._prefixes.append("UNLOGGED")

    # Import all our models here
    from app.models import (  # noqa: F401
        account,
    )

    # Clean out any old test data and build fresh tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Clean up tables when all tests finish
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@fixture(scope="session")
async def db_session(test_engine, test_users) -> AsyncGenerator[AsyncSession]:
    """Provides a new, isolated database session for each test function.."""

    TestingSessionLocal = sessionmaker(
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
        bind=test_engine,
    )
    session = TestingSessionLocal()

    try:
        # Add initial data here
        for user in test_users.values():
            session.add(user)

        await session.commit()

        yield session
    finally:
        # Roll back or clean up data after the test function completes
        # to avoid polluting other tests
        await session.rollback()
        await session.close()


@fixture(scope="session")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient]:
    async def _override_get_db():
        try:
            yield db_session
        finally:
            await db_session.close()

    app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@fixture(scope="session")
async def default_user(db_session: AsyncSession, test_users) -> AsyncGenerator[Account]:
    """Default user account."""

    return await db_session.scalar(
        select(Account).where(Account.email == test_users["default_user"].email)
    )


@fixture(scope="session")
async def admin_user(db_session: AsyncSession, test_users) -> AsyncGenerator[Account]:
    """Admin user account."""

    return await db_session.scalar(
        select(Account).where(Account.email == test_users["admin_user"].email)
    )


@fixture(scope="session")
async def system_user(db_session: AsyncSession, test_users) -> AsyncGenerator[Account]:
    """System user account."""

    return await db_session.scalar(
        select(Account).where(Account.email == test_users["system_user"].email)
    )
