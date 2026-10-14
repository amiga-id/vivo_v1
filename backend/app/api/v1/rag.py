"""
RAG API endpoints untuk AMIGA
Endpoint: /ask-agent untuk pertanyaan ke AI assistant
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict

# Import RAG agent dari root
import sys
sys.path.insert(0, '/'.join(__file__.split('/')[:-4]))  # Add parent directory
from RAG import ask_agent, agent

router = APIRouter()


class AskRequest(BaseModel):
    query: str
    top_k: Optional[int] = 3


class AskResponse(BaseModel):
    query: str
    response: str
    retrieved_docs: int
    top_scores: List[float]
    context_used: bool
    top_documents: List[str]


@router.get("/rag/status")
async def rag_status():
    """Status RAG system"""
    return {
        "status": "healthy",
        "documents_indexed": len(agent.vector_store.documents),
        "model": "Claude 3.5 Sonnet",
        "embedding_model": "Amazon Titan"
    }


@router.post("/ask-agent", response_model=AskResponse)
async def ask_agent_endpoint(request: AskRequest):
    """
    Main endpoint untuk pertanyaan ke assistant
    
    Request:
    - query: Pertanyaan user
    - top_k: Jumlah dokumen terkait yang akan diretrieval
    
    Response:
    - query: Pertanyaan yang diterima
    - response: Jawaban dari AI
    - retrieved_docs: Jumlah dokumen diretrieval
    - top_scores: Skor similaritas
    - context_used: Apakah ada context yang digunakan
    - top_documents: Dokumen teratas yang diretrieval
    """
    try:
        result = ask_agent(query=request.query, top_k=request.top_k)
        
        return AskResponse(
            query=result["query"],
            response=result["response"],
            retrieved_docs=result["retrieved_docs"],
            top_scores=result["top_scores"],
            context_used=result["context_used"],
            top_documents=result["top_documents"]
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing query: {str(e)}"
        )


@router.get("/rag/docs")
async def list_docs():
    """List semua dokumen yang di-index"""
    return {
        "documents": [
            {
                "id": doc.id,
                "content": doc.content[:100] + "...",
                "metadata": doc.metadata
            }
            for doc in agent.vector_store.documents.values()
        ]
    }
