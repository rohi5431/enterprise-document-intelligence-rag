"""
Cross-Encoder Reranker
=======================
Uses a BGE cross-encoder to re-score retrieved chunks against the query.

Model choices
-------------
* ``BAAI/bge-reranker-base``   — best speed/quality tradeoff (default)
* ``BAAI/bge-reranker-large``  — highest quality, ~3× slower
* ``cross-encoder/ms-marco-MiniLM-L-6-v2`` — lighter, good for CPU

The model is loaded once and kept in memory.  Thread safety is guaranteed
by ``sentence_transformers`` internals.
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional

from app.core.config import settings
from rag.retrieval.schemas import RetrievedChunk

logger = logging.getLogger(__name__)

# Lazy import to avoid loading the model at module import time
_cross_encoder = None
_model_name: Optional[str] = None


def _get_cross_encoder(model_name: str):
    """Load and cache the cross-encoder model."""
    global _cross_encoder, _model_name
    if _cross_encoder is None or _model_name != model_name:
        try:
            from sentence_transformers import CrossEncoder

            logger.info("Loading cross-encoder model: %s", model_name)
            t0 = time.perf_counter()
            _cross_encoder = CrossEncoder(model_name, max_length=512)
            _model_name = model_name
            logger.info(
                "Cross-encoder loaded in %.1f s",
                time.perf_counter() - t0,
            )
        except Exception as exc:
            logger.error("Failed to load cross-encoder %s: %s", model_name, exc)
            raise
    return _cross_encoder


class CrossEncoderReranker:
    """
    BGE cross-encoder reranker.

    Parameters
    ----------
    model_name:
        HuggingFace model identifier.
    batch_size:
        Pairs to score per forward pass.
    score_threshold:
        Chunks with rerank score below this value are discarded.
        Set to ``None`` to keep all chunks.
    """

    DEFAULT_MODEL = "BAAI/bge-reranker-base"

    def __init__(
        self,
        model_name: Optional[str] = None,
        batch_size: int = 32,
        score_threshold: Optional[float] = None,
    ) -> None:
        self._model_name = model_name or self.DEFAULT_MODEL
        self._batch_size = batch_size
        self._score_threshold = score_threshold

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def rerank(
        self,
        query: str,
        chunks: List[RetrievedChunk],
        top_k: Optional[int] = None,
    ) -> List[RetrievedChunk]:
        """
        Score each chunk against *query* and return the top-k sorted list.

        Parameters
        ----------
        query:
            The original (unexpanded) user query.
        chunks:
            Candidates from fusion — order does not matter.
        top_k:
            Maximum chunks to return.  If ``None``, all chunks above
            ``score_threshold`` are returned.

        Returns
        -------
        List[RetrievedChunk]
            Sorted descending by ``rerank_score``.
        """
        if not chunks:
            return []

        t0 = time.perf_counter()

        try:
            model = _get_cross_encoder(self._model_name)
        except Exception:
            logger.warning("Cross-encoder unavailable — returning chunks as-is")
            return chunks[:top_k] if top_k else chunks

        # Build (query, passage) pairs
        pairs = [[query, c.text] for c in chunks]

        # Score in batches
        scores: list = model.predict(pairs, batch_size=self._batch_size)

        # Attach scores
        scored_chunks = list(zip(chunks, scores))

        # Apply threshold
        if self._score_threshold is not None:
            scored_chunks = [
                (c, s) for c, s in scored_chunks if s >= self._score_threshold
            ]

        # Sort descending
        scored_chunks.sort(key=lambda x: x[1], reverse=True)

        # Trim
        if top_k:
            scored_chunks = scored_chunks[:top_k]

        result: List[RetrievedChunk] = []
        for chunk, score in scored_chunks:
            chunk.rerank_score = float(score)
            chunk.score = float(score)  # override fusion score with rerank score
            result.append(chunk)

        elapsed = (time.perf_counter() - t0) * 1000
        logger.info(
            "CrossEncoderReranker: %d → %d chunks in %.1f ms",
            len(chunks),
            len(result),
            elapsed,
        )
        return result
