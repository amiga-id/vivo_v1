# AMIGA Backend

FastAPI backend yang menyediakan:
- `POST /api/chat` – Chatbot AI menggunakan Amazon Bedrock (Claude)
- `GET /api/health` – Health check
- Telegram bot (background task, berjalan bersama server)

## Cara menjalankan

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Konfigurasi environment
```bash
cp .env.example .env
# Edit .env: isi AWS credentials, Bedrock model ID, Telegram token
```

### 3. Jalankan server
```bash
uvicorn main:app --reload --port 8000
```

Server berjalan di `http://localhost:8000`.

## Konfigurasi Telegram Bot

1. Buat bot baru di Telegram dengan [@BotFather](https://t.me/BotFather)
2. Salin token yang diberikan ke `TELEGRAM_BOT_TOKEN` di `.env`
3. Restart server — bot langsung aktif

Bot Telegram bisa diakses publik (siapa saja bisa chat), dan menjawab pertanyaan umum tentang AMIGA.

## Konfigurasi Amazon Bedrock

Pastikan:
- AWS credentials dikonfigurasi (`aws configure` atau environment variables)
- Model yang dipilih sudah diaktifkan di Bedrock console (region `ap-southeast-1`)
- Model yang direkomendasikan: `anthropic.claude-3-haiku-20240307-v1:0` (cepat + hemat)

## Deployment

Untuk produksi, jalankan di belakang nginx / AWS ALB dengan:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

Atau deploy ke AWS Lambda menggunakan Mangum:
```python
from mangum import Mangum
handler = Mangum(app)
```

## Endpoint `/api/chat`

```json
POST /api/chat
{
  "messages": [
    {"role": "user", "content": "Bagaimana cara upload dokumen?"}
  ]
}

Response:
{
  "reply": "Buka tab Unggah, pilih file PDF invoice..."
}
```

History percakapan dikirim dari frontend (maksimal 10 pesan terakhir untuk efisiensi biaya).
