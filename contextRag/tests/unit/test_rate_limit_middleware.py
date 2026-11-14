from __future__ import annotations

import pytest
from fastapi import Request
from redis.exceptions import ConnectionError
from starlette.applications import Starlette
from starlette.responses import Response

from app.core.config import settings
from app.middleware.rate_limit_middleware import RateLimitMiddleware


class FakeRedis:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.count = 0

    async def eval(self, script, key_count, key, cutoff, now, limit, member, ttl):
        if self.fail:
            raise ConnectionError("test-only connection failure")
        self.count += 1
        return int(self.count <= int(limit))


def make_request(app: Starlette, path: str) -> Request:
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
            "app": app,
        }
    )


@pytest.mark.asyncio
async def test_authentication_rate_limit_is_shared_and_enforced(monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    app = Starlette()
    app.state.rate_limit_redis = FakeRedis()
    middleware = RateLimitMiddleware(app, requests=100, window=60)
    request = make_request(app, "/api/v1/auth/login")

    async def endpoint(_request):
        return Response("ok")

    responses = [await middleware.dispatch(request, endpoint) for _ in range(11)]

    assert [response.status_code for response in responses[:10]] == [200] * 10
    assert responses[10].status_code == 429


@pytest.mark.asyncio
async def test_rate_limit_fails_closed_when_redis_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    app = Starlette()
    app.state.rate_limit_redis = FakeRedis(fail=True)
    middleware = RateLimitMiddleware(app, requests=100, window=60)

    async def endpoint(_request):
        return Response("unexpected")

    response = await middleware.dispatch(
        make_request(app, "/api/v1/documents/upload"),
        endpoint,
    )

    assert response.status_code == 503
    assert response.body == b'{"detail":"Request protection is temporarily unavailable."}'
