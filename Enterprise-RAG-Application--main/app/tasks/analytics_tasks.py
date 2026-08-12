"""
Celery tasks for analytics maintenance
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.analytics_tasks.cleanup_old_logs")
def cleanup_old_logs(days: int = 90) -> dict:
    """Remove query logs older than N days to control DB size."""
    try:
        from app.db.session import get_db_context
        from app.models.query_log import QueryLog
        cutoff = datetime.utcnow() - timedelta(days=days)
        with get_db_context() as db:
            deleted = db.query(QueryLog).filter(QueryLog.created_at < cutoff).delete()
        logger.info("cleanup_logs", deleted=deleted, cutoff=str(cutoff))
        return {"deleted": deleted, "cutoff": str(cutoff)}
    except Exception as exc:
        logger.error("cleanup_failed", error=str(exc))
        return {"error": str(exc)}
