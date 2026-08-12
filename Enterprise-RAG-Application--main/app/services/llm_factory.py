"""
LLM Factory — returns the configured LLM client based on provider setting.
"""
from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

from app.core.config import settings


@runtime_checkable
class LLMClient(Protocol):
    def generate(self, prompt: str, max_tokens: int = 512) -> str: ...
    def generate_stream(self, prompt: str): ...


def get_llm_client(
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> LLMClient:
    """
    Return an LLM client for the given provider.

    Supported providers: ollama | openai | gemini
    """
    provider = (provider or settings.LLM_PROVIDER).lower()

    if provider == "openai":
        from rag.llm.openai_client import OpenAIClient
        return OpenAIClient(model=model or settings.OPENAI_MODEL)

    if provider == "gemini":
        from rag.llm.gemini_client import GeminiClient
        return GeminiClient(model=model or settings.GEMINI_MODEL)

    from rag.llm.ollama_client import OllamaClient
    return OllamaClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=model or settings.OLLAMA_MODEL,
    )
