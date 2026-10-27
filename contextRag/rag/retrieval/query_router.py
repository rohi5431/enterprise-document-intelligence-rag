"""
Query Router
=============
Classifies an incoming user query and recommends the optimal retrieval mode.

Classification logic
--------------------
1. **GRAPH** — relational / entity-relationship questions.
   Signals: "relationship between", "connect", "linked to", "how does X
   relate to Y", "dependency", "associated with", "compare X and Y", etc.

2. **BM25** — exact-match keyword / factual lookup questions.
   Signals: version numbers, IDs, error codes, quoted strings, short precise
   lookups ("what is the value of X"), table/section references.

3. **VECTOR** — conceptual / semantic / explanatory questions.
   Signals: "explain", "describe", "summarise", "what does X mean",
   "overview of", "tell me about", "how does X work".

4. **HYBRID_RERANKED** — default for ambiguous or multi-faceted questions.

The router is intentionally fast and dependency-free (rules-based).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Tuple

from rag.retrieval.schemas import RetrievalMode


# ---------------------------------------------------------------------------
# Signal patterns
# ---------------------------------------------------------------------------

_GRAPH_PATTERNS = [
    r"\brelat(ion|ionship|ed|ions)\b",
    r"\bconnect(ed|ion|s)?\b",
    r"\blink(ed|s)?\b",
    r"\basso(ciat|ciation)\w*\b",
    r"\bdepend(s|ency|encies|ent)?\b",
    r"\bwho (is|was|are) .*\bwith\b",
    r"\bhow does .{0,40} (relate|connect|interact|link)\b",
    r"\bcompar(e|ison|ing)\b.{0,40}\band\b",
    r"\bbetween\b.{0,40}\band\b",
    r"\bnetwork(s)?\b",
    r"\bgraph\b",
    r"\binfluenc(e|ed|ing)\b",
    r"\bimpact(s|ed|ing)?\b.*\bon\b",
    r"\bwhat (are the|is the) (link|connection|relationship|difference)\b",
    r"\bdifference between\b",
    r"\bsimilar(ity|ities|to)?\b",
    r"\bchain(s)? of\b",
]

_BM25_PATTERNS = [
    r"\bv\d+[\.\d]*\b",                       # version numbers like v1.2.3
    r"\b\d{3,}\b",                             # numeric IDs / codes
    r'"[^"]{2,}"',                             # quoted exact phrases
    r"\berror\s+\w*\d+\w*\b",                  # error codes
    r"\bcode\b.{0,20}\b\d+\b",
    r"\bspecific(ally)?\b",
    r"\bexact(ly)?\b",
    r"\blookup\b",
    r"\bfind (the|a) (exact|specific|particular)\b",
    r"\bsection\s+\d+",
    r"\bpage\s+\d+",
    r"\bclause\s+\d+",
    r"\bartcile\s+\d+",
    r"\bwhat (is the|are the) (value|name|number|id|code|date)\b",
    r"\blist (all|the)\b",
]

_VECTOR_PATTERNS = [
    r"\bexplain\b",
    r"\bdescrib(e|ing)\b",
    r"\bsummariz(e|ing|ation)\b",
    r"\bsummarise\b",
    r"\boverview\b",
    r"\bwhat does .{1,40} mean\b",
    r"\bwhat is (a|an|the)?\b",
    r"\bhow does .{1,40} work\b",
    r"\btell me about\b",
    r"\bunderstand\b",
    r"\bconcept(s|ual)?\b",
    r"\bintroduc(e|tion|ing)\b",
    r"\bdefin(e|ition|ing)\b",
    r"\bwhat (are|were|was)\b",
    r"\bwhy (is|are|was|were|does|did)\b",
    r"\bwhen (was|did|is)\b",
    r"\bwhere (is|was|can)\b",
]


def _count_pattern_hits(text: str, patterns: list) -> int:
    count = 0
    for p in patterns:
        if re.search(p, text, re.IGNORECASE):
            count += 1
    return count


# ---------------------------------------------------------------------------
# RouterDecision dataclass
# ---------------------------------------------------------------------------

@dataclass
class RouterDecision:
    mode: RetrievalMode
    confidence: float    # 0.0 – 1.0
    reason: str


# ---------------------------------------------------------------------------
# QueryRouter
# ---------------------------------------------------------------------------

class QueryRouter:
    """
    Rule-based query classifier that selects the best RetrievalMode.

    Usage
    -----
    >>> router = QueryRouter()
    >>> decision = router.route("What is the relationship between X and Y?")
    >>> decision.mode  # RetrievalMode.GRAPH
    """

    def route(self, query: str) -> RouterDecision:
        """
        Classify a query and return a RouterDecision.

        Parameters
        ----------
        query : str
            Raw user question.

        Returns
        -------
        RouterDecision
        """
        q = query.strip()
        if not q:
            return RouterDecision(
                mode=RetrievalMode.HYBRID_RERANKED,
                confidence=0.5,
                reason="empty query — defaulting to hybrid_reranked",
            )

        graph_hits = _count_pattern_hits(q, _GRAPH_PATTERNS)
        bm25_hits = _count_pattern_hits(q, _BM25_PATTERNS)
        vector_hits = _count_pattern_hits(q, _VECTOR_PATTERNS)

        scores = {
            "graph": graph_hits,
            "bm25": bm25_hits,
            "vector": vector_hits,
        }
        total = max(sum(scores.values()), 1)

        # Determine winner
        best = max(scores, key=lambda k: scores[k])
        best_count = scores[best]

        # Must beat the next-best by at least 1 to make a confident call
        sorted_scores = sorted(scores.values(), reverse=True)
        margin = sorted_scores[0] - sorted_scores[1]

        if best_count == 0 or margin == 0:
            return RouterDecision(
                mode=RetrievalMode.HYBRID_RERANKED,
                confidence=0.5,
                reason=f"no dominant signal (graph={graph_hits}, bm25={bm25_hits}, vector={vector_hits}) — using hybrid_reranked",
            )

        confidence = min(0.95, 0.5 + (best_count / total) * 0.5 + (margin / total) * 0.3)

        if best == "graph":
            return RouterDecision(
                mode=RetrievalMode.GRAPH,
                confidence=round(confidence, 2),
                reason=f"relational query detected (graph_signals={graph_hits}) — using graph retrieval",
            )
        elif best == "bm25":
            return RouterDecision(
                mode=RetrievalMode.BM25,
                confidence=round(confidence, 2),
                reason=f"exact-match query detected (bm25_signals={bm25_hits}) — using BM25",
            )
        else:
            return RouterDecision(
                mode=RetrievalMode.VECTOR,
                confidence=round(confidence, 2),
                reason=f"semantic/conceptual query detected (vector_signals={vector_hits}) — using vector search",
            )
