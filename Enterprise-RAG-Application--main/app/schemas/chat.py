from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.chat import MessageRole


class ChatRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4096)
    session_id: int | None = None
    top_k: int = Field(default=10, ge=1, le=50)
    final_top_k: int = Field(default=3, ge=1, le=20)
    filters: dict | None = None
    expand_query: bool | None = None
    show_diagnostics: bool = False
    stream: bool = False


class CitationResponse(BaseModel):
    citation_number: int
    chunk_id: str
    doc_id: int
    doc_title: str | None
    doc_filename: str | None
    filename: str | None = None
    page_number: int | None
    text_snippet: str
    score: float
    rerank_score: float | None


class RetrievalDiagnostics(BaseModel):
    embedding_ms: float = 0
    vector_ms: float = 0
    bm25_ms: float = 0
    fusion_ms: float = 0
    rerank_ms: float = 0
    total_ms: float = 0
    vector_candidates: int = 0
    bm25_candidates: int = 0
    total_candidates: int = 0
    expanded_queries: list[str] = []
    cache_hit: bool = False


class ChatResponse(BaseModel):
    answer: str
    query: str
    session_id: int
    message_id: int
    feedback_id: str
    confidence: float
    citations: list[CitationResponse]
    num_sources: int
    retrieval_latency_ms: float
    llm_latency_ms: float
    total_latency_ms: float
    cache_hit: bool = False
    diagnostics: RetrievalDiagnostics | None = None


class SessionCreate(BaseModel):
    title: str | None = None


class SessionResponse(BaseModel):
    id: int
    title: str | None
    summary: str | None
    message_count: int
    is_active: bool
    created_at: datetime
    last_message_at: datetime | None

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: int
    session_id: int
    role: MessageRole
    content: str
    sources: list
    created_at: datetime

    model_config = {"from_attributes": True}
