"""
Retrieval Data Contracts
=========================
All Pydantic models / dataclasses that flow between retrieval components.
Nothing here imports from the rest of the system — zero circular-import risk.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class RetrievalMode(str, Enum):
    """How to combine results from multiple retrievers."""
    VECTOR = "vector"        # dense only
    BM25 = "bm25"            # sparse only
    HYBRID = "hybrid"        # vector + BM25 fused via RRF
    HYBRID_RERANKED = "hybrid_reranked"  # hybrid then cross-encoder rerank


class FusionStrategy(str, Enum):
    """Fusion algorithm for hybrid retrieval."""
    RRF = "rrf"              # Reciprocal Rank Fusion (default)
    LINEAR = "linear"        # weighted linear combination


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

@dataclass
class MetadataFilter:
    """
    Structured filter applied to Qdrant payload *before* ANN search.

    Attributes:
        user_id:    Restrict to chunks owned by this user (multi-tenant isolation).
        doc_ids:    Restrict to specific document IDs.
        tags:       All tags in the list must be present on the chunk.
        any_tags:   At least one tag in the list must be present.
        file_types: Restrict to specific file extensions  (e.g. ["pdf", "txt"]).
        date_from:  ISO-8601 UTC timestamp lower bound on `created_at`.
        date_to:    ISO-8601 UTC timestamp upper bound on `created_at`.
        extra:      Arbitrary additional payload equality filters.
    """
    user_id: Optional[int] = None
    doc_ids: Optional[List[int]] = None
    tags: Optional[List[str]] = None          # AND semantics
    any_tags: Optional[List[str]] = None      # OR semantics
    file_types: Optional[List[str]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TagFilter:
    """Convenience wrapper when callers only want tag-based filtering."""
    tags: List[str]
    match_all: bool = True  # True = AND, False = OR


# ---------------------------------------------------------------------------
# Request / Response
# ---------------------------------------------------------------------------

@dataclass
class RetrievalRequest:
    """
    Single intake object for *any* retrieval path.

    The pipeline reads `mode` to decide which retrievers to activate.
    All optional fields are progressively enriched by the pipeline stages.
    """
    query: str
    mode: RetrievalMode = RetrievalMode.HYBRID_RERANKED
    top_k: int = 10              # candidates per retriever
    final_top_k: int = 5         # chunks returned after reranking
    filters: Optional[MetadataFilter] = None
    expand_query: bool = True    # run query expansion before retrieval
    fusion_strategy: FusionStrategy = FusionStrategy.RRF
    rrf_k: int = 60              # RRF constant (higher = smoother)
    vector_weight: float = 0.7   # used only for LINEAR fusion
    bm25_weight: float = 0.3     # used only for LINEAR fusion
    # ── filled by QueryExpander ──────────────────────────────────────────
    expanded_queries: List[str] = field(default_factory=list)


@dataclass
class RetrievedChunk:
    """
    A single chunk returned by a retriever, enriched with provenance info.
    """
    chunk_id: str               # Qdrant point ID (str UUID)
    doc_id: int                 # PostgreSQL Document.id
    text: str
    score: float                # raw retriever score

    # Provenance / metadata ─────────────────────────────────────────────
    doc_title: Optional[str] = None
    doc_filename: Optional[str] = None
    sequence_number: Optional[int] = None
    user_id: Optional[int] = None
    tags: List[str] = field(default_factory=list)
    file_type: Optional[str] = None
    page_number: Optional[int] = None

    # Scoring bookkeeping ────────────────────────────────────────────────
    vector_score: Optional[float] = None
    bm25_score: Optional[float] = None
    rerank_score: Optional[float] = None
    retriever_source: str = "unknown"   # "vector" | "bm25" | "hybrid"


@dataclass
class RetrievalResult:
    """
    Final output of the retrieval pipeline — wraps chunks plus analytics.
    """
    query: str
    expanded_queries: List[str]
    chunks: List[RetrievedChunk]
    mode: RetrievalMode

    # Analytics ─────────────────────────────────────────────────────────
    vector_candidates: int = 0
    bm25_candidates: int = 0
    total_candidates: int = 0
    chunks_after_fusion: int = 0
    chunks_after_rerank: int = 0
    latency_ms: Dict[str, float] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

@dataclass
class EvaluationSample:
    """One ground-truth QA pair for retrieval evaluation."""
    query: str
    relevant_doc_ids: List[int]
    relevant_chunk_ids: Optional[List[str]] = None


@dataclass
class EvaluationMetrics:
    """Metrics computed by RetrievalEvaluator."""
    precision_at_k: float
    recall_at_k: float
    ndcg_at_k: float
    mrr: float          # Mean Reciprocal Rank
    hit_rate: float
    k: int
    num_samples: int
