"""
Celery Application Factory
"""
from __future__ import annotations

from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "rag_platform",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.ingestion_tasks",
        "app.tasks.analytics_tasks",
    ],
)

celery_app.conf.update(
    task_serializer=settings.CELERY_TASK_SERIALIZER,
    result_serializer=settings.CELERY_RESULT_SERIALIZER,
    accept_content=settings.CELERY_ACCEPT_CONTENT,
    task_track_started=settings.CELERY_TASK_TRACK_STARTED,
    task_time_limit=settings.CELERY_TASK_TIME_LIMIT,
    task_soft_time_limit=settings.CELERY_TASK_SOFT_TIME_LIMIT,
    worker_concurrency=settings.CELERY_WORKER_CONCURRENCY,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    result_expires=86400,  # 24h
    beat_schedule={
        "cleanup-old-query-logs": {
            "task": "app.tasks.analytics_tasks.cleanup_old_logs",
            "schedule": 86400.0,  # daily
        },
    },
)
