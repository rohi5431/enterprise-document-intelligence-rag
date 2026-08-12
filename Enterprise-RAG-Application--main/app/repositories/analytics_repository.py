from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import desc, func, text
from sqlalchemy.orm import Session

from app.models.query_log import QueryLog
from app.models.user import User
from app.models.document import Document
from app.models.feedback import ResponseFeedback


class AnalyticsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def log_query(self, log: QueryLog) -> QueryLog:
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def get_query_stats(self, days: int = 30) -> dict:
        since = datetime.utcnow() - timedelta(days=days)
        q = self.db.query(QueryLog).filter(QueryLog.created_at >= since)
        total = q.count()
        failed = q.filter(QueryLog.success == False).count()
        cache_hits = q.filter(QueryLog.cache_hit == True).count()
        avg_latency = self.db.query(func.avg(QueryLog.total_latency_ms)).filter(
            QueryLog.created_at >= since
        ).scalar() or 0.0
        p95_latency = self.db.query(
            func.percentile_cont(0.95).within_group(QueryLog.total_latency_ms)
        ).filter(QueryLog.created_at >= since).scalar() or 0.0
        today = datetime.utcnow().date()
        queries_today = self.db.query(QueryLog).filter(
            func.date(QueryLog.created_at) == today
        ).count()
        return {
            "total_queries": total,
            "failed_count": failed,
            "cache_hit_ratio": round(cache_hits / max(total, 1), 4),
            "avg_latency_ms": round(float(avg_latency), 2),
            "p95_latency_ms": round(float(p95_latency), 2),
            "queries_today": queries_today,
        }

    def get_top_documents(self, limit: int = 10) -> List[dict]:
        results = (
            self.db.query(
                Document.id,
                Document.title,
                Document.retrieval_count,
                Document.average_chunk_score,
            )
            .filter(Document.processing_status == "success")
            .order_by(desc(Document.retrieval_count))
            .limit(limit).all()
        )
        return [
            {"doc_id": r.id, "title": r.title, "retrieval_count": r.retrieval_count, "avg_score": r.average_chunk_score}
            for r in results
        ]

    def get_platform_stats(self) -> dict:
        total_users = self.db.query(User).count()
        active_users = self.db.query(User).filter(User.is_active == True).count()
        total_docs = self.db.query(Document).count()
        processed_docs = self.db.query(Document).filter(
            Document.processing_status == "success"
        ).count()
        total_queries = self.db.query(QueryLog).count()
        avg_latency = self.db.query(func.avg(QueryLog.total_latency_ms)).scalar() or 0.0
        cache_hits = self.db.query(QueryLog).filter(QueryLog.cache_hit == True).count()
        failed = self.db.query(QueryLog).filter(QueryLog.success == False).count()
        fb_stats_q = self.db.query(
            func.count(ResponseFeedback.id),
            func.avg(ResponseFeedback.rating)
        ).filter(ResponseFeedback.rating.isnot(None)).first()
        fb_count = fb_stats_q[0] or 0
        avg_rating = float(fb_stats_q[1] or 0.0)
        return {
            "total_users": total_users,
            "active_users": active_users,
            "total_documents": total_docs,
            "processed_documents": processed_docs,
            "total_queries": total_queries,
            "avg_response_time_ms": round(float(avg_latency), 2),
            "cache_hit_ratio": round(cache_hits / max(total_queries, 1), 4),
            "total_feedback": fb_count,
            "avg_rating": round(avg_rating, 2),
            "failed_requests": failed,
        }
