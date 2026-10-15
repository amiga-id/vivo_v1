"""
AMIGA Backend – FastAPI
Legacy chatbot API; the database-backed application API is in app.main.
Provides:
  POST /api/chat   – in-app chatbot (Amazon Bedrock Claude)
  GET  /api/health – health check

Telegram bot runs as a background task via python-telegram-bot.

Run the application API from the repository root:
  uv run --directory backend fastapi dev --port 8001
"""
import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("amiga")

# ── Config ──────────────────────────────────────────────────
AWS_REGION       = os.getenv("AWS_REGION", "ap-southeast-1")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0")
TELEGRAM_TOKEN   = os.getenv("TELEGRAM_BOT_TOKEN", "")
FRONTEND_ORIGIN  = os.getenv("FRONTEND_ORIGIN", "http://localhost:3001")

# ── Bedrock client ──────────────────────────────────────────
try:
    bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)
    BEDROCK_OK = True
except Exception as e:
    log.warning("Bedrock client init failed: %s — using offline fallback", e)
    BEDROCK_OK = False


# ── System prompt ────────────────────────────────────────────
SYSTEM_PROMPT = """You are the AMIGA Intake Assistant — a helpful, bilingual (Indonesian and English) AI assistant for the AMIGA document intake platform.

AMIGA is used by Indonesian companies to handle invoice processing: upload → AI extraction → Finance review → voucher issuance.

Key facts you can share (public information):
- Roles: Intake Support (upload docs), Finance Reviewer (review & approve), Service Lead (assign clients, monitor workload), System Admin (manage users/clients).
- Document flow: Upload PDF → Robot Admin extracts data → Finance Reviewer reviews → if approved, voucher is issued; if issues, returned to Intake Support.
- Tax types supported: PPN (added), PPh 21, PPh 22, PPh 23, PPh 4 ayat 2, PPh 26 (withheld from DPP).
- Voucher number format: VCH-[CLIENT_CODE]-[SEQUENCE] e.g. VCH-MJ-0008.
- Document statuses: Diproses, Dalam Review, Dikembalikan, Disetujui, Ditolak.
- Client assignment: Service Lead assigns which clients each Intake Support handles.

You do NOT have access to real-time document data, user accounts, or financial figures.
You can give general guidance and estimates.

Always respond in the same language the user writes in. If mixed, respond bilingually.
Be concise but friendly. Keep responses under 150 words unless more detail is genuinely needed."""


def offline_fallback(user_message: str) -> str:
    """Simple keyword-based fallback when Bedrock is unavailable."""
    m = user_message.lower()
    if any(w in m for w in ["voucher"]):
        return ("Voucher diterbitkan otomatis setelah Finance Reviewer menyetujui dokumen. "
                "Anda bisa mengunduh PDF-nya dari tab Voucher.\n\n"
                "A voucher is issued automatically after the Finance Reviewer approves the document.")
    if any(w in m for w in ["upload", "unggah"]):
        return ("Buka tab Unggah, pilih file PDF invoice, isi metadata, pilih pajak, lalu kirim ke Finance.\n\n"
                "Open the Upload tab, select a PDF invoice, fill metadata, pick applicable taxes, then submit.")
    if any(w in m for w in ["pajak", "tax", "ppn", "pph"]):
        return ("Pajak tersedia: PPN (ditambah ke DPP), PPh 21, 22, 23, PPh 4 ayat 2, PPh 26 (dipotong dari DPP).\n\n"
                "Available taxes: PPN (added to DPP), PPh 21/22/23/4(2)/26 (withheld from DPP).")
    if any(w in m for w in ["status"]):
        return ("Status dokumen: Diproses → Dalam Review → Disetujui/Dikembalikan/Ditolak.\n\n"
                "Document statuses: Processing → Under Review → Approved/Returned/Rejected.")
    if any(w in m for w in ["klien", "client", "perusahaan", "company"]):
        return ("Klien ditambahkan oleh System Admin. Service Lead lalu menugaskan klien ke Intake Support.\n\n"
                "Clients are added by System Admin. Service Lead assigns them to Intake Support staff.")
    return ("Maaf, coba tanyakan tentang: voucher, upload, pajak, status, atau klien.\n\n"
            "Sorry, try asking about: voucher, upload, taxes, status, or clients.")


async def bedrock_chat(messages: list[dict]) -> str:
    """Call Amazon Bedrock Converse API with Claude."""
    if not BEDROCK_OK:
        return offline_fallback(messages[-1].get("content", ""))
    try:
        converse_msgs = [
            {"role": m["role"], "content": [{"text": m["content"]}]}
            for m in messages
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]
        response = bedrock.converse(
            modelId=BEDROCK_MODEL_ID,
            system=[{"text": SYSTEM_PROMPT}],
            messages=converse_msgs,
            inferenceConfig={"maxTokens": 512, "temperature": 0.4},
        )
        return response["output"]["message"]["content"][0]["text"]
    except (BotoCoreError, ClientError) as e:
        log.error("Bedrock error: %s", e)
        return offline_fallback(messages[-1].get("content", ""))


# ── Telegram Bot ─────────────────────────────────────────────
telegram_app = None

async def start_telegram():
    global telegram_app
    if not TELEGRAM_TOKEN:
        log.info("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled.")
        return
    try:
        from telegram import Update
        from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

        async def start_cmd(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
            await update.message.reply_text(
                "Halo! Saya asisten AMIGA 👋\n\n"
                "Hello! I'm the AMIGA assistant 👋\n\n"
                "Tanyakan tentang voucher, upload, pajak, atau status dokumen.\n"
                "Ask me about vouchers, uploads, taxes, or document status."
            )

        async def handle_msg(update: Update, _ctx: ContextTypes.DEFAULT_TYPE):
            if not update.message or not update.message.text:
                return
            user_text = update.message.text
            reply = await bedrock_chat([{"role": "user", "content": user_text}])
            await update.message.reply_text(reply)

        telegram_app = (
            Application.builder()
            .token(TELEGRAM_TOKEN)
            .build()
        )
        telegram_app.add_handler(CommandHandler("start", start_cmd))
        telegram_app.add_handler(CommandHandler("help",  start_cmd))
        telegram_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_msg))

        await telegram_app.initialize()
        await telegram_app.start()
        await telegram_app.updater.start_polling(allowed_updates=Update.ALL_TYPES)
        log.info("Telegram bot started.")
    except ImportError:
        log.warning("python-telegram-bot not installed — skipping Telegram bot.")
    except Exception as e:
        log.error("Telegram bot error: %s", e)


async def stop_telegram():
    global telegram_app
    if telegram_app:
        try:
            await telegram_app.updater.stop()
            await telegram_app.stop()
            await telegram_app.shutdown()
        except Exception as e:
            log.error("Error stopping Telegram bot: %s", e)


# ── FastAPI app ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    asyncio.create_task(start_telegram())
    yield
    await stop_telegram()


app = FastAPI(title="AMIGA Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ───────────────────────────────────────────────────
class ChatRequest(BaseModel):
    messages: list[dict]  # [{"role": "user"|"assistant", "content": "..."}]


class ChatResponse(BaseModel):
    reply: str


# ── Routes ───────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "bedrock": BEDROCK_OK,
        "telegram": bool(TELEGRAM_TOKEN),
        "model": BEDROCK_MODEL_ID,
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not req.messages:
        raise HTTPException(400, "messages must not be empty")
    # Limit history to last 10 turns to keep cost low
    history = req.messages[-10:]
    reply = await bedrock_chat(history)
    return ChatResponse(reply=reply)
