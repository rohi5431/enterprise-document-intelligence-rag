"""
Query Expander
==============
Generates semantically-related query variants so that retrievers
can cast a wider net before fusion and reranking.

Strategy
--------
1. **LLM-based expansion** (preferred): asks Ollama to rephrase / expand
   the user query into N alternative queries.
2. **Keyword extraction** (fallback): extracts salient terms from the
   original query and builds simple variants.

Both paths return a ``List[str]`` that is appended to
:attr:`RetrievalRequest.expanded_queries`.
"""

from __future__ import annotations

import logging
import re
from typing import List, Optional

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_LLM_EXPAND_PROMPT = """\
You are a search query optimization expert for a document retrieval system.

Given the user query, generate {n} alternative search queries that retrieve the same facts from PDF resumes, CVs, and technical documents.

Guidelines:
- Include section headings when relevant (e.g., PROJECT EXPERIENCE, ACHIEVEMENTS, EDUCATION).
- Replace vague phrases like "inside the resume" with concrete keywords from the question topic.
- Keep each alternative on its own line with no numbering or bullets.
- Preserve specific names, technologies, and section references from the original query.

Original query: {query}

Alternative queries:"""

_STOP_WORDS = frozenset(
    {
        "a", "an", "the", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "may", "might", "can", "shall",
        "of", "in", "on", "at", "to", "for", "with", "by", "from",
        "up", "about", "into", "through", "during", "and", "or", "but",
        "not", "so", "yet", "both", "either", "neither", "nor",
        "what", "which", "who", "whom", "how", "when", "where", "why",
        "this", "that", "these", "those",
    }
)


# ---------------------------------------------------------------------------
# QueryExpander
# ---------------------------------------------------------------------------

class QueryExpander:
    """
    Generates expanded query variants for multi-query retrieval.

    Parameters
    ----------
    n_expansions:
        Number of alternative queries to produce (excluding the original).
    use_llm:
        If ``True`` (default), call Ollama for semantic expansion.
        Falls back to keyword-based expansion automatically on failure.
    llm_base_url:
        Ollama base URL. Defaults to ``settings.OLLAMA_BASE_URL``.
    model:
        Ollama model to use. Defaults to ``settings.OLLAMA_MODEL``.
    timeout:
        HTTP timeout for the Ollama call in seconds.
    """

    def __init__(
        self,
        n_expansions: int = 3,
        use_llm: bool = True,
        llm_base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: int = 30,
    ) -> None:
        self.n_expansions = n_expansions
        self.use_llm = use_llm
        self.llm_base_url = llm_base_url or settings.OLLAMA_BASE_URL
        self.model = model or settings.OLLAMA_MODEL
        self.timeout = timeout

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def expand(self, query: str) -> List[str]:
        """
        Return the original query **plus** up to *n_expansions* variants.

        The original is always the first element so the caller can still
        use ``expanded_queries[0]`` as the canonical query.

        Parameters
        ----------
        query:
            The raw user question.

        Returns
        -------
        List[str]
            [original, variant1, variant2, ...]
        """
        if not query or not query.strip():
            return [query]

        variants: List[str] = []

        if self.use_llm:
            variants = self._llm_expand(query)

        if not variants:
            logger.debug("LLM expansion unavailable; using keyword fallback.")
            variants = self._keyword_expand(query)

        # Deduplicate while preserving order
        seen: set = {query.strip().lower()}
        unique: List[str] = [query]
        for v in variants:
            v_clean = v.strip()
            if v_clean and v_clean.lower() not in seen:
                seen.add(v_clean.lower())
                unique.append(v_clean)
            if len(unique) >= self.n_expansions + 1:
                break

        logger.info(
            "Query expanded: original=%r → %d variants", query, len(unique) - 1
        )
        return unique

    # ------------------------------------------------------------------ #
    # Private helpers                                                      #
    # ------------------------------------------------------------------ #

    def _llm_expand(self, query: str) -> List[str]:
        """Call Ollama to get semantic query expansions."""
        prompt = _LLM_EXPAND_PROMPT.format(n=self.n_expansions, query=query)
        try:
            resp = requests.post(
                f"{self.llm_base_url}/api/generate",
                json={"model": self.model, "prompt": prompt, "stream": False},
                timeout=self.timeout,
            )
            resp.raise_for_status()
            raw: str = resp.json().get("response", "")
            variants = self._parse_llm_output(raw)
            logger.debug("LLM produced %d variants", len(variants))
            return variants
        except Exception as exc:
            logger.warning("LLM query expansion failed: %s", exc)
            return []

    @staticmethod
    def _parse_llm_output(raw: str) -> List[str]:
        """Extract clean lines from LLM output."""
        lines = raw.strip().splitlines()
        variants = []
        for line in lines:
            # Strip numbering, bullets, dashes, etc.
            clean = re.sub(r"^[\s\d\.\-\*\)\]]+", "", line).strip()
            if clean and len(clean) > 5:
                variants.append(clean)
        return variants

    def _keyword_expand(self, query: str) -> List[str]:
        """
        Lightweight keyword-based fallback.

        Strategies applied (each producing one variant):
        1. Drop stop-words → shorter keyword query
        2. Prefix with "explain" → encourages definitional context
        3. Prefix with "how does" → encourages procedural context
        4. Resume/project hints → targets common CV section headings
        """
        words = query.lower().split()
        keywords = [w for w in words if w not in _STOP_WORDS and len(w) > 2]

        variants: List[str] = []
        if keywords:
            variants.append(" ".join(keywords))
        variants.append(f"explain {query}")
        variants.append(f"how does {query} work")

        lowered = query.lower()
        if any(term in lowered for term in ("project", "portfolio", "experience")):
            variants.append("PROJECT EXPERIENCE section resume CV")
        if any(term in lowered for term in ("achievement", "certificate", "leetcode", "rating")):
            variants.append("ACHIEVEMENTS CERTIFICATES section resume")

        return variants[: self.n_expansions]
