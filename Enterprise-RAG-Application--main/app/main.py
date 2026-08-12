"""
Enterprise RAG Platform — FastAPI Application Entry Point
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import AppException
from app.core.logger import get_logger, setup_logging
from app.db.base import Base
from app.db.session import engine
from rag.retrieval.bm25_manager import get_bm25
from app.db.session import SessionLocal
from sqlalchemy.orm import Session
from app.models.chunk import Chunk
import app.models  # noqa: F401
from app.middleware.logging_middleware import RequestLoggingMiddleware
from app.middleware.rate_limit_middleware import RateLimitMiddleware
print("QDRANT_URL =", settings.QDRANT_URL)
print("QDRANT_API_KEY =", settings.QDRANT_API_KEY)
setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    logger.info(
        "startup",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
        env=settings.ENVIRONMENT,
    )
    Base.metadata.create_all(bind=engine)

    try:
        bm25 = get_bm25()
        db: Session = SessionLocal()
        from app.models.document import Document

        chunks = db.query(Chunk).all()
        bm25_chunks = []

        for chunk in chunks:
            doc = db.query(Document).filter(Document.id == chunk.document_id).first()
            bm25_chunks.append(
                {
                    "chunk_id": chunk.qdrant_point_id or str(chunk.id),
                    "doc_id": chunk.document_id,
                    "text": chunk.text,
                    "tags": chunk.tags or [],
                    "page_number": chunk.page_number,
                    "user_id": doc.owner_id if doc else None,
                    "doc_title": doc.title if doc else None,
                    "doc_filename": doc.filename if doc else None,
                }
            )

        if bm25_chunks:
            bm25.build_index(bm25_chunks)

        logger.info("BM25 startup: ready=%s corpus=%d", bm25.is_ready, bm25.corpus_size)
        db.close()
    except Exception as e:
        logger.warning("BM25 startup error: %s", e)
    
    yield
    logger.info("shutdown", app=settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    description="Production-grade Enterprise Multi-Tenant RAG Platform",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ── Middleware (order matters — outermost first) ────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    RateLimitMiddleware,
    requests=settings.RATE_LIMIT_REQUESTS,
    window=settings.RATE_LIMIT_WINDOW,
)

# ── Exception handlers ──────────────────────────────────────────────────
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "error_code": getattr(exc, "error_code", "ERROR")},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_exception", error=str(exc), path=request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ── Routers ───────────────────────────────────────────────────────────────
app.include_router(api_router)


# ── Health checks ────────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
        "status": "running",
    }


@app.get("/health", tags=["Health"])
def health():
    from app.db.session import engine

    checks = {}

    # DB check
    try:
        with engine.connect() as conn:
            conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"

    # Redis check
    try:
        import redis

        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    # Qdrant check
    try:
        from qdrant_client import QdrantClient

        qc = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
        )

        qc.get_collections()
        checks["qdrant"] = "ok"

    except Exception as e:
        checks["qdrant"] = f"error: {e}"

    healthy = all(v == "ok" for v in checks.values())

    return {
        "status": "healthy" if healthy else "degraded",
        "checks": checks,
    }