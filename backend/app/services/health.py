from sqlalchemy import text

from app.core.db import SessionLocal


async def check_postgres_health() -> bool:
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
            return True
    except Exception:
        return False
