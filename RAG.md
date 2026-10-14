# AMIGA RAG Pipeline & Agent

RAG (Retrieval-Augmented Generation) agent untuk AMIGA Assistant yang menggabungkan vector search dengan LLM untuk menjawab pertanyaan.

## Struktur File

```
AMIGA/
├── RAG.py              # Main RAG pipeline & agent
├── RAG.md              # Dokumentasi RAG
├── backend/
│   └── app/
│       └── api/
│           └── v1/
│               └── rag.py  # FastAPI endpoints untuk RAG
└── tesbed/             # Testing directory
    ├── RAG.py
    ├── api.py
    └── test_bedrock.py
```

## Cara Menggunakan

### 1. RAG Agent (Python)

```python
from RAG import ask_agent, agent

# Ask question
response = ask_agent("Bagaimana cara upload invoice?")

print(response["query"])
print(response["response"])
print(response["retrieved_docs"])
```

### 2. API Endpoint

Jalankan backend server:
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Test endpoint:
```bash
curl -X POST http://localhost:8000/api/v1/ask-agent \
  -H "Content-Type: application/json" \
  -d '{"query": "Bagaimana cara upload invoice?", "top_k": 3}'
```

Response:
```json
{
  "query": "Bagaimana cara upload invoice?",
  "response": "Untuk upload invoice...",
  "retrieved_docs": 3,
  "top_scores": [0.85, 0.72, 0.68],
  "context_used": true,
  "top_documents": ["Dokumen teratas..."]
}
```

## Komponen RAG Pipeline

### 1. VectorStore
- Menyimpan dokumen dengan embedding
- Menggunakan cosine similarity untuk search
- Generate embedding dengan Amazon Titan

### 2. LLMClient
- Client untuk Claude Sonnet via Bedrock
- Menggunakan system prompt untuk AMIGA assistant

### 3. RAGAgent
- Main class yang menggabungkan semua komponen
- Pre-load 6 dokumen dokumentasi AMIGA

## Dokumen Default

RAG agent sudah include dokumentasi tentang:
1. Overview AMIGA system
2. Peran (Roles) di AMIGA
3. Jenis pajak yang tersedia
4. Workflow approval & rejection
5. Format voucher pengeluaran
6. Sistem penomoran per klien

## Environment Variables

```bash
# Required
BEDROCK_REGION=ap-southeast-1
BEDROCK_MODEL_ID=us.anthropic.claude-3-5-sonnet-20241022-v2:0

# AWS credentials (via ~/.aws/credentials)
```

## Testing

```bash
# Test RAG agent
python RAG.py

# Test API endpoint
cd backend
uvicorn app.main:app --reload

# Test dengan curl
curl http://localhost:8000/api/v1/ask-agent -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "Apa itu AMIGA?"}'
```

## Integrasi dengan Frontend

Untuk integrasi dengan frontend Next.js, buat API route:
```typescript
// app/api/rag/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const response = await fetch('http://localhost:8000/api/v1/ask-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  const data = await response.json();
  return NextResponse.json(data);
}
```
