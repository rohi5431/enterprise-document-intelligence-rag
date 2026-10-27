from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.core.logger import get_logger
from app.models.query_log import QueryLog
from app.repositories.analytics_repository import AnalyticsRepository

logger = get_logger(__name__)


class AnalyticsService:
    def __init__(self, db: Session) -> None:
        self.repo = AnalyticsRepository(db)

    def record_query(
        self,
        *,
        query_text: str,
        user_id: Optional[int] = None,
        session_id: Optional[int] = None,
        retrieval_latency_ms: float = 0.0,
        llm_latency_ms: float = 0.0,
        total_latency_ms: float = 0.0,
        rerank_latency_ms: float = 0.0,
        num_sources: int = 0,
        vector_candidates: int = 0,
        bm25_candidates: int = 0,
        top_score: Optional[float] = None,
        cache_hit: bool = False,
        success: bool = True,
        error_message: Optional[str] = None,
        retrieval_mode: Optional[str] = None,
        expanded_queries: Optional[list] = None,
        tenant_id: Optional[str] = None,
    ) -> QueryLog:
        log = QueryLog(
            query_text=query_text,
            user_id=user_id,
            session_id=session_id,
            retrieval_latency_ms=retrieval_latency_ms,
            llm_latency_ms=llm_latency_ms,
            total_latency_ms=total_latency_ms,
            rerank_latency_ms=rerank_latency_ms,
            num_sources=num_sources,
            vector_candidates=vector_candidates,
            bm25_candidates=bm25_candidates,
            top_score=top_score,
            cache_hit=cache_hit,
            success=success,
            error_message=error_message,
            retrieval_mode=retrieval_mode,
            expanded_queries=expanded_queries or [],
            tenant_id=tenant_id,
        )
        return self.repo.log_query(log)

    def get_platform_stats(self) -> dict:
        return self.repo.get_platform_stats()

    def get_query_stats(self, days: int = 30) -> dict:
        return self.repo.get_query_stats(days)

    def get_top_documents(self, limit: int = 10) -> list:
        return self.repo.get_top_documents(limit)
