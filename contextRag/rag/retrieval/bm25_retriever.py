"""
BM25 Retriever
===============
Sparse keyword retrieval using the ``rank-bm25`` library.

Architecture
------------
BM25 operates on an **in-memory corpus** of chunk texts that mirrors what
is stored in PostgreSQL.  The corpus is rebuilt lazily on first use or
explicitly via :meth:`BM25Retriever.rebuild_index`.

In a production deployment the corpus should be rebuilt whenever new
documents are ingested (triggered from the Celery worker).

Thread safety
-------------
The index rebuild acquires a threading lock so concurrent requests during
a rebuild see the old index rather than a partial one.
"""

from __future__ import annotations

import logging
import re
import string
import threading
import time
from typing import Dict, List, Optional, Tuple

from rank_bm25 import BM25Okapi

from rag.retrieval.schemas import MetadataFilter, RetrievedChunk, RetrievalRequest

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tokeniser
# ---------------------------------------------------------------------------

_PUNCT_RE = re.compile(rf"[{re.escape(string.punctuation)}]")


def _tokenize(text: str) -> List[str]:
    """
    Lowercase + strip punctuation + split on whitespace.

    Keeping the tokeniser simple and fast; more sophisticated stemming or
    lemmatisation can be swapped in without touching the retriever.
    """
    text = text.lower()
    text = _PUNCT_RE.sub(" ", text)
    return [t for t in text.split() if len(t) > 1]


# ---------------------------------------------------------------------------
# BM25Retriever
# ---------------------------------------------------------------------------

class BM25Retriever:
    """
    Keyword (sparse) retriever backed by BM25Okapi.

    Parameters
    ----------
    k1, b:
        BM25 hyper-parameters.  Default values are BM25 canonical defaults.
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75) -> None:
        self._k1 = k1
        self._b = b
        self._lock = threading.Lock()

        # Index state
        self._bm25: Optional[BM25Okapi] = None
        self._corpus_meta: List[Dict] = []   # parallel list to BM25 corpus
        self._tokenized_corpus: List[List[str]] = []
        self._built = False

    # ------------------------------------------------------------------ #
    # Index management                                                     #
    # ------------------------------------------------------------------ #

    def build_index(self, chunks: List[Dict]) -> None:
        """
        Build (or rebuild) the BM25 index from a list of chunk dicts.

        Each dict must contain at minimum:
          - ``"text"``        (str)  chunk text
          - ``"chunk_id"``    (str)  Qdrant point ID
          - ``"doc_id"``      (int)  PostgreSQL Document.id
          - ``"user_id"``     (int | None)
          - ``"tags"``        (list[str])

        Optional keys forwarded to :class:`RetrievedChunk`:
          - ``"doc_title"``, ``"doc_filename"``, ``"sequence_number"``,
            ``"file_type"``, ``"page_number"``
        """
        if not chunks:
            logger.warning("BM25Retriever.build_index called with empty corpus")
            return

        logger.info("Building BM25 index over %d chunks …", len(chunks))
        t0 = time.perf_counter()

        tokenized = [_tokenize(c.get("text", "")) for c in chunks]

        with self._lock:
            self._bm25 = BM25Okapi(tokenized, k1=self._k1, b=self._b)
            self._tokenized_corpus = tokenized
            self._corpus_meta = chunks
            self._built = True

        elapsed = (time.perf_counter() - t0) * 1000
        logger.info("BM25 index built in %.1f ms", elapsed)

    def rebuild_index(self, chunks: List[Dict]) -> None:
        """Alias for :meth:`build_index` — for explicit rebuild calls."""
        self.build_index(chunks)

    @property
    def is_ready(self) -> bool:
        """``True`` if the index has been built at least once."""
        return self._built and self._bm25 is not None

    @property
    def corpus_size(self) -> int:
        return len(self._corpus_meta)

    # ------------------------------------------------------------------ #
    # Retrieval                                                            #
    # ------------------------------------------------------------------ #

    def retrieve(self, request: RetrievalRequest) -> List[RetrievedChunk]:
        """
        Score all corpus chunks against the query and return the top-k.

        Metadata filtering is performed *after* BM25 scoring because BM25
        has no native filter support.  This is acceptable for typical corpus
        sizes (< 1 M chunks); for very large corpora a pre-filter step can
        be added.

        Parameters
        ----------
        request:
            The unified retrieval request.

        Returns
        -------
        List[RetrievedChunk]
            Sorted descending by BM25 score, capped at ``request.top_k``.
        """
        if not self.is_ready:
            logger.warning("BM25 index not yet built — returning empty results")
            return []

        t0 = time.perf_counter()

        queries = (
            request.expanded_queries
            if request.expanded_queries
            else [request.query]
        )

        scored: Dict[str, Tuple[float, Dict]] = {}  # chunk_id → (score, meta)

        with self._lock:
            for q in queries:
                tokens = _tokenize(q)
                scores = self._bm25.get_scores(tokens)

                for idx, score in enumerate(scores):
                    if score <= 0:
                        continue
                    meta = self._corpus_meta[idx]
                    cid = meta["chunk_id"]
                    existing_score = scored.get(cid, (0.0, meta))[0]
                    # Multi-query fusion: take maximum BM25 score
                    if score > existing_score:
                        scored[cid] = (score, meta)

        # Apply metadata filter
        filtered = [
            (cid, score, meta)
            for cid, (score, meta) in scored.items()
            if self._passes_filter(meta, request.filters)
        ]

        # Sort by score, cap
        filtered.sort(key=lambda x: x[1], reverse=True)
        top = filtered[: request.top_k]

        chunks = [self._to_chunk(cid, score, meta) for cid, score, meta in top]

        elapsed = (time.perf_counter() - t0) * 1000
        logger.info(
            "BM25Retriever: %d queries → %d scored → %d after filter in %.1f ms",
            len(queries),
            len(scored),
            len(chunks),
            elapsed,
        )
        return chunks

    # ------------------------------------------------------------------ #
    # Private helpers                                                      #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _passes_filter(meta: Dict, f: Optional[MetadataFilter]) -> bool:
        """Return True if *meta* satisfies the metadata filter."""
        if f is None:
            return True

        # user_id isolation
        if f.user_id is not None and meta.get("user_id") != f.user_id:
            return False

        # document whitelist
        if f.doc_ids and meta.get("doc_id") not in f.doc_ids:
            return False

        # tag AND
        if f.tags:
            chunk_tags = set(meta.get("tags", []))
            if not all(t in chunk_tags for t in f.tags):
                return False

        # tag OR
        if f.any_tags:
            chunk_tags = set(meta.get("tags", []))
            if not any(t in chunk_tags for t in f.any_tags):
                return False

        # file type
        if f.file_types and meta.get("file_type") not in f.file_types:
            return False

        return True

    @staticmethod
    def _to_chunk(cid: str, score: float, meta: Dict) -> RetrievedChunk:
        return RetrievedChunk(
            chunk_id=cid,
            doc_id=meta.get("doc_id", 0),
            text=meta.get("text", ""),
            score=score,
            bm25_score=score,
            doc_title=meta.get("doc_title"),
            doc_filename=meta.get("doc_filename"),
            sequence_number=meta.get("sequence_number"),
            user_id=meta.get("user_id"),
            tags=meta.get("tags", []),
            file_type=meta.get("file_type"),
            page_number=meta.get("page_number"),
            retriever_source="bm25",
        )
