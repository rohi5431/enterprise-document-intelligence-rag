"""
Application Configuration
==========================
Central settings management using pydantic-settings v2.
All configuration is read from environment variables / .env file.
"""

from __future__ import annotations

import secrets
from functools import lru_cache
from typing import Any, List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Application ───────────────────────────────────────────────────────────
    APP_NAME: str = "Enterprise RAG Platform"
    APP_VERSION: str = "8.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # ─── Security / JWT ────────────────────────────────────────────────────────
    SECRET_KEY: str = Field(default_factory=lambda: secrets.token_urlsafe(64))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ─── PostgreSQL ────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://postgres:Rohit%405431@localhost:5432/rag_db"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_POOL_RECYCLE: int = 1800
    DATABASE_ECHO: bool = False

    # ─── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_DB: int = 1
    REDIS_SESSION_DB: int = 2
    REDIS_JOB_DB: int = 3
    REDIS_MAX_CONNECTIONS: int = 20
    CACHE_DEFAULT_TTL: int = 300
    CACHE_QUERY_TTL: int = 600
    CACHE_SESSION_TTL: int = 3600

    # ─── Celery ────────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/4"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/5"
    CELERY_TASK_SERIALIZER: str = "json"
    CELERY_RESULT_SERIALIZER: str = "json"
    CELERY_ACCEPT_CONTENT: List[str] = ["json"]
    CELERY_TASK_TRACK_STARTED: bool = True
    CELERY_TASK_TIME_LIMIT: int = 3600
    CELERY_TASK_SOFT_TIME_LIMIT: int = 3000
    CELERY_WORKER_CONCURRENCY: int = 1
    CELERY_MAX_RETRIES: int = 3
    CELERY_RETRY_BACKOFF: int = 60

    # ─── Qdrant ────────────────────────────────────────────────────────────────
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_API_KEY: Optional[str] = None
    QDRANT_COLLECTION_NAME: str = "rag_documents"
    QDRANT_VECTOR_SIZE: int = 384

    # ─── Ollama / LLM ──────────────────────────────────────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3"
    OLLAMA_TIMEOUT: int = 120

    # ─── OpenAI (optional) ─────────────────────────────────────────────────────
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o"
    LLM_PROVIDER: str = "ollama"  # ollama | openai | gemini

    # ─── Gemini (optional) ─────────────────────────────────────────────────────
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-2.0-flash"

    # ─── Embedding ─────────────────────────────────────────────────────────────
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_BATCH_SIZE: int = 32
    EMBEDDING_DEVICE: str = "cpu"

    # ─── Reranker ──────────────────────────────────────────────────────────────
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    RERANKER_DEVICE: str = "cpu"

    # ─── Chunking ──────────────────────────────────────────────────────────────
    CHUNK_SIZE: int = 300
    CHUNK_OVERLAP: int = 50
    MAX_CHUNKS_PER_DOC: int = 2000

    # ─── Retrieval ─────────────────────────────────────────────────────────────
    RETRIEVAL_TOP_K: int = 10
    RETRIEVAL_FINAL_TOP_K: int = 5
    QUERY_EXPANSION_COUNT: int = 3
    QUERY_EXPANSION_ENABLED: bool = True

    # ─── Cache ─────────────────────────────────────────────────────────────────
    CACHE_ENABLED: bool = True

    # ─── File Upload ───────────────────────────────────────────────────────────
    UPLOAD_DIR: str = "uploads/docs"
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: List[str] = ["pdf", "txt", "docx", "md", "png", "jpg", "jpeg", "tiff"]
    OCR_ENABLED: bool = True
    TABLE_EXTRACTION_ENABLED: bool = True

    # ─── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 60  # seconds

    # ─── Conversation Memory ───────────────────────────────────────────────────
    MAX_CONVERSATION_MESSAGES: int = 20
    SUMMARY_TRIGGER_COUNT: int = 10
    MAX_CONTEXT_TOKENS: int = 4096

    # ─── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    # ─── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = ["*"]

    # ─── Admin ─────────────────────────────────────────────────────────────────
    ADMIN_EMAIL: str = "admin@ragplatform.com"
    ADMIN_PASSWORD: str = "Admin@1234"

    # ─── Monitoring ────────────────────────────────────────────────────────────
    ENABLE_METRICS: bool = True
    METRICS_PREFIX: str = "rag_platform"

    @field_validator("CELERY_ACCEPT_CONTENT", "CORS_ORIGINS", "ALLOWED_EXTENSIONS", mode="before")
    @classmethod
    def parse_list(cls, v: Any) -> Any:
        if isinstance(v, str):
            return [i.strip() for i in v.split(",")]
        return v

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    @property
    def redis_cache_url(self) -> str:
        base = self.REDIS_URL.rsplit("/", 1)[0]
        return f"{base}/{self.REDIS_CACHE_DB}"

    @property
    def redis_session_url(self) -> str:
        base = self.REDIS_URL.rsplit("/", 1)[0]
        return f"{base}/{self.REDIS_SESSION_DB}"

    @property
    def redis_job_url(self) -> str:
        base = self.REDIS_URL.rsplit("/", 1)[0]
        return f"{base}/{self.REDIS_JOB_DB}"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings: Settings = get_settings()
