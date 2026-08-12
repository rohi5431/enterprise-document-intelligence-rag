"""
Advanced RAG Pipeline
======================
Query Expansion → Hybrid Retrieval → Reranking → LLM → Answer + Citations
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Dict, Generator, List, Optional

from app.core.config import settings
from app.services.cache_service import get_cache_service
from app.services.llm_factory import get_llm_client
from rag.retrieval.bm25_manager import get_bm25
from rag.memory.conversation_memory import ConversationMemory
from rag.prompts.prompt_builder import PromptBuilder
from rag.retrieval.analytics import RetrievalEvent, get_analytics
from rag.retrieval.bm25_retriever import BM25Retriever
from rag.retrieval.hybrid_retriever import HybridRetriever
from rag.retrieval.query_expander import QueryExpander
from rag.retrieval.schemas import (
    MetadataFilter,
    RetrievalMode,
    RetrievalRequest,
    RetrievalResult,
    RetrievedChunk,
)
from rag.retrieval.vector_retriever import VectorRetriever
from rag.reranking.cross_encoder_reranker import CrossEncoderReranker

logger = logging.getLogger(__name__)


class AdvancedRAGPipeline:
    def __init__(
        self,
        query_expander: Optional[QueryExpander] = None,
        hybrid_retriever: Optional[HybridRetriever] = None,
        llm=None,
        mode: RetrievalMode = RetrievalMode.HYBRID_RERANKED,
    ) -> None:
        self._expander = query_expander or QueryExpander(
            n_expansions=settings.QUERY_EXPANSION_COUNT
        )
        self._retriever = hybrid_retriever or HybridRetriever()
        self._llm = llm
        self._default_mode = mode
        self._analytics = get_analytics()
        self._memory = ConversationMemory()
        self._prompt_builder = PromptBuilder()
        self._cache = get_cache_service()

    def _get_llm(self, provider: Optional[str] = None, model: Optional[str] = None):
        return get_llm_client(provider, model)

    def run(
        self,
        query: str,
        *,
        top_k: int = 10,
        final_top_k: int = 3,
        mode: Optional[RetrievalMode] = None,
        filters: Optional[MetadataFilter] = None,
        expand_query: bool = True,
        user_id: Optional[int] = None,
        use_cache: bool = True,
        llm_provider: Optional[str] = None,
        llm_model: Optional[str] = None,
        conversation_history: Optional[str] = None,
    ) -> Dict:
        query_id = str(uuid.uuid4())[:8]
        t_total = time.perf_counter()
        cache_hit = False
        filter_dict = {"user_id": filters.user_id if filters else None}

        if use_cache and user_id and settings.CACHE_ENABLED:
            cached = self._cache.get(user_id, query, filter_dict)
            if cached:
                cached["cache_hit"] = True
                return cached

        expanded: List[str] = [query]
        if expand_query and settings.QUERY_EXPANSION_ENABLED:
            try:
                expanded = self._expander.expand(query)
            except Exception as exc:
                logger.warning("[%s] Query expansion failed: %s", query_id, exc)

        request = RetrievalRequest(
            query=query,
            mode=mode or self._default_mode,
            top_k=top_k,
            final_top_k=final_top_k,
            filters=filters,
            expand_query=expand_query and settings.QUERY_EXPANSION_ENABLED,
            expanded_queries=expanded,
        )

        error_msg: Optional[str] = None
        try:
            result: RetrievalResult = self._retriever.retrieve(request)
            chunks = result.chunks
        except Exception as exc:
            logger.error("[%s] Retrieval failed: %s", query_id, exc)
            error_msg = str(exc)
            result = RetrievalResult(
                query=query, expanded_queries=expanded, chunks=[], mode=request.mode
            )
            chunks = []

        llm_ms = 0.0
        if not chunks:
            answer = "I couldn't find relevant information to answer your question."
            sources = []
        else:
            history = conversation_history or self._memory.get_context()
            prompt = self._prompt_builder.build(
                query=query, chunks=chunks, conversation_history=history
            )
            t_llm = time.perf_counter()
            try:
                llm = self._get_llm(llm_provider, llm_model)
                answer = llm.generate(prompt)
                self._memory.add_user(query)
                self._memory.add_assistant(answer)
            except Exception as exc:
                logger.error("[%s] LLM generation failed: %s", query_id, exc)
                answer = f"Error generating answer: {exc}"
                error_msg = str(exc)
            llm_ms = (time.perf_counter() - t_llm) * 1000
            sources = self._build_sources(chunks)

        total_ms = (time.perf_counter() - t_total) * 1000

        event = RetrievalEvent(
            query=query,
            mode=str(request.mode),
            user_id=filters.user_id if filters else None,
            vector_candidates=result.vector_candidates,
            bm25_candidates=result.bm25_candidates,
            chunks_returned=len(chunks),
            latency_total_ms=total_ms,
            latency_breakdown=result.latency_ms,
            tags_filter=filters.tags if (filters and filters.tags) else [],
            expanded_query_count=len(expanded) - 1,
            error=error_msg,
        )
        self._analytics.record(event)

        response = {
            "query": query,
            "answer": answer,
            "sources": sources,
            "num_sources": len(sources),
            "cache_hit": cache_hit,
            "retrieval_meta": {
                "mode": str(request.mode),
                "expanded_queries": expanded[1:],
                "vector_candidates": result.vector_candidates,
                "bm25_candidates": result.bm25_candidates,
                "total_candidates": result.total_candidates,
                "chunks_after_fusion": result.chunks_after_fusion,
                "chunks_after_rerank": result.chunks_after_rerank,
                "latency_ms": {**result.latency_ms, "llm_ms": round(llm_ms, 2)},
                "total_latency_ms": round(total_ms, 2),
                "embedding_ms": result.latency_ms.get("embedding_ms", 0),
                "vector_ms": result.latency_ms.get("vector_ms", 0),
                "bm25_ms": result.latency_ms.get("bm25_ms", 0),
                "fusion_ms": result.latency_ms.get("fusion_ms", 0),
                "rerank_ms": result.latency_ms.get("rerank_ms", 0),
            },
        }

        if use_cache and user_id and settings.CACHE_ENABLED and not error_msg:
            self._cache.set(user_id, query, response, filter_dict)

        return response

    def run_stream(
        self,
        query: str,
        *,
        top_k: int = 10,
        final_top_k: int = 3,
        filters: Optional[MetadataFilter] = None,
        expand_query: bool = True,
        llm_provider: Optional[str] = None,
        llm_model: Optional[str] = None,
        conversation_history: Optional[str] = None,
    ) -> Generator[Dict, None, None]:
        """Yield dict events: metadata first, then token chunks, then done."""
        expanded: List[str] = [query]
        if expand_query and settings.QUERY_EXPANSION_ENABLED:
            try:
                expanded = self._expander.expand(query)
            except Exception as exc:
                logger.warning("Query expansion failed: %s", exc)

        request = RetrievalRequest(
            query=query,
            mode=self._default_mode,
            top_k=top_k,
            final_top_k=final_top_k,
            filters=filters,
            expand_query=expand_query,
            expanded_queries=expanded,
        )

        result = self._retriever.retrieve(request)
        chunks = result.chunks
        sources = self._build_sources(chunks) if chunks else []

        yield {
            "type": "metadata",
            "sources": sources,
            "retrieval_meta": {
                "expanded_queries": expanded[1:],
                "vector_candidates": result.vector_candidates,
                "bm25_candidates": result.bm25_candidates,
                "total_candidates": result.total_candidates,
                "latency_ms": result.latency_ms,
            },
        }

        if not chunks:
            yield {"type": "token", "content": "I couldn't find relevant information."}
            yield {"type": "done", "answer": "I couldn't find relevant information."}
            return

        history = conversation_history or self._memory.get_context()
        prompt = self._prompt_builder.build(
            query=query, chunks=chunks, conversation_history=history
        )

        llm = self._get_llm(llm_provider, llm_model)
        full_answer = ""
        for token in llm.generate_stream(prompt):
            full_answer += token
            yield {"type": "token", "content": token}

        self._memory.add_user(query)
        self._memory.add_assistant(full_answer)
        yield {"type": "done", "answer": full_answer, "sources": sources}

    @staticmethod
    def _build_sources(chunks: List[RetrievedChunk]) -> List[Dict]:
        return [
            {
                "citation_number": i + 1,
                "chunk_id": chunk.chunk_id,
                "doc_id": chunk.doc_id,
                "doc_title": chunk.doc_title,
                "doc_filename": chunk.doc_filename,
                "text_snippet": chunk.text[:300] + ("…" if len(chunk.text) > 300 else ""),
                "score": round(chunk.score, 4),
                "rerank_score": round(chunk.rerank_score, 4) if chunk.rerank_score else None,
                "vector_score": round(chunk.vector_score, 4) if chunk.vector_score else None,
                "bm25_score": round(chunk.bm25_score, 4) if chunk.bm25_score else None,
                "page_number": chunk.page_number,
                "tags": chunk.tags,
                "retriever_source": chunk.retriever_source,
            }
            for i, chunk in enumerate(chunks)
        ]


_pipeline: Optional[AdvancedRAGPipeline] = None


def get_rag_pipeline(bm25_retriever: Optional[BM25Retriever] = None) -> AdvancedRAGPipeline:
    global _pipeline
    if _pipeline is None:
        vector = VectorRetriever()
        bm25 = bm25_retriever or get_bm25()
        reranker = CrossEncoderReranker()
        hybrid = HybridRetriever(
            vector_retriever=vector,
            bm25_retriever=bm25,
            reranker=reranker,
        )
        _pipeline = AdvancedRAGPipeline(hybrid_retriever=hybrid)
    return _pipeline


def run_rag(
    query: str,
    filters: Optional[MetadataFilter] = None,
    mode: Optional[RetrievalMode] = None,
    expand_query: bool = True,
) -> Dict:
    return get_rag_pipeline().run(query, filters=filters, mode=mode, expand_query=expand_query)


def run_rag_stream(query: str, **kwargs):
    yield from get_rag_pipeline().run_stream(query, **kwargs)
