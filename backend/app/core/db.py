from collections.abc import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
)
from sqlalchemy.orm import (
    declarative_base,
    sessionmaker,
)

from app.core.config import settings

engine = create_async_engine(
    str(settings.APP_DATABASE_URL),
    pool_pre_ping=True,
    connect_args={
        "statement_cache_size": 0,  # Highly recommended for production stability
    },
)

SessionLocal = sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession]:
    db: AsyncSession = SessionLocal()

    try:
        yield db
    except Exception:
        await db.rollback()
        raise
    finally:
        await db.close()


async def init_db(session: AsyncSession, drop_db: bool = False) -> None:
    import app.models

    async with engine.begin() as conn:
        if drop_db:
            await conn.run_sync(Base.metadata.drop_all)

        await conn.run_sync(Base.metadata.create_all)

    query = select(app.models.Account).where(
        app.models.Account.email == settings.APP_SYSTEM_USER_EMAIL
    )
    result = await session.execute(query)
    account = result.scalar_one_or_none()

    if account is None:  # pragma: no branch
        from app.services import auth

        await auth.create_account(
            session=session,
            name=settings.APP_SYSTEM_USER_NAME,
            email=settings.APP_SYSTEM_USER_EMAIL,
            password=settings.APP_SYSTEM_USER_PASSWORD,
            role=app.models.AccountRole.SYSTEM,
        )
