from types import SimpleNamespace
from unittest.mock import AsyncMock

from pytest import mark
from sqlalchemy.dialects.postgresql import dialect
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.knowledge import (
    REPOSITORY_KNOWLEDGE,
    retrieve_repository_knowledge,
    seed_repository_knowledge,
)


@mark.asyncio
async def test_repository_knowledge_search_uses_postgres_full_text_search():
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = SimpleNamespace(
        all=lambda: [
            SimpleNamespace(
                title="Unggah dokumen",
                source="docs/intake.md",
                content="Pilih klien lalu unggah invoice.",
            )
        ]
    )

    documents = await retrieve_repository_knowledge(session, "unggah invoice")

    session.execute.assert_awaited_once()
    statement = session.execute.await_args.args[0]
    compiled = statement.compile(dialect=dialect())
    sql = str(compiled).lower()
    assert "to_tsvector" in sql
    assert "plainto_tsquery" in sql
    assert "ts_rank_cd" in sql
    assert "unggah invoice" in compiled.params.values()
    assert documents == [
        "Unggah dokumen (Sumber: docs/intake.md)\nPilih klien lalu unggah invoice."
    ]


@mark.asyncio
async def test_seed_inserts_repository_documents_idempotently():
    session = AsyncMock(spec=AsyncSession)
    session.execute.return_value = SimpleNamespace(rowcount=len(REPOSITORY_KNOWLEDGE))

    seeded = await seed_repository_knowledge(session)

    session.execute.assert_awaited_once()
    statement = session.execute.await_args.args[0]
    compiled = statement.compile(dialect=dialect())
    assert "on conflict (slug) do nothing" in str(compiled).lower()
    assert seeded == len(REPOSITORY_KNOWLEDGE)
