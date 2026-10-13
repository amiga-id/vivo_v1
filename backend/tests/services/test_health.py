from unittest.mock import (
    AsyncMock,
    patch,
)

from pytest import mark
from sqlalchemy.ext.asyncio import (
    AsyncSession,
)

from app.services.health import check_postgres_health

pytestmark = mark.asyncio


async def test_check_postgres_health_function():
    """Testing the check_postgres_health function directly."""

    result = await check_postgres_health()
    assert result is True


async def test_check_postgres_health_function_exception():
    """Testing the check_postgres_health function with exception."""

    with patch.object(AsyncSession, "execute", new_callable=AsyncMock) as mock_execute:
        mock_execute.side_effect = Exception("Not responding")

        result = await check_postgres_health()

    assert result is False
