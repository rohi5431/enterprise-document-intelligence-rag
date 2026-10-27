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
    """Live system monitoring metrics — service health (not laptop hardware)."""
    import time
    import redis as redis_lib
    from app.core.config import settings
    from app.services.cache_service import get_cache_service

    metrics: dict = {}

    # ── Cache stats ────────────────────────────────────────────────
    try:
        metrics["cache"] = get_cache_service().get_stats()
    except Exception:
        metrics["cache"] = {}

    # ── PostgreSQL ────────────────────────────────────────────────
    try:
        import sqlalchemy
        t0 = time.perf_counter()
        with db.bind.connect() as conn:
            result = conn.execute(sqlalchemy.text("SELECT COUNT(*) FROM information_schema.tables"))
            table_count = result.scalar() or 0
        pg_latency = round((time.perf_counter() - t0) * 1000, 2)
        metrics["postgres"] = {
            "status": "ok",
            "latency_ms": pg_latency,
            "table_count": int(table_count),
        }
    except Exception as e:
        metrics["postgres"] = {"status": f"error: {e}", "latency_ms": None}

    # ── Redis ──────────────────────────────────────────────────
    try:
        r = redis_lib.from_url(settings.REDIS_URL)
        t0 = time.perf_counter()
        r.ping()
        redis_latency = round((time.perf_counter() - t0) * 1000, 2)
        info = r.info()
        metrics["redis"] = {
            "status": "ok",
            "latency_ms": redis_latency,
            "connected_clients": info.get("connected_clients", 0),
            "used_memory_mb": round(info.get("used_memory", 0) / (1024 * 1024), 2),
            "hit_rate": round(
                info.get("keyspace_hits", 0)
                / max(info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0), 1)
                * 100,
                1,
            ),
        }
        metrics["redis_connected_clients"] = info.get("connected_clients", 0)
        metrics["redis_used_memory_mb"] = metrics["redis"]["used_memory_mb"]
        metrics["redis_status"] = "ok"
    except Exception as e:
        metrics["redis"] = {"status": f"error: {e}", "latency_ms": None}
        metrics["redis_status"] = f"error: {e}"

    # ── Qdrant ──────────────────────────────────────────────────
    try:
        from qdrant_client import QdrantClient
        t0 = time.perf_counter()
        qc = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY)
        collections = qc.get_collections()
        qdrant_latency = round((time.perf_counter() - t0) * 1000, 2)
        vector_count = 0
        for col in collections.collections:
            try:
                info_col = qc.get_collection(col.name)
                vector_count += info_col.vectors_count or 0
            except Exception:
                pass
        metrics["qdrant"] = {
            "status": "ok",
            "latency_ms": qdrant_latency,
            "collection_count": len(collections.collections),
            "vector_count": vector_count,
        }
    except Exception as e:
        metrics["qdrant"] = {"status": f"error: {e}", "latency_ms": None}

    # ── Celery workers ─────────────────────────────────────────────
    try:
        from app.workers.celery_app import celery_app
        t0 = time.perf_counter()
        insp = celery_app.control.inspect(timeout=1.0)
        active = insp.active() or {}
        celery_latency = round((time.perf_counter() - t0) * 1000, 2)
        total_active_tasks = sum(len(tasks) for tasks in active.values())
        metrics["celery"] = {
            "status": "ok" if active else "no_workers",
            "latency_ms": celery_latency,
            "worker_count": len(active),
            "active_tasks": total_active_tasks,
        }
    except Exception as e:
        metrics["celery"] = {"status": f"error: {e}", "latency_ms": None}

    # ── BM25 index ───────────────────────────────────────────────
    try:
        from rag.retrieval.bm25_manager import get_bm25
        bm25 = get_bm25()
        metrics["bm25"] = {
            "ready": bm25.is_ready,
            "corpus_size": bm25.corpus_size,
        }
    except Exception as e:
        metrics["bm25"] = {"ready": False, "corpus_size": 0, "error": str(e)}

    # ── Graph index ───────────────────────────────────────────────
    try:
        from rag.retrieval.graph_retriever import get_graph
        graph = get_graph()
        metrics["graph"] = {
            "ready": graph.is_ready,
            "node_count": graph.node_count,
            "edge_count": graph.edge_count,
        }
    except Exception as e:
        metrics["graph"] = {"ready": False, "node_count": 0, "edge_count": 0, "error": str(e)}

    # ── Neo4j ────────────────────────────────────────────────────
    if not settings.NEO4J_URI:
        metrics["neo4j"] = {"status": "not_configured", "message": "NEO4J_URI not set"}
    else:
        try:
            from neo4j import GraphDatabase  # type: ignore
            t0 = time.perf_counter()
            driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            )
            with driver.session() as session:
                result = session.run("MATCH (n) RETURN count(n) AS cnt")
                node_count = result.single()["cnt"]
            driver.close()
            neo4j_latency = round((time.perf_counter() - t0) * 1000, 2)
            metrics["neo4j"] = {
                "status": "ok",
                "latency_ms": neo4j_latency,
                "node_count": node_count,
            }
        except ImportError:
            metrics["neo4j"] = {"status": "not_configured", "message": "neo4j library not installed"}
        except Exception as e:
            metrics["neo4j"] = {"status": "error", "message": str(e), "latency_ms": None}

    # ── Groq API ─────────────────────────────────────────────────
    if not settings.GROQ_API_KEY:
        metrics["groq"] = {"status": "not_configured", "message": "GROQ_API_KEY not set"}
    else:
        try:
            import httpx
            t0 = time.perf_counter()
            resp = httpx.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                timeout=5,
            )
            groq_latency = round((time.perf_counter() - t0) * 1000, 2)
            if resp.status_code == 200:
                metrics["groq"] = {
                    "status": "ok",
                    "model": "llama3-8b-8192",
                    "latency_ms": groq_latency,
                }
            else:
                metrics["groq"] = {
                    "status": "error",
                    "message": f"HTTP {resp.status_code}",
                    "latency_ms": groq_latency,
                }
        except Exception as e:
            metrics["groq"] = {"status": "error", "message": str(e), "latency_ms": None}

    # ── Ollama ───────────────────────────────────────────────────
    ollama_url = getattr(settings, "OLLAMA_URL", None) or getattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
    try:
        import httpx
        t0 = time.perf_counter()
        resp = httpx.get(f"{ollama_url.rstrip('/')}/api/tags", timeout=5)
        ollama_latency = round((time.perf_counter() - t0) * 1000, 2)
        if resp.status_code == 200:
            data = resp.json()
            models = [m.get("name", "") for m in data.get("models", [])]
            metrics["ollama"] = {
                "status": "ok",
                "models_count": len(models),
                "models": models[:10],
                "latency_ms": ollama_latency,
            }
        else:
            metrics["ollama"] = {
                "status": "error",
                "message": f"HTTP {resp.status_code}",
                "latency_ms": ollama_latency,
            }
    except Exception as e:
        metrics["ollama"] = {"status": "error", "message": str(e), "latency_ms": None}

    # ── Pipeline times ───────────────────────────────────────────
    try:
        from app.services.performance_monitor import get_performance_monitor  # type: ignore
        pm = get_performance_monitor()
        pt = pm.get_avg_pipeline_times() if hasattr(pm, "get_avg_pipeline_times") else None
        if pt:
            metrics["pipeline_times"] = {
                "embedding_ms": round(pt.get("embedding_ms", 0), 1),
                "retrieval_ms": round(pt.get("retrieval_ms", 0), 1),
                "reranking_ms": round(pt.get("reranking_ms", 0), 1),
                "llm_ms": round(pt.get("llm_ms", 0), 1),
                "total_ms": round(pt.get("total_ms", 0), 1),
            }
        else:
            metrics["pipeline_times"] = None
    except Exception:
        metrics["pipeline_times"] = None

    # ── Memory ───────────────────────────────────────────────────
    try:
        import psutil
        vm = psutil.virtual_memory()
        proc = psutil.Process()
        proc_mem = proc.memory_info().rss / (1024 * 1024)
        metrics["memory"] = {
            "used_mb": round((vm.total - vm.available) / (1024 * 1024), 1),
            "total_mb": round(vm.total / (1024 * 1024), 1),
            "percent": round(vm.percent, 1),
            "process_mb": round(proc_mem, 1),
        }
    except Exception as e:
        metrics["memory"] = {"used_mb": None, "total_mb": None, "percent": None, "process_mb": None}

    return metrics

