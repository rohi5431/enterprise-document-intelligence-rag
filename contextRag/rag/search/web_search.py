"""
Web Search Service
==================
Provides internet search fallback via DuckDuckGo when RAG retrieval
returns no results or very low-confidence chunks.

Usage
-----
>>> from rag.search.web_search import search_web, should_use_web_search
>>> if should_use_web_search(chunks, threshold=0.3):
...     web_ctx = search_web("What is quantum computing?")
"""
from __future__ import annotations

import logging
import time
from typing import List, Optional

from rag.retrieval.schemas import RetrievedChunk

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Decision helper
# ---------------------------------------------------------------------------

def should_use_web_search(
    chunks: List[RetrievedChunk],
    threshold: float = 0.3,
) -> bool:
    """
    Return True when web search should be used as a fallback.

    Conditions:
    - No chunks were retrieved, OR
    - The best-scoring chunk is below the confidence threshold.
    """
    if not chunks:
        return True
    best_score = max((c.score for c in chunks), default=0.0)
    return best_score < threshold


# ---------------------------------------------------------------------------
# Search function
# ---------------------------------------------------------------------------

def search_web(query: str, max_results: int = 5) -> str:
    """
    Search DuckDuckGo and return a formatted context string.

    Returns
    -------
    str
        Formatted text ready to inject into an LLM prompt, or empty string
        on failure.
    """
    try:
        from duckduckgo_search import DDGS

        t0 = time.perf_counter()
        results: List[dict] = []

        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append(r)

        elapsed = (time.perf_counter() - t0) * 1000
        logger.info(
            "Web search: query=%r → %d results (%.0f ms)",
            query[:60], len(results), elapsed,
        )

        if not results:
            return ""

        lines = ["[WEB SEARCH RESULTS — from the internet]", ""]
        for i, r in enumerate(results, 1):
            title = r.get("title", "").strip()
            body = r.get("body", "").strip()
            href = r.get("href", "").strip()
            if title or body:
                lines.append(f"[Web Source {i}] {title}")
                if body:
                    lines.append(body[:500])
                if href:
                    lines.append(f"URL: {href}")
                lines.append("")

        return "\n".join(lines).strip()

    except ImportError:
        logger.warning("duckduckgo-search not installed; web search unavailable")
        return ""
    except Exception as exc:
        logger.warning("Web search failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Web search context builder (used in RAG pipeline)
# ---------------------------------------------------------------------------

def build_web_search_context(query: str, max_results: int = 5) -> Optional[str]:
    """
    Wrapper that returns None on failure so callers can handle gracefully.
    """
    ctx = search_web(query, max_results=max_results)
    return ctx if ctx else None
