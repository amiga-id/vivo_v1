"""
RAG Pipeline untuk AMIGA Assistant
Pipeline yang menggabungkan retrieval (vektor search) dan generation (LLM)
untuk menjawab pertanyaan berdasarkan dokumen yang ada di database.
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

# In-memory storage untuk dokumen dan embeddings
# Dalam produksi, gunakan Vector Database seperti Pinecone, Weaviate, atau FAISS
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


class DocumentStore:
    """In-memory document store dengan vector search capability"""
    
    def __init__(self):
        self.documents: Dict[str, Document] = {}
        self.embeddings: Dict[str, List[float]] = {}
    
    def add_document(self, doc: Document) -> str:
        """Add document to store"""
        doc_id = self._generate_id(doc.content)
        self.documents[doc_id] = doc
        return doc_id
    
    def _generate_id(self, content: str) -> str:
        """Generate unique ID from content"""
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    def search(self, query_embedding: List[float], top_k: int = 5) -> List[Tuple[str, float]]:
        """Search for similar documents using cosine similarity"""
        results = []
        
        for doc_id, doc in self.documents.items():
            if doc.embedding:
                similarity = self._cosine_similarity(query_embedding, doc.embedding)
                results.append((doc_id, similarity))
        
        # Sort by similarity (descending) and return top_k
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]
    
    def _cosine_similarity(self, v1: List[float], v2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        if len(v1) != len(v2):
            return 0.0
        
        dot_product = sum(a * b for a, b in zip(v1, v2))
        norm1 = sum(a * a for a in v1) ** 0.5
        norm2 = sum(b * b for b in v2) ** 0.5
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)


class EmbeddingGenerator:
    """Generate embeddings using Bedrock Titan Embeddings model"""
    
    def __init__(self):
        self.embedding_model_id = "amazon.titan-embed-text-v1"
        self.client = bedrock_runtime
    
    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        payload = {
            "inputText": text,
            "dimensions": 1536,  # Titan embeddings dimension
            "normalize": True
        }
        
        try:
            response = self.client.invoke_model(
                modelId=self.embedding_model_id,
                contentType="application/json",
                body=json.dumps(payload)
            )
            
            response_body = json.loads(response['body'].read())
            return response_body['embedding']
        
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return [0.0] * 1536  # Return zero vector on error
    
    def batch_generate(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        return [self.generate_embedding(text) for text in texts]


class LLMGenerator:
    """Generate responses using Bedrock Claude model"""
    
    def __init__(self):
        self.model_id = BEDROCK_MODEL_ID
        self.client = bedrock_runtime
    
    def generate_response(self, prompt: str, context: str = "") -> str:
        """Generate response with optional context"""
        
        system_prompt = """Anda adalah Assistant AMIGA, asisten virtual untuk sistem pengelolaan dokumen keuangan.
Anda membantu pengguna dengan:
1. Penjelasan proses upload dan review dokumen
2. Informasi tentang jenis pajak (PPh 21, PPh 23, PPh 4 ayat 2, PPN, PPh Final, Tidak ada)
3. Penjelasan tentang workflow approval dan rejection
4. Informasi tentang format voucher pengeluaran
5. Penjelasan tentang sistem penomoran dokumen per klien

Jawab dengan singkat dan jelas. Gunakan bahasa Indonesia formal."""

        if context:
            context_section = f"\n\nKonteks dari dokumen:\n{context}"
        else:
            context_section = ""
        
        messages = [
            {
                "role": "user",
                "content": f"{system_prompt}\n\nPertanyaan pengguna:{context_section}\n\nPertanyaan: {prompt}"
            }
        ]
        
        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "messages": messages,
            "temperature": 0.3,
            "top_p": 0.9
        }
        
        try:
            response = self.client.invoke_model(
                modelId=self.model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(payload)
            )
            
            response_body = json.loads(response['body'].read())
            return response_body['content'][0]['text']
        
        except Exception as e:
            return f"Error generating response: {e}"


class RAGPipeline:
    """Main RAG Pipeline class"""
    
    def __init__(self):
        self.document_store = DocumentStore()
        self.embedding_generator = EmbeddingGenerator()
        self.llm_generator = LLMGenerator()
        
        # Pre-load some common documents
        self._pre_load_documents()
    
    def _pre_load_documents(self):
        """Pre-load common documents about AMIGA system"""
        common_docs = [
            {
                "content": "AMIGA adalah sistem intake dokumen hybrid dengan antarmuka terpisah untuk setiap peran (Admin, Lead, Support, Finance). Peran Intake Support mengupload dokumen, Finance Reviewer mengecek dan menyetujui/menolak voucher.",
                "metadata": {"type": "system_overview"}
            },
            {
                "content": "Jenis pajak yang dapat dipilih pada invoice: PPh 21 (Pajak Penghasilan pasal 21), PPh 23 (Pajak Penghasilan pasal 23), PPh 4 ayat 2 (Pajak Penghasilan final), PPN (Pajak Pertambahan Nilai), PPh Final (Pajak Penghasilan final), dan Tidak ada.",
                "metadata": {"type": "tax_info"}
            },
            {
                "content": "Workflow rejection: Jika Finance Reviewer menolak voucher, status dokumen menjadi 'Perlu Tindakan' dan dikembalikan ke Intake Support untuk perbaikan. Support dapat memperbaiki dengan upload ulang file atau hanya mengedit catatan.",
                "metadata": {"type": "workflow"}
            },
            {
                "content": "Format voucher pengeluaran: Header 'Voucher pengeluaran', nomor format '[nomorUrut] - [bulan][tahun]', table dengan kolom no/tanggal/keterangan/jumlah/harga, signature 'diajukan oleh admin' dan 'disetujui oleh BOD', catatan 'side approval bisa ada dua pihak'.",
                "metadata": {"type": "voucher_format"}
            },
            {
                "content": "Sistem penomoran dokumen per klien: Setiap klien (PT) memiliki nomor urut terpisah yang auto-increment. Format invoice: [nomorUrut] - PT [namaPT] - PIC [namaPIC].",
                "metadata": {"type": "numbering"}
            }
        ]
        
        for doc in common_docs:
            content = doc["content"]
            embedding = self.embedding_generator.generate_embedding(content)
            document = Document(
                id="",
                content=content,
                metadata=doc["metadata"],
                embedding=embedding
            )
            self.document_store.add_document(document)
    
    def process_query(self, query: str, top_k: int = 3) -> Dict:
        """Process query through RAG pipeline"""
        print(f"Processing query: {query}")
        
        # Step 1: Generate embedding for query
        query_embedding = self.embedding_generator.generate_embedding(query)
        
        # Step 2: Retrieve relevant documents
        retrieved_docs = self.document_store.search(query_embedding, top_k)
        
        # Step 3: Build context from retrieved documents
        context_parts = []
        for doc_id, score in retrieved_docs:
            if score > 0.3:  # Only include relevant docs
                doc = self.document_store.documents[doc_id]
                context_parts.append(f"[Similaritas: {score:.2f}]\n{doc.content}")
        
        context = "\n\n".join(context_parts) if context_parts else "Tidak ada dokumen yang relevan ditemukan."
        
        # Step 4: Generate response with LLM
        response = self.llm_generator.generate_response(query, context)
        
        return {
            "query": query,
            "response": response,
            "context": context,
            "retrieved_docs": len(retrieved_docs),
            "top_scores": [score for _, score in retrieved_docs]
        }


# Initialize global RAG pipeline
rag_pipeline = RAGPipeline()


def ask_agent(query: str) -> Dict:
    """
    Main function to ask the agent a question
    Wrapper for the RAG pipeline
    """
    return rag_pipeline.process_query(query)


# FastAPI setup
if __name__ == "__main__":
    print("RAG Pipeline initialized")
    print("Run 'uvicorn RAG:app --reload' to start the API server")
