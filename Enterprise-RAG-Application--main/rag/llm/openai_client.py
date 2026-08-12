"""
OpenAI LLM Client
"""
from __future__ import annotations

import logging
from typing import Generator, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class OpenAIClient:
    """Client for OpenAI chat completions."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ) -> None:
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.model = model or settings.OPENAI_MODEL
        self.timeout = settings.OLLAMA_TIMEOUT

    def _get_client(self):
        from openai import OpenAI
        return OpenAI(api_key=self.api_key, timeout=self.timeout)

    def generate(self, prompt: str, max_tokens: int = 512) -> str:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY not configured")
        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content or ""
        except Exception as exc:
            logger.error("OpenAI generation failed: %s", exc)
            raise RuntimeError(f"OpenAI generation failed: {exc}") from exc

    def generate_stream(self, prompt: str) -> Generator[str, None, None]:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY not configured")
        try:
            client = self._get_client()
            stream = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=512,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as exc:
            logger.error("OpenAI streaming failed: %s", exc)
            raise RuntimeError(f"OpenAI streaming failed: {exc}") from exc
