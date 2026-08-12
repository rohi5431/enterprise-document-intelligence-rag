"""
Google Gemini LLM Client with Rate Limit Backoff
"""
from __future__ import annotations

import logging
import time
from typing import Generator, Optional

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)


class GeminiClient:
    """Client for Google Gemini API with rate-limit retry support."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        max_retries: int = 3,
        backoff_factor: float = 5.0,
    ) -> None:
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.model = model or settings.GEMINI_MODEL
        self.timeout = settings.OLLAMA_TIMEOUT
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor

    def generate(self, prompt: str, max_tokens: int = 512) -> str:
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": max_tokens,
            },
        }

        for attempt in range(1, self.max_retries + 1):
            try:
                resp = requests.post(url, json=payload, timeout=self.timeout)
                if resp.status_code == 429:
                    retry_delay = self.backoff_factor * (2 ** (attempt - 1))
                    logger.warning(
                        f"Gemini API rate limit (429) hit. Attempt {attempt}/{self.max_retries}. "
                        f"Retrying in {retry_delay:.1f}s..."
                    )
                    time.sleep(retry_delay)
                    continue

                resp.raise_for_status()
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    return parts[0].get("text", "") if parts else ""
                return ""
            except Exception as exc:
                if attempt == self.max_retries:
                    logger.error("Gemini generation failed after retries: %s", exc)
                    raise RuntimeError(
                        f"Gemini generation failed (Quota/Rate Limit reached). "
                        f"Please wait 20s or switch LLM_PROVIDER=ollama in .env. Details: {exc}"
                    ) from exc
                time.sleep(self.backoff_factor)

        raise RuntimeError("Gemini request failed after maximum retries.")

    def generate_stream(self, prompt: str) -> Generator[str, None, None]:
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:streamGenerateContent?key={self.api_key}&alt=sse"
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 512},
        }

        for attempt in range(1, self.max_retries + 1):
            try:
                resp = requests.post(url, json=payload, timeout=self.timeout, stream=True)
                if resp.status_code == 429:
                    retry_delay = self.backoff_factor * (2 ** (attempt - 1))
                    logger.warning(
                        f"Gemini streaming rate limit (429) hit. Attempt {attempt}/{self.max_retries}. "
                        f"Retrying in {retry_delay:.1f}s..."
                    )
                    time.sleep(retry_delay)
                    continue

                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line or not line.startswith(b"data: "):
                        continue
                    import json
                    chunk = json.loads(line[6:])
                    for candidate in chunk.get("candidates", []):
                        for part in candidate.get("content", {}).get("parts", []):
                            text = part.get("text", "")
                            if text:
                                yield text
                return
            except Exception as exc:
                if attempt == self.max_retries:
                    logger.error("Gemini streaming failed after retries: %s", exc)
                    raise RuntimeError(f"Gemini streaming failed: {exc}") from exc
                time.sleep(self.backoff_factor)

