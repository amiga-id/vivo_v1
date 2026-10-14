"""
FastAPI Server untuk AMIGA Assistant Agent
Endpoint: /ask-agent untuk query RAG pipeline
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os

# Import RAG pipeline
from RAG import ask_agent, rag_pipeline

# Initialize FastAPI app
app = FastAPI(
    title="AMIGA Assistant API",
    description="RAG-based AI assistant untuk sistem AMIGA intake",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class AskRequest(BaseModel):
    query: str
    top_k: Optional[int] = 3


class AskResponse(BaseModel):
    query: str
    response: str
    retrieved_docs: int
    top_scores: list
    context: Optional[str] = None
    metadata: Optional[Dict] = None


class AddDocumentRequest(BaseModel):
    content: str
    metadata: Optional[Dict] = None


class AddDocumentResponse(BaseModel):
    doc_id: str
    message: str


# Endpoints
@app.get("/")
async def root():
    """Root endpoint dengan informasi API"""
    return {
        "service": "AMIGA Assistant API",
        "version": "1.0.0",
        "endpoints": {
            "/ask-agent": "POST - Ask the agent a question",
            "/add-document": "POST - Add document to RAG index",
            "/status": "GET - Check system status",
            "/docs": "API documentation"
        }
    }


@app.get("/status")
async def status():
    """Health check dan status sistem"""
    return {
        "status": "healthy",
        "model": os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-3-5-sonnet-20241022-v2:0"),
        "region": os.getenv("BEDROCK_REGION", "ap-southeast-1"),
        "documents_indexed": len(rag_pipeline.document_store.documents),
        "timestamp": os.getenv("TIMESTAMP", "N/A")
    }


@app.post("/ask-agent", response_model=AskResponse)
async def ask_agent_endpoint(request: AskRequest):
    """
    Main endpoint untuk pertanyaan ke assistant
    
    Request body:
    - query: Pertanyaan user dalam bahasa Indonesia
    - top_k: Jumlah dokumen terkait yang akan diambil (default: 3)
    
    Response:
    - query: Pertanyaan yang diterima
    - response: Jawaban dari LLM
    - retrieved_docs: Jumlah dokumen yang diretrieval
    - top_scores: Skor similaritas dari dokumen yang diretrieval
    - context: Konteks dokumen yang digunakan (opsional)
    """
    try:
        result = ask_agent(query=request.query, top_k=request.top_k)
        
        response_data = AskResponse(
            query=result["query"],
            response=result["response"],
            retrieved_docs=result["retrieved_docs"],
            top_scores=result["top_scores"],
            context=result.get("context")
        )
        
        return response_data
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing query: {str(e)}"
        )


@app.post("/add-document", response_model=AddDocumentResponse)
async def add_document_endpoint(request: AddDocumentRequest):
    """
    Add document baru ke RAG index
    
    Request body:
    - content: Konten dokumen yang akan di-index
    - metadata: Metadata tambahan (opsional)
    """
    try:
        from RAG import Document, EmbeddingGenerator
        
        # Generate embedding
        embedding_gen = EmbeddingGenerator()
        embedding = embedding_gen.generate_embedding(request.content)
        
        # Create and add document
        document = Document(
            id="",
            content=request.content,
            metadata=request.metadata or {}
        )
        
        doc_id = rag_pipeline.document_store.add_document(document)
        
        return AddDocumentResponse(
            doc_id=doc_id,
            message=f"Document {doc_id} added successfully"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error adding document: {str(e)}"
        )


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


# Run server jika dijalankan langsung
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("API_PORT", "8000"))
    print(f"Starting AMIGA Assistant API on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
