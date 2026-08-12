from __future__ import annotations

from sqlalchemy.orm import Session

from app.repositories.analytics_repository import AnalyticsRepository
from app.repositories.user_repository import UserRepository
from app.repositories.feedback_repository import FeedbackRepository
from app.models.document import Document
from sqlalchemy import desc


class AdminService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.analytics = AnalyticsRepository(db)
        self.users = UserRepository(db)
        self.feedback = FeedbackRepository(db)

    def get_platform_stats(self) -> dict:
        return self.analytics.get_platform_stats()

    def get_users(
        self, skip: int = 0, limit: int = 50
    ) -> dict:
        users = self.users.get_users_with_activity(skip, limit)
        total = self.users.total_count()
        return {"users": users, "total": total, "page": skip // limit + 1, "page_size": limit}

    def get_documents(
        self, skip: int = 0, limit: int = 50, status: str | None = None
    ) -> dict:
        q = self.db.query(Document)
        if status:
            q = q.filter(Document.processing_status == status)
        total = q.count()
        docs = q.order_by(desc(Document.created_at)).offset(skip).limit(limit).all()
        return {
            "documents": docs,
            "total": total,
            "page": skip // limit + 1,
            "page_size": limit,
        }

    def get_queries(
        self, skip: int = 0, limit: int = 50, days: int = 30
    ) -> dict:
        from app.models.query_log import QueryLog
        from datetime import datetime, timedelta
        since = datetime.utcnow() - timedelta(days=days)
        q = self.db.query(QueryLog).filter(QueryLog.created_at >= since)
        total = q.count()
        logs = q.order_by(desc(QueryLog.created_at)).offset(skip).limit(limit).all()
        return {"queries": logs, "total": total}

    def get_feedback(
        self, skip: int = 0, limit: int = 50
    ) -> dict:
        feedbacks = self.feedback.list_feedback(skip, limit)
        stats = self.feedback.get_stats()
        return {"feedback": feedbacks, "stats": stats}

    def get_query_analytics(self, days: int = 30) -> dict:
        stats = self.analytics.get_query_stats(days)
        top_docs = self.analytics.get_top_documents(10)
        return {"query_stats": stats, "top_documents": top_docs}

    def get_feedback_analytics(self, days: int = 30) -> dict:
        from datetime import datetime, timedelta
        from app.models.feedback import ResponseFeedback
        since = datetime.utcnow() - timedelta(days=days)
        total = self.db.query(ResponseFeedback).filter(
            ResponseFeedback.created_at >= since
        ).count()
        helpful = self.db.query(ResponseFeedback).filter(
            ResponseFeedback.created_at >= since,
            ResponseFeedback.is_helpful == 1,
        ).count()
        not_helpful = self.db.query(ResponseFeedback).filter(
            ResponseFeedback.created_at >= since,
            ResponseFeedback.is_helpful == 0,
        ).count()
        return {
            "total": total,
            "helpful": helpful,
            "not_helpful": not_helpful,
            "helpful_rate": round(helpful / max(total, 1) * 100, 1),
        }

    def get_timeseries(self, days: int = 30) -> dict:
        from datetime import datetime, timedelta
        from app.models.query_log import QueryLog
        from app.models.document import Document
        from sqlalchemy import func, cast, Date, Integer

        since = datetime.utcnow() - timedelta(days=days)

        query_series = (
            self.db.query(
                cast(QueryLog.created_at, Date).label("date"),
                func.count(QueryLog.id).label("count"),
                func.avg(QueryLog.total_latency_ms).label("avg_latency"),
                func.sum(func.cast(QueryLog.cache_hit, Integer)).label("cache_hits"),
            )
            .filter(QueryLog.created_at >= since)
            .group_by(cast(QueryLog.created_at, Date))
            .order_by(cast(QueryLog.created_at, Date))
            .all()
        )

        upload_series = (
            self.db.query(
                cast(Document.created_at, Date).label("date"),
                func.count(Document.id).label("count"),
            )
            .filter(Document.created_at >= since)
            .group_by(cast(Document.created_at, Date))
            .order_by(cast(Document.created_at, Date))
            .all()
        )

        return {
            "queries": [
                {
                    "date": str(r.date),
                    "count": r.count,
                    "avg_latency": round(float(r.avg_latency or 0), 1),
                    "cache_hits": int(r.cache_hits or 0),
                }
                for r in query_series
            ],
            "uploads": [{"date": str(r.date), "count": r.count} for r in upload_series],
        }
