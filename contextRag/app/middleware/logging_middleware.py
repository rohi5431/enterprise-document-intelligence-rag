from __future__ import annotations

import time
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.logger import get_logger

logger = get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())[:8]
        start = time.perf_counter()

        logger.info(
            "request_start",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            client=request.client.host if request.client else "unknown",
        )

        try:
            response = await call_next(request)
        except Exception as exc:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(
                "request_error",
                request_id=request_id,
                error=str(exc),
                elapsed_ms=round(elapsed, 2),
            )
            raise

        elapsed = (time.perf_counter() - start) * 1000
        logger.info(
            "request_end",
            request_id=request_id,
            status_code=response.status_code,
            elapsed_ms=round(elapsed, 2),
        )
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = str(round(elapsed, 2))
        return response
