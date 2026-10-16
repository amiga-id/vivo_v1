"""Persist Bedrock extraction results in PostgreSQL."""

from typing import Any

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    MetaData,
    String,
    Table,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB, insert


extraction_data = Table(
    "data",
    MetaData(),
    #Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("job_id", String(36), nullable=False, unique=True),
    Column("client_id", BigInteger, nullable=False),
    Column("extraction_result", JSONB, nullable=False),
    Column(
        "created_at",
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    ),
)


def save_extraction_result(
    job_id: str,
    client_id: int,
    extraction_result: dict[str, Any],
) -> None:
    """Create the ``data`` table if needed and save or update this upload's result."""
    try:
        from .database import engine
    except ImportError:
        from database import engine

    with engine.begin() as connection:
        extraction_data.create(connection, checkfirst=True)
        statement = insert(extraction_data).values(
            job_id=job_id,
            client_id=client_id,
            extraction_result=extraction_result,
        )
        statement = statement.on_conflict_do_update(
            index_elements=[extraction_data.c.job_id],
            set_={
                "client_id": client_id,
                "extraction_result": extraction_result,
            },
        )
        connection.execute(statement)


def get_extraction_result(job_id: str) -> dict[str, Any] | None:
    """Return the stored extraction result for an upload job, if it exists."""
    try:
        from .database import engine
    except ImportError:
        from database import engine

    with engine.connect() as connection:
        result = connection.execute(
            select(extraction_data.c.extraction_result).where(
                extraction_data.c.job_id == job_id
            )
        ).scalar_one_or_none()

    if result is None:
        return None
    if not isinstance(result, dict):
        raise RuntimeError("Stored extraction result is not a JSON object")
    return result
