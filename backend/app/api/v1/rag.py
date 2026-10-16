import re
from functools import lru_cache
from typing import Annotated, Any, Literal

import boto3
from botocore.config import Config
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.models.account import Account, AccountRole
from app.models.client import RevisionHistory, Submission
from app.schemas.response import ApiResponse
from app.services.auth import current_account
from app.services.knowledge import retrieve_repository_knowledge

router = APIRouter()

SYSTEM_PROMPT = """You are the AMIGA assistant. Answer in the user's language and
be concise. Use relevant AMIGA knowledge retrieved from the application database
when available. You may use only the read-only tools provided for the authenticated
user's role. Never claim to have retrieved records unless a tool returned them.
Do not reveal credentials, password hashes, or data outside the user's role scope.
Use only the read-only tools; all data access is baca-saja.
"""

REQUEST_NUMBER_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$")


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AskRequest(BaseModel):
    messages: list[ChatTurn] = Field(min_length=1, max_length=12)


class AskResponse(BaseModel):
    reply: str
    tools_used: list[str] = Field(default_factory=list)
    knowledge_sources: int = 0


class SQLAskRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)


class SQLAskResponse(BaseModel):
    query: str
    reply: Any


@lru_cache(maxsize=1)
def _bedrock_client():
    config = Config(
        region_name=settings.AWS_REGION,
        connect_timeout=5,
        read_timeout=60,
        retries={"max_attempts": 2},
    )
    client_options = {
        "region_name": settings.AWS_REGION,
        "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
        "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
        "config": config,
    }
    return boto3.client("bedrock-runtime", **client_options)


def _converse(messages: list[dict], tools: list[dict], knowledge: list[str] | None):
    knowledge_context = (
        "\n\nRelevant knowledge from the application database:\n"
        + "\n---\n".join(knowledge)
        if knowledge
        else "\n\nTidak ada dokumen panduan terkait yang ditemukan di database. "
        "Jangan mengarang kebijakan internal yang tidak tersedia."
    )
    request: dict[str, Any] = {
        "modelId": settings.BEDROCK_MODEL_ID or settings.AWS_BEDROCK_MODEL_ID,
        "messages": messages,
        "system": [{"text": SYSTEM_PROMPT + knowledge_context}],
        "inferenceConfig": {"temperature": 0.1, "maxTokens": 1200},
    }
    if tools:
        request["toolConfig"] = {"tools": tools}
    return _bedrock_client().converse(**request)


def _visible_submissions(account: Account):
    query = select(Submission)
    if account.role == AccountRole.SUPPORT:
        return query.where(Submission.uploader_id == account.id)
    if account.role == AccountRole.REVIEWER:
        return query.where(Submission.reviewer_id == account.id)
    return query


def _tool(name: str, description: str, properties: dict[str, Any]) -> dict:
    return {
        "toolSpec": {
            "name": name,
            "description": description,
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": properties,
                    "additionalProperties": False,
                }
            },
        }
    }


def _tools_for(account: Account) -> list[dict]:
    tools = [
        _tool("get_my_submissions", "List submissions visible to this account.", {}),
        _tool(
            "get_submission_status",
            "Get a visible submission by its request number.",
            {"request_number": {"type": "string"}},
        ),
        _tool(
            "get_review_history",
            "List review history for submissions visible to this account.",
            {},
        ),
        _tool(
            "get_pending_tasks",
            "List pending submissions visible to this account.",
            {},
        ),
    ]
    if account.is_admin:
        tools.append(
            _tool(
                "get_dashboard_summary",
                "Get aggregate submission counts by status.",
                {},
            )
        )
    return tools


def _submission_data(submission: Submission) -> dict[str, Any]:
    return {
        "request_number": submission.request_number,
        "status": submission.status,
        "kind": submission.kind,
        "receive_date": (
            submission.receive_date.isoformat() if submission.receive_date else None
        ),
        "due_date": submission.due_date.isoformat() if submission.due_date else None,
        "grand_total": str(submission.grand_total) if submission.grand_total else "0",
    }


async def _get_my_submissions(
    session: AsyncSession, account: Account
) -> list[dict[str, Any]]:
    result = await session.execute(
        _visible_submissions(account).order_by(Submission.created_at.desc()).limit(20)
    )
    return [_submission_data(item) for item in result.scalars().all()]


async def _get_submission_status(
    session: AsyncSession, account: Account, arguments: dict[str, Any]
) -> dict[str, Any] | None:
    request_number = arguments.get("request_number")
    if not isinstance(request_number, str) or not REQUEST_NUMBER_PATTERN.fullmatch(
        request_number
    ):
        raise ValueError("Nomor pengajuan tidak valid.")

    result = await session.execute(
        _visible_submissions(account).where(Submission.request_number == request_number)
    )
    submission = result.scalar_one_or_none()
    return _submission_data(submission) if submission else None


async def _get_review_history(
    session: AsyncSession, account: Account
) -> list[dict[str, Any]]:
    visible_ids = (
        _visible_submissions(account).with_only_columns(Submission.id).subquery()
    )
    result = await session.execute(
        select(
            RevisionHistory.actor_name,
            RevisionHistory.actor_role,
            RevisionHistory.action,
            RevisionHistory.detail,
            RevisionHistory.created_at,
        )
        .join(visible_ids, RevisionHistory.submission_id == visible_ids.c.id)
        .order_by(RevisionHistory.created_at.desc())
        .limit(30)
    )
    return [
        {
            "actor": row.actor_name,
            "role": row.actor_role,
            "action": row.action,
            "detail": row.detail,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in result
    ]


async def _get_pending_tasks(
    session: AsyncSession, account: Account
) -> list[dict[str, Any]]:
    query = _visible_submissions(account).where(
        Submission.status.in_(("Dalam Review", "Perlu Tindakan"))
    )
    result = await session.execute(query.order_by(Submission.due_date.asc()).limit(20))
    return [_submission_data(item) for item in result.scalars().all()]


async def _get_dashboard_summary(session: AsyncSession) -> list[dict[str, Any]]:
    result = await session.execute(
        select(Submission.status, func.count(Submission.id))
        .group_by(Submission.status)
        .order_by(Submission.status)
    )
    return [{"status": status_name, "count": count} for status_name, count in result]


async def _run_tool(
    name: str,
    arguments: dict[str, Any],
    session: AsyncSession,
    account: Account,
) -> Any:
    handlers = {
        "get_my_submissions": lambda: _get_my_submissions(session, account),
        "get_submission_status": lambda: _get_submission_status(
            session, account, arguments
        ),
        "get_review_history": lambda: _get_review_history(session, account),
        "get_pending_tasks": lambda: _get_pending_tasks(session, account),
    }
    if name == "get_dashboard_summary" and account.is_admin:
        return await _get_dashboard_summary(session)
    handler = handlers.get(name)
    if handler is None:
        raise ValueError(f"Tool tidak tersedia: {name}")
    return await handler()


async def _run_agent(
    request: AskRequest, session: AsyncSession, account: Account
) -> AskResponse:
    messages = [
        {"role": turn.role, "content": [{"text": turn.content}]}
        for turn in request.messages[-12:]
    ]
    prompt = next(
        (turn.content for turn in reversed(request.messages) if turn.role == "user"),
        "",
    )
    knowledge = await retrieve_repository_knowledge(session, prompt)
    tools = _tools_for(account)
    tools_used: list[str] = []

    for _ in range(4):
        response = _converse(messages, tools, knowledge)
        assistant_message = response.get("output", {}).get("message", {})
        content = assistant_message.get("content", [])
        tool_uses = [block["toolUse"] for block in content if "toolUse" in block]
        if not tool_uses:
            reply = "\n".join(
                block["text"] for block in content if isinstance(block.get("text"), str)
            ).strip()
            return AskResponse(
                reply=reply or "Maaf, saya belum dapat menyusun jawaban.",
                tools_used=tools_used,
                knowledge_sources=len(knowledge),
            )

        messages.append(assistant_message)
        tool_results = []
        for tool_use in tool_uses:
            name = tool_use["name"]
            value = await _run_tool(name, tool_use.get("input", {}), session, account)
            if name not in tools_used:
                tools_used.append(name)
            tool_results.append(
                {
                    "toolResult": {
                        "toolUseId": tool_use["toolUseId"],
                        "content": [{"json": value}],
                    }
                }
            )
        messages.append({"role": "user", "content": tool_results})

    raise RuntimeError("Asisten melampaui batas iterasi pemanggilan tool.")


@router.post(
    "/rag/ask-agent",
    response_model=ApiResponse[AskResponse],
    response_model_exclude_none=True,
)
async def ask_agent(
    request: AskRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    try:
        result = await _run_agent(request, session, current_user)
        return ApiResponse[AskResponse](success=True, data=result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post(
    "/ask",
    response_model=ApiResponse[SQLAskResponse],
    response_model_exclude_none=True,
)
async def query_database_with_llm(
    request: SQLAskRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Account, Depends(current_account)],
):
    try:
        from app.services.aws_service import query_db

        response = await query_db(
            account_id=current_user.id,
            prompt=request.prompt,
        )
        if not response.success:
            raise ValueError(response.error)
        rows = await session.execute(text(response.data))
        columns = list(rows.keys())
        if len(columns) == 1:
            value = rows.scalar()
        else:
            value = [dict(row) for row in rows.mappings().all()]
        return ApiResponse[SQLAskResponse](
            success=True,
            data=SQLAskResponse(query=response.data, reply=value),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
