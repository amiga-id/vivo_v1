"""
AMIGA RAG Pipeline
Pipeline untuk Retrieval-Augmented Generation dengan Amazon Bedrock
"""

import boto3
import json
import hashlib
import os
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime


# AWS Bedrock Configuration
BEDROCK_REGION = os.getenv('BEDROCK_REGION', 'ap-southeast-1')
BEDROCK_MODEL_ID = os.getenv('BEDROCK_MODEL_ID', 'us.anthropic.claude-3-5-sonnet-20241022-v2:0')

# Initialize Bedrock clients
bedrock_runtime = boto3.client(
    service_name='bedrock-runtime',
    region_name=BEDROCK_REGION
)


@dataclass
class Document:
    id: str
    content: str
    metadata: Dict
    embedding: Optional[List[float]] = None
    created_at: datetime = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()


class VectorStore:
    """In-memory vector store dengan cosine similarity search"""

    def __init__(self):
        self.documents: Dict[str, Document] = {}

    def add_document(self, content: str, metadata: Dict = None) -> str:
        """Add document dan generate embedding"""
        doc_id = self._generate_id(content)
        doc = Document(
            id=doc_id,
            content=content,
            metadata=metadata or {}
        )
        doc.embedding = self._generate_embedding(content)
        self.documents[doc_id] = doc
        return doc_id

    def _generate_id(self, content: str) -> str:
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def search(self, query: str, top_k: int = 5) -> List[Tuple[Document, float]]:
        """Search documents berdasarkan query"""
        query_embedding = self._generate_embedding(query)
        results = []

        for doc in self.documents.values():
            if doc.embedding:
                similarity = self._cosine_similarity(query_embedding, doc.embedding)
                results.append((doc, similarity))

        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

    def _cosine_similarity(self, v1: List[float], v2: List[float]) -> float:
        if len(v1) != len(v2):
            return 0.0
        dot_product = sum(a * b for a, b in zip(v1, v2))
        norm1 = sum(a * a for a in v1) ** 0.5
        norm2 = sum(b * b for b in v2) ** 0.5
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return dot_product / (norm1 * norm2)

    def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding menggunakan Amazon Titan"""
        client = boto3.client('bedrock-runtime', region_name=BEDROCK_REGION)

        try:
            response = client.invoke_model(
                modelId="amazon.titan-embed-text-v1",
                contentType="application/json",
                body=json.dumps({
                    "inputText": text,
                    "dimensions": 1536,
                    "normalize": True
                })
            )
            response_body = json.loads(response['body'].read())
            return response_body['embedding']
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return [0.0] * 1536


class LLMClient:
    """Client untuk Claude Sonnet via Bedrock"""

    def __init__(self):
        self.client = bedrock_runtime
        self.model_id = BEDROCK_MODEL_ID

    def generate(self, prompt: str, context: str = "") -> str:
        """Generate response dengan optional context"""

        system_prompt = """Anda adalah Assistant AMIGA, asisten virtual untuk sistem pengelolaan dokumen keuangan AMIGA.

Bantu pengguna dengan:
1. Penjelasan proses upload dan review dokumen
2. Informasi tentang jenis pajak (PPh 21, PPh 23, PPh 4 ayat 2, PPN, PPh Final, Tidak ada)
3. Penjelasan tentang workflow approval dan rejection
4. Informasi tentang format voucher pengeluaran
5. Penjelasan tentang sistem penomoran dokumen per klien
6. Penjelasan tentang role System Admin, Lead, Intake Support, Finance Reviewer

Jawab dengan singkat, jelas, dan menggunakan bahasa Indonesia formal.
Jika tidak tahu, katakan tidak tahu - jangan membuat informasi.

Konteks dari dokumen AMIGA:
"""

        full_prompt = f"{system_prompt}\n{context}\n\nPertanyaan pengguna: {prompt}"

        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": full_prompt}],
            "temperature": 0.3,
            "top_p": 0.9
        }

        try:
            response = self.client.invoke_model(
                modelId=self.model_id,
                contentType="application/json",
                body=json.dumps(payload)
            )
            response_body = json.loads(response['body'].read())
            return response_body['content'][0]['text']
        except Exception as e:
            return f"Error: {e}"


class RAGAgent:
    """Main RAG Agent untuk AMIGA"""

    def __init__(self):
        self.vector_store = VectorStore()
        self.llm = LLMClient()
        self._init_documents()

    def _init_documents(self):
        """Pre-load document dokumentasi AMIGA"""
        documents = [
            ("AMIGA adalah sistem intake dokumen hybrid dengan antarmuka terpisah untuk setiap peran (Admin, Lead, Support, Finance).",
             {"type": "overview"}),
            ("Peran Intake Support mengupload dokumen invoice, Finance Reviewer mengecek dan menyetujui/menolak voucher.",
             {"type": "roles"}),
            ("Jenis pajak yang dapat dipilih: PPh 21, PPh 23, PPh 4 ayat 2, PPN, PPh Final, atau Tidak ada.",
             {"type": "tax"}),
            ("Jika Finance menolak voucher, status jadi 'Perlu Tindakan' dan kembali ke Support untuk perbaikan.",
             {"type": "workflow"}),
            ("Format voucher: 'Voucher pengeluaran', nomor [urut]-[bulan][tahun], table 5 kolom, signature admin dan BOD.",
             {"type": "voucher"}),
            ("Sistem penomoran per klien: setiap PT punya nomor urut terpisah yang auto-increment.",
             {"type": "numbering"}),
        ]

        for content, metadata in documents:
            self.vector_store.add_document(content, metadata)

    def ask(self, query: str, top_k: int = 3) -> Dict:
        """Process query menggunakan RAG pipeline"""

        # 1. Retrieve relevant documents
        results = self.vector_store.search(query, top_k)

        # 2. Build context
        context_parts = []
        for doc, score in results:
            if score > 0.3:
                context_parts.append(f"[Similaritas: {score:.2%}]\n{doc.content}")

        context = "\n\n".join(context_parts) if context_parts else "Tidak ada dokumen yang relevan."

        # 3. Generate response
        response = self.llm.generate(query, context)

        return {
            "query": query,
            "response": response,
            "context_used": len(context_parts) > 0,
            "retrieved_docs": len(results),
            "top_scores": [score for _, score in results],
            "top_documents": [doc.content for doc, _ in results[:2]]
        }


# Global agent instance
agent = RAGAgent()


def ask_agent(query: str) -> Dict:
    """Wrapper untuk ask agent"""
    return agent.ask(query)


if __name__ == "__main__":
    print("AMIGA RAG Agent initialized")
    print("Run 'uvicorn RAG:app --reload' to start the API server")
