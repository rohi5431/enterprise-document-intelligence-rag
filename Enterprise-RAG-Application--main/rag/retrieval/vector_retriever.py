"""
Vector Retriever
=================
Dense ANN retrieval against Qdrant.

Design decisions
----------------
* Uses the singleton ``QdrantClientManager`` (see ``rag/vectorstore/``)
  so the HTTP connection pool is shared across the process.
* Accepts a fully-built :class:`~rag.retrieval.schemas.MetadataFilter`
  and delegates filter-to-Qdrant translation to
  :class:`~rag.retrieval.metadata_filter.MetadataFilterBuilder`.
* Multi-query support: if ``request.expanded_queries`` is non-empty,
  all queries are searched and results are merged before deduplication.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import List, Optional

import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import ScoredPoint

from app.core.config import settings
from rag.embeddings.embedding_generator import EmbeddingGenerator
from rag.retrieval.metadata_filter import MetadataFilterBuilder
from rag.retrieval.schemas import MetadataFilter, RetrievedChunk, RetrievalRequest

logger = logging.getLogger(__name__)


class VectorRetriever:
    """
    Dense vector retrieval via Qdrant ANN.

    Parameters
    ----------
    embedding_generator:
        Injected :class:`~rag.embeddings.embedding_generator.EmbeddingGenerator`.
        If ``None``, a default instance is created from settings.
    qdrant_client:
        Injected :class:`qdrant_client.QdrantClient`.
        If ``None``, a default client is created from settings.
    collection_name:
        Qdrant collection to search. Defaults to ``settings.QDRANT_COLLECTION_NAME``.
    """

    def __init__(
        self,
        embedding_generator: Optional[EmbeddingGenerator] = None,
        qdrant_client: Optional[QdrantClient] = None,
        collection_name: Optional[str] = None,
    ) -> None:
        self._embedder = embedding_generator or EmbeddingGenerator()
        self._client = qdrant_client or self._build_client()
        self._collection = collection_name or settings.QDRANT_COLLECTION_NAME
        self._filter_builder = MetadataFilterBuilder()

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def retrieve(
        self,
        request: RetrievalRequest,
    ) -> List[RetrievedChunk]:
        """
        Run dense retrieval for all queries in *request*.

        If ``request.expanded_queries`` is populated, each variant is
        searched independently and results are deduplicated by ``chunk_id``
        before returning.

        Returns
        -------
        List[RetrievedChunk]
            Sorted by score descending, capped at ``request.top_k``.
        """
        t0 = time.perf_counter()

        queries = (
            request.expanded_queries
            if request.expanded_queries
            else [request.query]
        )
        qdrant_filter = self._filter_builder.build(request.filters)

        seen_ids: set = set()
        all_chunks: List[RetrievedChunk] = []

        for q in queries:
            chunks = self._search_single(q, request.top_k, qdrant_filter)
            for chunk in chunks:
                if chunk.chunk_id not in seen_ids:
                    seen_ids.add(chunk.chunk_id)
                    all_chunks.append(chunk)

        # Sort by vector score, keep top_k
        all_chunks.sort(key=lambda c: c.score, reverse=True)
        result = all_chunks[: request.top_k]

        elapsed = (time.perf_counter() - t0) * 1000
        logger.info(
            "VectorRetriever: %d queries → %d unique chunks in %.1f ms",
            len(queries),
            len(result),
            elapsed,
        )
        return result

    # ------------------------------------------------------------------ #
    # Private helpers                                                      #
    # ------------------------------------------------------------------ #

    def _search_single(
        self,
        query: str,
        top_k: int,
        qdrant_filter,
    ) -> List[RetrievedChunk]:
        """Embed *query* and run one Qdrant search call."""
        t_embed = time.perf_counter()

        embedding: np.ndarray = self._embedder.embed_query(query)
        
        print(
            "EMBEDDING TIME =",
            round((time.perf_counter() - t_embed) * 1000, 2),
            "ms"
        )

        print("\n===== VECTOR SEARCH =====")
        print("COLLECTION =", self._collection)
        print("QUERY =", query)
        print("FILTER =", qdrant_filter)
        
        try:
            t_search = time.perf_counter()

            hits: List[ScoredPoint] = self._client.search(
                collection_name=self._collection,
                query_vector=embedding.tolist(),
                limit=top_k,
                query_filter=qdrant_filter,
                with_payload=True,
            )
            
            print(
                "QDRANT SEARCH TIME =",
                round((time.perf_counter() - t_search) * 1000, 2),
                "ms"
            )
            print("HITS FOUND =", len(hits))
        except Exception as exc:
            logger.error("Qdrant search failed: %s", exc)
            return []

        return [self._point_to_chunk(p) for p in hits]

    @staticmethod
    def _point_to_chunk(point: ScoredPoint) -> RetrievedChunk:
        """Map a Qdrant ScoredPoint → RetrievedChunk."""
        payload = point.payload or {}
        return RetrievedChunk(
            chunk_id=str(point.id),
            doc_id=payload.get("doc_id", 0),
            text=payload.get("text", ""),
            score=point.score,
            vector_score=point.score,
            doc_title=payload.get("doc_title"),
            doc_filename=payload.get("doc_filename"),
            sequence_number=payload.get("sequence_number"),
            user_id=payload.get("user_id"),
            tags=payload.get("tags", []),
            file_type=payload.get("file_type"),
            page_number=payload.get("page_number"),
            retriever_source="vector",
        )

    @staticmethod
    def _build_client() -> QdrantClient:
        kwargs: dict = {"url": settings.QDRANT_URL}
        if settings.QDRANT_API_KEY:
            kwargs["api_key"] = settings.QDRANT_API_KEY
        return QdrantClient(**kwargs)
