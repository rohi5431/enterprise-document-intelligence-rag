from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class PlatformStats(BaseModel):
    total_users: int
    active_users: int
    total_documents: int
    processed_documents: int
    total_queries: int
    avg_response_time_ms: float
    cache_hit_ratio: float
    total_feedback: int
    avg_rating: float
    failed_requests: int


class QueryAnalytics(BaseModel):
    total_queries: int
    avg_latency_ms: float
    p95_latency_ms: float
    cache_hit_ratio: float
    failed_count: int
    queries_today: int


class TopDocument(BaseModel):
    doc_id: int
    title: str
    retrieval_count: int
    avg_score: float | None


class UserActivity(BaseModel):
    user_id: int
    email: str
    total_queries: int
    total_sessions: int
    last_active: datetime | None
