from __future__ import annotations

from types import SimpleNamespace

from rag.llm.gemini_client import GeminiClient


def test_gemini_api_key_is_sent_in_header_not_url(monkeypatch):
    observed = {}

    def fake_post(url, **kwargs):
        observed["url"] = url
        observed.update(kwargs)
        return SimpleNamespace(
            status_code=200,
            raise_for_status=lambda: None,
            json=lambda: {
                "candidates": [
                    {"content": {"parts": [{"text": "safe test answer"}]}}
                ]
            },
        )

    monkeypatch.setattr("rag.llm.gemini_client.requests.post", fake_post)
    client = GeminiClient(api_key="test-key-not-a-secret", max_retries=1)

    assert client.generate("safe test prompt") == "safe test answer"
    assert "test-key-not-a-secret" not in observed["url"]
    assert observed["headers"]["x-goog-api-key"] == "test-key-not-a-secret"
