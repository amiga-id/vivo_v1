from unittest.mock import (
    AsyncMock,
    patch,
)

from pytest import (
    mark,
    raises,
)
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
)

from app.core.db import (
    get_db,
    init_db,
)

pytestmark = mark.asyncio(loop_scope="session")


async def test_init_db(test_engine: AsyncEngine, db_session: AsyncSession, test_users):
    """Inspect the test database to confirm tables exist."""

    async with test_engine.connect() as conn:
        actual = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).get_table_names()
        )

    # add expected tables in database
    expected = [
        "account",
    ]

    assert len(actual) >= len(expected)
    assert set(expected).issubset(set(actual))

    await init_db(db_session)

    from app.models.account import Account, AccountRole

    query = select(Account).filter(Account.role == AccountRole.SYSTEM)
    result = await db_session.execute(query)
    admins = result.all()[0]

    assert len(admins) == 1
    assert admins[0].email == test_users["system_user"].email


async def test_get_db_yields_session():
    """Ensure that `get_db` yields a session and closes it at the end."""

    generator = get_db()
    db_session = await anext(generator)
    assert isinstance(db_session, AsyncSession)

    with raises(StopAsyncIteration):
        await anext(generator)


async def test_get_db_rolls_back_on_exception(mocker):
    """Ensure that `get_db` performs a rollback if an exception occurs
    within the try block."""

    mock_session = AsyncMock(spec=AsyncSession)

    with patch("app.core.db.SessionLocal", return_value=mock_session):
        generator = get_db()
        _ = await anext(generator)

        with raises(ValueError, match="Dummy error"):
            await generator.athrow(ValueError("Dummy error"))

        mock_session.rollback.assert_awaited_once()
        mock_session.close.assert_awaited_once()
