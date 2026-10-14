# AMIGA RAG Pipeline & API

RAG (Retrieval-Augmented Generation) pipeline untuk AMIGA Assistant dengan FastAPI server.

## Struktur File

```
tesbed/
├── RAG.py          # RAG pipeline dengan embedding generation & LLM
├── api.py          # FastAPI server dengan endpoint /ask-agent
├── requirements.txt
└── README.md
```

## Setup & Installasi

```bash
cd tesbed

# Install dependencies
pip install -r requirements.txt

# Set environment variables (opsional)
export BEDROCK_REGION=ap-southeast-1
export BEDROCK_MODEL_ID=us.anthropic.claude-3-5-sonnet-20241022-v2:0

# Jalankan server
python api.py
# atau
uvicorn api:app --reload --port 8000
```

## Endpoint API

### 1. `/` - Root
```bash
curl http://localhost:8000/
```

### 2. `/ask-agent` - Main Endpoint (POST)
```bash
curl -X POST http://localhost:8000/ask-agent \
  -H "Content-Type: application/json" \
  -d '{"query": "Bagaimana cara upload invoice?", "top_k": 3}'
```

**Request:**
```json
{
  "query": "Pertanyaan Anda",
  "top_k": 3
}
```

**Response:**
```json
{
  "query": "Bagaimana cara upload invoice?",
  "response": "Jawaban dari AI...",
  "retrieved_docs": 3,
  "top_scores": [0.85, 0.72, 0.68],
  "context": "Konteks dokumen yang digunakan..."
}
```

### 3. `/add-document` - Add Document (POST)
```bash
curl -X POST http://localhost:8000/add-document \
  -H "Content-Type: application/json" \
  -d '{"content": "Dokumen baru untuk di-index", "metadata": {"type": "manual"}}'
```

### 4. `/status` - Status Sistem
```bash
curl http://localhost:8000/status
```

## Cara Kerja RAG Pipeline

1. **Embedding Generation**: Query di-embed menggunakan Amazon Titan Embeddings
2. **Vector Search**: Cari dokumen terkait dari database
3. **Context Building**: Gabungkan dokumen teratas sebagai context
4. **LLM Generation**: Claude Sonnet generates response berdasarkan context

## Dokumen Default

RAG pipeline sudah include 5 dokumen pre-loaded:
- Overview AMIGA system
- Informasi jenis pajak
- Workflow rejection
- Format voucher
- Sistem penomoran per klien

## Testing

```python
# Test RAG pipeline langsung
python -c "from RAG import ask_agent; print(ask_agent(' apa itu AMIGA?'))"
```

```python
# Test FastAPI server
python api.py
# Visit http://localhost:8000/docs untuk API docs
```

## Production Deployment

1. Ganti CORS `allow_origins` dengan domain yang valid
2. Gunakan Vector Database (Pinecone, Weaviate, dll)
3. Implement authentication
4. Setup monitoring & logging
5. Environment variables untuk production:
   - `BEDROCK_REGION`
   - `BEDROCK_MODEL_ID`
   - `API_PORT` (default: 8000)

## License

MIT
