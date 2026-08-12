from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_admin
from app.models.user import User
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stats")
def get_stats(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Platform-wide KPI stats."""
    return AdminService(db).get_platform_stats()


@router.get("/users")
def get_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Paginated user list with activity summary."""
    return AdminService(db).get_users(skip, limit)


@router.get("/documents")
def get_documents(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    status: str = Query(default=None),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Paginated document list with status filter."""
    return AdminService(db).get_documents(skip, limit, status)


@router.get("/queries")
def get_queries(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    days: int = Query(default=30, ge=1, le=365),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Paginated query log."""
    return AdminService(db).get_queries(skip, limit, days)


@router.get("/feedback")
def get_feedback(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Feedback list with stats."""
    return AdminService(db).get_feedback(skip, limit)


@router.get("/analytics")
def get_analytics(
    days: int = Query(default=30, ge=1, le=365),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Query analytics: latency, cache hits, top documents."""
    return AdminService(db).get_query_analytics(days)


@router.get("/analytics/summary")
def get_feedback_analytics(
    days: int = Query(default=30, ge=1, le=365),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Feedback statistics for admin dashboard."""
    return AdminService(db).get_feedback_analytics(days)


@router.get("/analytics/timeseries")
def get_timeseries(
    days: int = Query(default=30, ge=1, le=365),
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Daily query/upload/latency timeseries for charts."""
    return AdminService(db).get_timeseries(days)


@router.get("/monitoring")
def get_monitoring(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Live system monitoring metrics."""
    import redis as redis_lib
    from app.core.config import settings
    from app.services.cache_service import get_cache_service
    metrics: dict = {"cache": get_cache_service().get_stats()}
    try:
        r = redis_lib.from_url(settings.REDIS_URL)
        info = r.info()
        metrics["redis_connected_clients"] = info.get("connected_clients", 0)
        metrics["redis_used_memory_mb"] = round(info.get("used_memory", 0) / (1024 * 1024), 2)
        metrics["redis_status"] = "ok"
    except Exception as e:
        metrics["redis_status"] = f"error: {e}"
    return metrics
