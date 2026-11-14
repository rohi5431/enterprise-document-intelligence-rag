from __future__ import annotations

import pytest

from app.core.config import settings
from app.middleware.upload_size_middleware import UploadSizeLimitMiddleware


@pytest.mark.asyncio
async def test_upload_middleware_limits_body_before_multipart_parsing(monkeypatch):
    monkeypatch.setattr(settings, "MAX_FILE_SIZE_MB", 1)
    response_messages = []
    received = False

    async def fake_app(scope, receive, send):
        nonlocal received
        received = True
        await receive()
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [],
            }
        )

    async def receive():
        return {
            "type": "http.request",
            "body": b"x" * (settings.max_file_size_bytes + 256 * 1024 + 1),
            "more_body": False,
        }

    async def send(message):
        response_messages.append(message)

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/documents/upload",
        "headers": [],
    }

    await UploadSizeLimitMiddleware(fake_app)(scope, receive, send)

    assert received
    assert response_messages[0]["status"] == 413
    assert b"maximum allowed size" in response_messages[1]["body"]
