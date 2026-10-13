from asyncio import sleep
from unittest.mock import (
    AsyncMock,
    patch,
)

from httpx import AsyncClient
from pytest import mark
from sqlalchemy.ext.asyncio import (
    AsyncSession,
)

pytestmark = mark.asyncio

HEALTH_CHECK_PATH = "app.main.check_postgres_health"


async def test_health_endpoint_success(client: AsyncClient):
    """Testing the /health endpoint when all database systems are healthy (Online)."""

    with patch(HEALTH_CHECK_PATH, new_callable=AsyncMock) as mock_check:
        mock_check.return_value = True

        response = await client.get("/health")

    # The status code validation must be 200 OK.
    assert response.status_code == 200

    # JSON Data Content Validation (Response Body)
    data = response.json()
    assert data["status"] == "pass"
    assert data["database"] == "online"

    # Anti-cache HTTP header validation is mandatory and must be correct.
    assert (
        response.headers["cache-control"]
        == "no-store, no-cache, must-revalidate, max-age=0"
    )
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["expires"] == "0"


async def test_health_endpoint_database_offline(client: AsyncClient):
    """Testing the /health endpoint when the database is down or broken (offline)."""

    with patch(HEALTH_CHECK_PATH, new_callable=AsyncMock) as mock_check:
        mock_check.return_value = False

        response = await client.get("/health")

    # The status code validation must be 503 Service Unavailable.
    assert response.status_code == 503

    # Validate JSON data content when unhealthy
    data = response.json()
    assert data["status"] == "fail"
    assert data["database"] == "offline"

    # Anti-cache headers must still be sent even if the status is error/503.
    assert (
        response.headers["cache-control"]
        == "no-store, no-cache, must-revalidate, max-age=0"
    )


async def test_health_endpoint_timeout(client: AsyncClient):
    """Testing the /health endpoint when the database is slow or hung,
    to the point of triggering a timeout."""

    async def slow_check():
        await sleep(5.0)
        return True

    with patch(HEALTH_CHECK_PATH, side_effect=slow_check):
        response = await client.get("/health")

    # Must return a 503 because it was cut off by asyncio.timeout(2.0)
    assert response.status_code == 503

    data = response.json()
    assert data["status"] == "fail"


async def test_health_endpoint_exception(client: AsyncClient):
    """Testing the endpoint when the `SELECT 1` query fails."""

    with patch.object(AsyncSession, "execute", new_callable=AsyncMock) as mock_execute:
        mock_execute.side_effect = Exception("Not responding")

        response = await client.get("/health")

    assert response.status_code == 503
    assert response.json()["status"] == "fail"
