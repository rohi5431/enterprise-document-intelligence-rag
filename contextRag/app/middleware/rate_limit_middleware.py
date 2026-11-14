from __future__ import annotations

import hashlib
import time
import uuid

from fastapi import Request, Response
from redis.asyncio import Redis
from redis.exceptions import RedisError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

_SLIDING_WINDOW_SCRIPT = """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then
    return 0
end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return 1
"""


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests: int = 100, window: int = 60):
        super().__init__(app)
        self.requests = requests
        self.window = window

    def _policy(self, request: Request) -> tuple[str, int]:
        if request.method == "POST" and request.url.path in {
            "/api/v1/auth/login",
            "/api/v1/auth/token",
        }:
            return "authentication", min(self.requests, 10)
        if request.method == "POST" and request.url.path == "/api/v1/auth/register":
            return "registration", min(self.requests, 5)
        if request.method == "POST" and request.url.path == "/api/v1/documents/upload":
            return "upload", min(self.requests, 10)
        return "global", self.requests

    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        client_host = request.client.host if request.client else "unknown"
        client_hash = hashlib.sha256(client_host.encode("utf-8")).hexdigest()
        scope, limit = self._policy(request)
        key = f"api-rate-limit:{scope}:{client_hash}"

        now_ms = time.time_ns() // 1_000_000
        try:
            redis_client = getattr(request.app.state, "rate_limit_redis", None)
            if redis_client is None:
                redis_client = Redis.from_url(
                    settings.REDIS_URL,
                    max_connections=settings.REDIS_MAX_CONNECTIONS,
                    socket_connect_timeout=5,
                    socket_timeout=5,
                  )
                request.app.state.rate_limit_redis = redis_client

            allowed = await redis_client.eval(
                _SLIDING_WINDOW_SCRIPT,
                1,
                key,
                now_ms - self.window * 1000,
                now_ms,
                limit,
                f"{now_ms}:{uuid.uuid4().hex}",
                self.window * 1000,
            )
        except (RedisError, ValueError) as exc:
            logger.error("rate_limit_store_unavailable", error_type=type(exc).__name__)
            return JSONResponse(
                status_code=503,
                content={"detail": "Request protection is temporarily unavailable."},
            )

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
            )

        return await call_next(request)
