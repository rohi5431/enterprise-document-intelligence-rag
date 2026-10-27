"""
Query log — records every RAG query for analytics
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class QueryLog(Base):
    __tablename__ = "query_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=True, index=True)

    # Query info
    query_text = Column(Text, nullable=False)
    expanded_queries = Column(JSON, default=list)
    retrieval_mode = Column(String(50), nullable=True)

    # Performance
    retrieval_latency_ms = Column(Float, nullable=True)
    llm_latency_ms = Column(Float, nullable=True)
    total_latency_ms = Column(Float, nullable=True)
    rerank_latency_ms = Column(Float, nullable=True)

    # Results
    num_sources = Column(Integer, default=0)
    vector_candidates = Column(Integer, default=0)
    bm25_candidates = Column(Integer, default=0)
    top_score = Column(Float, nullable=True)

    # Cache
    cache_hit = Column(Boolean, default=False)

    # Status
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)

    # Tenant
    tenant_id = Column(String(100), nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    user = relationship("User", back_populates="query_logs")

    def __repr__(self) -> str:
        return f"<QueryLog(id={self.id}, user_id={self.user_id}, latency={self.total_latency_ms})>"
