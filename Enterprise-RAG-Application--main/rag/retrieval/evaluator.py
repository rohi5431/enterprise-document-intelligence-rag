"""
Retrieval Evaluator
====================
Offline evaluation of any retriever using standard IR metrics.

Metrics computed
----------------
* Precision@K
* Recall@K
* NDCG@K  (Normalised Discounted Cumulative Gain)
* MRR     (Mean Reciprocal Rank)
* Hit Rate@K

Usage
-----
>>> evaluator = RetrievalEvaluator(retriever=my_hybrid_retriever, k=5)
>>> report = evaluator.evaluate(samples)
>>> print(report)
"""

from __future__ import annotations

import logging
import math
import time
from typing import Callable, List, Optional, Set

from rag.retrieval.schemas import (
    EvaluationMetrics,
    EvaluationSample,
    MetadataFilter,
    RetrievalMode,
    RetrievalRequest,
    RetrievalResult,
    RetrievedChunk,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# RetrievalEvaluator
# ---------------------------------------------------------------------------

class RetrievalEvaluator:
    """
    Evaluates a retrieval callable against a set of
    :class:`~rag.retrieval.schemas.EvaluationSample` ground-truth pairs.

    Parameters
    ----------
    retriever_fn:
        Any callable that accepts a :class:`RetrievalRequest` and returns
        a :class:`RetrievalResult` or ``List[RetrievedChunk]``.
    k:
        Cutoff used for all @K metrics.
    mode:
        Retrieval mode forwarded to ``RetrievalRequest``.
    """

    def __init__(
        self,
        retriever_fn: Callable[[RetrievalRequest], RetrievalResult],
        k: int = 5,
        mode: RetrievalMode = RetrievalMode.HYBRID_RERANKED,
    ) -> None:
        self._fn = retriever_fn
        self.k = k
        self.mode = mode

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def evaluate(
        self,
        samples: List[EvaluationSample],
        filters: Optional[MetadataFilter] = None,
    ) -> EvaluationMetrics:
        """
        Run retrieval for every sample and aggregate metrics.

        Parameters
        ----------
        samples:
            Ground-truth QA pairs with ``relevant_doc_ids``.
        filters:
            Optional filter applied to every request (e.g. user_id).

        Returns
        -------
        EvaluationMetrics
        """
        if not samples:
            raise ValueError("samples must not be empty")

        precision_sum = recall_sum = ndcg_sum = mrr_sum = hit_sum = 0.0
        total = len(samples)

        for sample in samples:
            request = RetrievalRequest(
                query=sample.query,
                mode=self.mode,
                final_top_k=self.k,
                top_k=max(self.k * 2, 20),
                filters=filters,
            )
            try:
                result = self._fn(request)
                chunks = result.chunks if isinstance(result, RetrievalResult) else result
            except Exception as exc:
                logger.error("Retrieval failed for query %r: %s", sample.query, exc)
                chunks = []

            top_k_chunks = chunks[: self.k]
            relevant_docs: Set[int] = set(sample.relevant_doc_ids)

            precision_sum += self._precision(top_k_chunks, relevant_docs)
            recall_sum += self._recall(top_k_chunks, relevant_docs)
            ndcg_sum += self._ndcg(top_k_chunks, relevant_docs)
            mrr_sum += self._mrr(top_k_chunks, relevant_docs)
            hit_sum += self._hit(top_k_chunks, relevant_docs)

        return EvaluationMetrics(
            precision_at_k=precision_sum / total,
            recall_at_k=recall_sum / total,
            ndcg_at_k=ndcg_sum / total,
            mrr=mrr_sum / total,
            hit_rate=hit_sum / total,
            k=self.k,
            num_samples=total,
        )

    def evaluate_and_report(
        self,
        samples: List[EvaluationSample],
        filters: Optional[MetadataFilter] = None,
    ) -> dict:
        """Evaluate and return a human-readable dict report."""
        t0 = time.perf_counter()
        metrics = self.evaluate(samples, filters)
        elapsed = (time.perf_counter() - t0) * 1000

        return {
            "evaluation_summary": {
                f"precision@{metrics.k}": round(metrics.precision_at_k, 4),
                f"recall@{metrics.k}": round(metrics.recall_at_k, 4),
                f"ndcg@{metrics.k}": round(metrics.ndcg_at_k, 4),
                "mrr": round(metrics.mrr, 4),
                f"hit_rate@{metrics.k}": round(metrics.hit_rate, 4),
            },
            "meta": {
                "num_samples": metrics.num_samples,
                "k": metrics.k,
                "mode": self.mode,
                "elapsed_ms": round(elapsed, 1),
            },
        }

    # ------------------------------------------------------------------ #
    # Metric helpers                                                       #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _precision(chunks: List[RetrievedChunk], relevant: Set[int]) -> float:
        if not chunks:
            return 0.0
        hits = sum(1 for c in chunks if c.doc_id in relevant)
        return hits / len(chunks)

    @staticmethod
    def _recall(chunks: List[RetrievedChunk], relevant: Set[int]) -> float:
        if not relevant:
            return 1.0
        hits = sum(1 for c in chunks if c.doc_id in relevant)
        return hits / len(relevant)

    @staticmethod
    def _ndcg(chunks: List[RetrievedChunk], relevant: Set[int]) -> float:
        def _dcg(items: List[RetrievedChunk]) -> float:
            return sum(
                (1 / math.log2(rank + 2))
                for rank, c in enumerate(items)
                if c.doc_id in relevant
            )

        dcg = _dcg(chunks)
        # Ideal DCG: all relevant docs at the top
        ideal_len = min(len(chunks), len(relevant))
        idcg = sum(1 / math.log2(rank + 2) for rank in range(ideal_len))
        return dcg / idcg if idcg > 0 else 0.0

    @staticmethod
    def _mrr(chunks: List[RetrievedChunk], relevant: Set[int]) -> float:
        for rank, chunk in enumerate(chunks, start=1):
            if chunk.doc_id in relevant:
                return 1.0 / rank
        return 0.0

    @staticmethod
    def _hit(chunks: List[RetrievedChunk], relevant: Set[int]) -> float:
        return 1.0 if any(c.doc_id in relevant for c in chunks) else 0.0
