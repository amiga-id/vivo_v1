from unittest.mock import ANY, AsyncMock
from uuid import uuid4

from pytest import mark, raises
from sqlalchemy.ext.asyncio import AsyncSession

import app.api.v1.rag as rag
from app.api.v1.rag import (
    SYSTEM_PROMPT,
    AskRequest,
    ChatTurn,
    _converse,
    _get_submission_status,
    _run_agent,
    _tools_for,
    _visible_submissions,
)
from app.models.account import Account, AccountRole
from app.services.auth import hash_password


def _account(role: AccountRole) -> Account:
    return Account(
        id=uuid4(),
        name="Agent Test",
        email="agent-test@example.com",
        password_hash=hash_password("agent-test-password"),
        role=role,
    )


def test_chatbot_tools_are_filtered_for_each_application_role():
    role_tools = {
        role: {tool["toolSpec"]["name"] for tool in _tools_for(_account(role))}
        for role in (
            AccountRole.SUPPORT,
            AccountRole.REVIEWER,
            AccountRole.LEAD,
            AccountRole.ADMIN,
        )
    }

    assert role_tools[AccountRole.SUPPORT] == {
        "get_my_submissions",
        "get_submission_status",
        "get_review_history",
        "get_pending_tasks",
    }
    assert role_tools[AccountRole.REVIEWER] == role_tools[AccountRole.SUPPORT]
    assert role_tools[AccountRole.LEAD] == role_tools[AccountRole.SUPPORT]
    assert role_tools[AccountRole.ADMIN] == role_tools[AccountRole.SUPPORT] | {
        "get_dashboard_summary"
    }
    assert "baca-saja" in SYSTEM_PROMPT


def test_submission_queries_bind_scope_to_the_authenticated_account():
    support = _account(AccountRole.SUPPORT)
    reviewer = _account(AccountRole.REVIEWER)

    support_query = _visible_submissions(support)
    reviewer_query = _visible_submissions(reviewer)

    assert support_query.compile().params["uploader_id_1"] == support.id
    assert reviewer_query.compile().params["reviewer_id_1"] == reviewer.id


@mark.asyncio
async def test_invalid_submission_number_is_rejected_before_database_access():
    session = AsyncMock(spec=AsyncSession)

    with raises(ValueError, match="Nomor pengajuan tidak valid"):
        await _get_submission_status(
            session,
            _account(AccountRole.SUPPORT),
            {"request_number": "../../other-user"},
        )

    session.execute.assert_not_awaited()


@mark.asyncio
async def test_agent_supplies_database_knowledge_to_model(monkeypatch):
    user = _account(AccountRole.SUPPORT)
    response_messages = []
    knowledge = ["Unggah invoice: pilih klien, lalu unggah dokumen."]
    retrieve = AsyncMock(return_value=knowledge)
    monkeypatch.setattr(rag, "retrieve_repository_knowledge", retrieve)
    monkeypatch.setattr(
        rag,
        "_converse",
        lambda messages, tools, knowledge: (
            response_messages.append((messages, tools, knowledge))
            or {
                "stopReason": "end_turn",
                "output": {
                    "message": {
                        "content": [{"text": "Pilih klien dan unggah invoice."}]
                    }
                },
            }
        ),
    )

    result = await _run_agent(
        AskRequest(messages=[ChatTurn(role="user", content="Apa SOP upload?")]),
        AsyncMock(spec=AsyncSession),
        user,
    )

    retrieve.assert_awaited_once_with(ANY, "Apa SOP upload?")
    assert result.knowledge_sources == 1
    assert result.reply == "Pilih klien dan unggah invoice."
    assert response_messages[0][2] == knowledge


def test_converse_prompt_discloses_empty_database_results(monkeypatch):
    captured = {}

    def converse(**kwargs):
        captured.update(kwargs)
        return {}

    monkeypatch.setattr(
        rag,
        "_bedrock_client",
        lambda: type("Client", (), {"converse": staticmethod(converse)})(),
    )

    _converse([], [], None)

    assert "Tidak ada dokumen panduan" in captured["system"][-1]["text"]


def test_converse_uses_rag_model_override(monkeypatch):
    captured = {}

    def converse(**kwargs):
        captured.update(kwargs)
        return {}

    monkeypatch.setattr(rag.settings, "BEDROCK_MODEL_ID", "rag-override-model")
    monkeypatch.setattr(rag.settings, "AWS_BEDROCK_MODEL_ID", "apac.test-model")
    monkeypatch.setattr(
        rag,
        "_bedrock_client",
        lambda: type("Client", (), {"converse": staticmethod(converse)})(),
    )

    _converse([], [], None)

    assert captured["modelId"] == "rag-override-model"


def test_converse_falls_back_to_backend_model_when_rag_override_is_missing(
    monkeypatch,
):
    captured = {}

    def converse(**kwargs):
        captured.update(kwargs)
        return {}

    monkeypatch.setattr(rag.settings, "BEDROCK_MODEL_ID", None)
    monkeypatch.setattr(rag.settings, "AWS_BEDROCK_MODEL_ID", "apac.test-model")
    monkeypatch.setattr(
        rag,
        "_bedrock_client",
        lambda: type("Client", (), {"converse": staticmethod(converse)})(),
    )

    _converse([], [], None)

    assert captured["modelId"] == "apac.test-model"
