"""
Hybrid Retriever
=================
Combines :class:`~rag.retrieval.vector_retriever.VectorRetriever` and
:class:`~rag.retrieval.bm25_retriever.BM25Retriever` using either:

* **Reciprocal Rank Fusion (RRF)** — the default; parameter-free and robust.
* **Linear combination** — weighted sum of normalised scores.

The merged candidate set is then passed to the
:class:`~rag.reranking.cross_encoder_reranker.CrossEncoderReranker`
when ``mode == RetrievalMode.HYBRID_RERANKED``.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from rag.retrieval.query_expander import QueryExpander

from rag.retrieval.bm25_retriever import BM25Retriever
from rag.retrieval.schemas import (
    FusionStrategy,
    RetrievalMode,
    RetrievalRequest,
    RetrievalResult,
    RetrievedChunk,
)
from rag.retrieval.vector_retriever import VectorRetriever
from rag.reranking.cross_encoder_reranker import CrossEncoderReranker

logger = logging.getLogger(__name__)


class HybridRetriever:
    """
    Orchestrates dense + sparse retrieval and result fusion.

    Parameters
    ----------
    vector_retriever:
        Injected :class:`VectorRetriever` instance.
    bm25_retriever:
        Injected :class:`BM25Retriever` instance.
    reranker:
        Injected :class:`CrossEncoderReranker` instance.
        Only used when ``mode == HYBRID_RERANKED``.
    """

    def __init__(
        self,
        vector_retriever: Optional[VectorRetriever] = None,
        bm25_retriever: Optional[BM25Retriever] = None,
        reranker: Optional[CrossEncoderReranker] = None,
    ) -> None:
        self._vector = vector_retriever or VectorRetriever()
        from rag.retrieval.bm25_manager import get_bm25

        self._bm25 = bm25_retriever or get_bm25()
        print("\n===== HYBRID INIT =====")
        print("BM25 READY =", self._bm25.is_ready)
        print("BM25 CORPUS =", self._bm25.corpus_size)
        self._reranker = reranker or CrossEncoderReranker()
        self._expander = QueryExpander()

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def retrieve(self, request: RetrievalRequest) -> RetrievalResult:
        """
        Execute the full retrieval pipeline and return a
        :class:`RetrievalResult` with timing breakdowns.

        Pipeline stages
        ---------------
        1. Vector search  (if mode != BM25)
        2. BM25 search    (if mode != VECTOR)
        3. Score fusion   (RRF or linear)
        4. Cross-encoder rerank  (if mode == HYBRID_RERANKED)
        """
        latency: Dict[str, float] = {}
        t_total = time.perf_counter()
        # Query Expansion
        print("\n===== EXPAND QUERY FLAG =====")
        print(request.expand_query)
        if request.expand_query:
            request.expanded_queries = self._expander.expand(
                request.query
            )
        
            print("\n===== QUERY EXPANSION =====")

            for q in request.expanded_queries:
                print("-", q)

        # ── Stage 1: Dense retrieval ───────────────────────────────────
        vector_chunks: List[RetrievedChunk] = []
        if request.mode in (
            RetrievalMode.VECTOR,
            RetrievalMode.HYBRID,
            RetrievalMode.HYBRID_RERANKED,
        ):
            t0 = time.perf_counter()
            vector_chunks = self._vector.retrieve(request)
            latency["vector_ms"] = (time.perf_counter() - t0) * 1000
            logger.debug("Vector: %d chunks", len(vector_chunks))

        # ── Stage 2: Sparse retrieval ──────────────────────────────────
        bm25_chunks: List[RetrievedChunk] = []
        if request.mode in (
            RetrievalMode.BM25,
            RetrievalMode.HYBRID,
            RetrievalMode.HYBRID_RERANKED,
        ):
            t0 = time.perf_counter()
            bm25_chunks = self._bm25.retrieve(request)
            latency["bm25_ms"] = (time.perf_counter() - t0) * 1000
            logger.debug("BM25: %d chunks", len(bm25_chunks))

        # ── Stage 3: Fusion ────────────────────────────────────────────
        t0 = time.perf_counter()
        if request.mode == RetrievalMode.VECTOR:
            fused = vector_chunks[: request.top_k]
        elif request.mode == RetrievalMode.BM25:
            fused = bm25_chunks[: request.top_k]
        else:
            fused = self._fuse(
                vector_chunks,
                bm25_chunks,
                request,
            )
        latency["fusion_ms"] = (time.perf_counter() - t0) * 1000
        logger.debug("After fusion: %d chunks", len(fused))

        # ── Stage 4: Rerank ────────────────────────────────────────────
        final_chunks: List[RetrievedChunk] = fused
        if request.mode == RetrievalMode.HYBRID_RERANKED and fused:
            t0 = time.perf_counter()
            final_chunks = self._reranker.rerank(
                query=request.query,
                chunks=fused,
                top_k=request.final_top_k,
            )
            latency["rerank_ms"] = (time.perf_counter() - t0) * 1000
            logger.debug("After rerank: %d chunks", len(final_chunks))

        latency["total_ms"] = (time.perf_counter() - t_total) * 1000

        logger.info(
            "HybridRetriever [%s]: %d final chunks | latency=%.0f ms",
            request.mode,
            len(final_chunks),
            latency["total_ms"],
        )
        print("\n===== LATENCY =====")
        print(latency)
        return RetrievalResult(
            query=request.query,
            expanded_queries=request.expanded_queries,
            chunks=final_chunks,
            mode=request.mode,
            vector_candidates=len(vector_chunks),
            bm25_candidates=len(bm25_chunks),
            total_candidates=len(vector_chunks) + len(bm25_chunks),
            chunks_after_fusion=len(fused),
            chunks_after_rerank=len(final_chunks),
            latency_ms=latency,
        )

    # ------------------------------------------------------------------ #
    # Fusion algorithms                                                    #
    # ------------------------------------------------------------------ #

    def _fuse(
        self,
        vector_chunks: List[RetrievedChunk],
        bm25_chunks: List[RetrievedChunk],
        request: RetrievalRequest,
    ) -> List[RetrievedChunk]:
        if request.fusion_strategy == FusionStrategy.LINEAR:
            return self._linear_fusion(
                vector_chunks,
                bm25_chunks,
                request.vector_weight,
                request.bm25_weight,
                request.top_k,
            )
        return self._rrf_fusion(vector_chunks, bm25_chunks, request.rrf_k, request.top_k)

    @staticmethod
    def _rrf_fusion(
        vector_chunks: List[RetrievedChunk],
        bm25_chunks: List[RetrievedChunk],
        k: int,
        top_k: int,
    ) -> List[RetrievedChunk]:
        """
        Reciprocal Rank Fusion.

        RRF(d) = Σ 1 / (k + rank_i(d))

        Chunks not appearing in a list receive a rank of ``len(list) + 1``.
        """
        rrf_scores: Dict[str, float] = defaultdict(float)
        chunk_map: Dict[str, RetrievedChunk] = {}

        for rank, chunk in enumerate(vector_chunks, start=1):
            rrf_scores[chunk.chunk_id] += 1.0 / (k + rank)
            chunk_map[chunk.chunk_id] = chunk

        for rank, chunk in enumerate(bm25_chunks, start=1):
            rrf_scores[chunk.chunk_id] += 1.0 / (k + rank)
            if chunk.chunk_id not in chunk_map:
                chunk_map[chunk.chunk_id] = chunk
            else:
                # Enrich the existing chunk with BM25 score
                chunk_map[chunk.chunk_id].bm25_score = chunk.bm25_score

        # Build result list
        fused: List[RetrievedChunk] = []
        for cid, rrf in sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True):
            c = chunk_map[cid]
            c.score = rrf          # overwrite with fusion score
            c.retriever_source = "hybrid"
            fused.append(c)
            if len(fused) >= top_k:
                break

        return fused

    @staticmethod
    def _linear_fusion(
        vector_chunks: List[RetrievedChunk],
        bm25_chunks: List[RetrievedChunk],
        vector_weight: float,
        bm25_weight: float,
        top_k: int,
    ) -> List[RetrievedChunk]:
        """
        Weighted linear combination of min-max normalised scores.
        """

        def _normalise(chunks: List[RetrievedChunk]) -> Dict[str, float]:
            if not chunks:
                return {}
            scores = [c.score for c in chunks]
            lo, hi = min(scores), max(scores)
            rng = hi - lo or 1.0
            return {c.chunk_id: (c.score - lo) / rng for c in chunks}

        v_norm = _normalise(vector_chunks)
        b_norm = _normalise(bm25_chunks)

        all_ids = set(v_norm) | set(b_norm)
        chunk_map: Dict[str, RetrievedChunk] = {
            c.chunk_id: c for c in vector_chunks + bm25_chunks
        }

        combined: List[Tuple[str, float]] = []
        for cid in all_ids:
            combined_score = (
                vector_weight * v_norm.get(cid, 0.0)
                + bm25_weight * b_norm.get(cid, 0.0)
            )
            combined.append((cid, combined_score))

        combined.sort(key=lambda x: x[1], reverse=True)

        fused: List[RetrievedChunk] = []
        for cid, score in combined[:top_k]:
            c = chunk_map[cid]
            c.score = score
            c.retriever_source = "hybrid"
            fused.append(c)

        return fused
