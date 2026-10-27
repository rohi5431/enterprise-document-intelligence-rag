from __future__ import annotations

import time
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.config import settings

_STORE: dict[str, list] = {}  # in-process fallback; use Redis in prod


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests: int = 100, window: int = 60):
        super().__init__(app)
        self.requests = requests
        self.window = window

    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        client = request.client.host if request.client else "unknown"
        now = time.time()
        window_start = now - self.window

        history = _STORE.get(client, [])
        history = [t for t in history if t > window_start]

        if len(history) >= self.requests:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
            )

        history.append(now)
        _STORE[client] = history
        return await call_next(request)
