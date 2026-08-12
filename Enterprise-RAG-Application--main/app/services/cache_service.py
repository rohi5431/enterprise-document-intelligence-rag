"""
Redis Response Cache
====================
Caches RAG answers keyed by (user_id, query, filters hash).
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Dict, Optional

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)


class CacheService:
    """Redis-backed cache for RAG query responses."""

    PREFIX = "rag:query:"

    def __init__(self) -> None:
        self._client: Optional[redis.Redis] = None

    @property
    def client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.from_url(
                settings.redis_cache_url,
                decode_responses=True,
                max_connections=settings.REDIS_MAX_CONNECTIONS,
            )
        return self._client

    def _make_key(
        self,
        user_id: int,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
    ) -> str:
        payload = json.dumps(
            {"q": query.strip().lower(), "f": filters or {}},
            sort_keys=True,
        )
        digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
        return f"{self.PREFIX}{user_id}:{digest}"

    def get(
        self,
        user_id: int,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        if not settings.CACHE_ENABLED:
            return None
        try:
            raw = self.client.get(self._make_key(user_id, query, filters))
            if raw:
                logger.info("Cache HIT for user=%d", user_id)
                return json.loads(raw)
            logger.debug("Cache MISS for user=%d", user_id)
            return None
        except Exception as exc:
            logger.warning("Cache get failed: %s", exc)
            return None

    def set(
        self,
        user_id: int,
        query: str,
        data: Dict[str, Any],
        filters: Optional[Dict[str, Any]] = None,
        ttl: Optional[int] = None,
    ) -> bool:
        if not settings.CACHE_ENABLED:
            return False
        try:
            self.client.setex(
                self._make_key(user_id, query, filters),
                ttl or settings.CACHE_QUERY_TTL,
                json.dumps(data),
            )
            return True
        except Exception as exc:
            logger.warning("Cache set failed: %s", exc)
            return False

    def invalidate_user(self, user_id: int) -> int:
        """Invalidate all cached queries for a user (e.g. after document upload)."""
        try:
            pattern = f"{self.PREFIX}{user_id}:*"
            keys = list(self.client.scan_iter(match=pattern, count=100))
            if keys:
                return self.client.delete(*keys)
            return 0
        except Exception as exc:
            logger.warning("Cache invalidate failed: %s", exc)
            return 0

    def get_stats(self) -> Dict[str, Any]:
        try:
            info = self.client.info("stats")
            hits = info.get("keyspace_hits", 0)
            misses = info.get("keyspace_misses", 0)
            total = hits + misses
            return {
                "hits": hits,
                "misses": misses,
                "hit_rate": round(hits / total * 100, 2) if total else 0.0,
            }
        except Exception:
            return {"hits": 0, "misses": 0, "hit_rate": 0.0}


_cache: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    global _cache
    if _cache is None:
        _cache = CacheService()
    return _cache
