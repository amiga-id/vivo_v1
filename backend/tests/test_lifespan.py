from asgi_lifespan import LifespanManager
from httpx import (
    ASGITransport,
    AsyncClient,
)
from pytest import mark

from app.main import (
    app,
    state,
)

pytestmark = mark.asyncio

HEALTH_CHECK_PATH = "app.main.check_postgres_health"


async def test_lifespan():
    assert "start" not in state

    async with LifespanManager(app) as manager:
        assert isinstance(state["start"], float)

        start = state["start"]
        async with AsyncClient(
            transport=ASGITransport(app=manager.app), base_url="http://test"
        ) as ac:
            response = await ac.get("/")
            assert response.status_code == 200
            assert str(start) in response.content.decode("utf-8")

    assert "start" not in state
