from unittest.mock import (
    AsyncMock,
    patch,
)

from httpx import (
    AsyncClient,
)
from pytest import mark

pytestmark = mark.asyncio

HEALTH_CHECK_PATH = "app.main.check_postgres_health"


async def test_home_endpoint_success(client: AsyncClient):
    """Testing the / endpoint."""

    with patch(HEALTH_CHECK_PATH, new_callable=AsyncMock) as mock_check:
        mock_check.return_value = True

        response = await client.get("/")

    # The status code validation must be 200 OK.
    assert response.status_code == 200
    assert len(response.content) > 0


async def test_favicon_endpoint_success(client: AsyncClient):
    """Testing the / endpoint."""

    with patch(HEALTH_CHECK_PATH, new_callable=AsyncMock) as mock_check:
        mock_check.return_value = True

        response = await client.get("/favicon.ico")

    # The status code validation must be 200 OK.
    assert response.status_code == 200
    assert len(response.content) > 0
