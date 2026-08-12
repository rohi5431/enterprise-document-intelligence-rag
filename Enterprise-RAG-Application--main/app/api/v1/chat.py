from __future__ import annotations

import json
import time
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    CitationResponse,
    RetrievalDiagnostics,
    SessionCreate,
    SessionResponse,
    MessageResponse,
)
from app.services.analytics_service import AnalyticsService
from app.services.conversation_service import ConversationService
from app.services.feedback_service import FeedbackService
from app.services.preferences_service import PreferencesService
from rag.pipelines.rag_pipeline import get_rag_pipeline
from rag.retrieval.schemas import MetadataFilter

router = APIRouter(prefix="/chat", tags=["Chat"])


def _build_filters(req: ChatRequest, user_id: int) -> MetadataFilter:
    filters = MetadataFilter(user_id=user_id)
    if req.filters:
        if "doc_ids" in req.filters:
            filters.doc_ids = req.filters["doc_ids"]
        if "tags" in req.filters:
            filters.tags = req.filters["tags"]
    return filters


def _build_citations(sources: list) -> list[CitationResponse]:
    return [
        CitationResponse(
            citation_number=s["citation_number"],
            chunk_id=str(s.get("chunk_id", "")),
            doc_id=s.get("doc_id", 0),
            doc_title=s.get("doc_title"),
            doc_filename=s.get("doc_filename"),
            filename=s.get("doc_filename"),
            page_number=s.get("page_number"),
            text_snippet=s.get("text_snippet", ""),
            score=s.get("score", 0.0),
            rerank_score=s.get("rerank_score"),
        )
        for s in sources
    ]


@router.post("/message", response_model=ChatResponse)
def send_message(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Multi-turn RAG chat with caching, tenant isolation, and diagnostics."""
    t_start = time.perf_counter()
    conv_svc = ConversationService(db)
    feedback_svc = FeedbackService(db)
    analytics_svc = AnalyticsService(db)
    prefs_svc = PreferencesService(db)
    prefs = prefs_svc.get_or_create(current_user.id)

    session = conv_svc.get_or_create_session(
        user_id=current_user.id,
        session_id=req.session_id,
    )

    context_prefix = conv_svc.build_context_prompt(session, req.query)

    filters = _build_filters(req, current_user.id)
    expand = req.expand_query if req.expand_query is not None else prefs.query_expansion_enabled

    try:
        pipeline = get_rag_pipeline()
        result = pipeline.run(
            query=req.query,
            top_k=req.top_k or settings.RETRIEVAL_TOP_K,
            final_top_k=req.final_top_k or settings.RETRIEVAL_FINAL_TOP_K,
            filters=filters,
            expand_query=expand,
            user_id=current_user.id,
            llm_provider=prefs.llm_provider,
            llm_model=prefs.llm_model,
            conversation_history=context_prefix or None,
        )
    except Exception as exc:
        analytics_svc.record_query(
            query_text=req.query,
            user_id=current_user.id,
            session_id=session.id,
            total_latency_ms=(time.perf_counter() - t_start) * 1000,
            success=False,
            error_message=str(exc),
        )
        raise

    meta = result.get("retrieval_meta", {})
    latency = meta.get("latency_ms", {})
    retrieval_ms = latency.get("total_ms", 0.0)
    llm_ms = latency.get("llm_ms", 0.0)
    total_ms = (time.perf_counter() - t_start) * 1000
    cache_hit = result.get("cache_hit", False)

    sources = result.get("sources", [])
    citations = _build_citations(sources)
    confidence = 0.0
    if sources:
        top = sources[0]
        confidence = top.get("rerank_score") or top.get("score", 0.0)

    feedback_id = feedback_svc.create_slot(
        user_id=current_user.id,
        session_id=session.id,
        message_id=None,
        query_text=req.query,
        answer_text=result.get("answer", ""),
    )

    msg = conv_svc.save_turn(
        session=session,
        query=req.query,
        answer=result.get("answer", ""),
        sources=[c.model_dump() for c in citations],
        feedback_id=feedback_id,
        retrieval_ms=int(retrieval_ms),
        llm_ms=int(llm_ms),
        confidence=int(confidence * 100),
    )

    analytics_svc.record_query(
        query_text=req.query,
        user_id=current_user.id,
        session_id=session.id,
        retrieval_latency_ms=retrieval_ms,
        llm_latency_ms=llm_ms,
        total_latency_ms=total_ms,
        rerank_latency_ms=latency.get("rerank_ms", 0.0),
        num_sources=len(sources),
        vector_candidates=meta.get("vector_candidates", 0),
        bm25_candidates=meta.get("bm25_candidates", 0),
        top_score=float(confidence),
        cache_hit=cache_hit,
        success=True,
        retrieval_mode=meta.get("mode"),
        expanded_queries=meta.get("expanded_queries", []),
    )

    diagnostics = None
    if req.show_diagnostics or prefs.show_retrieval_diagnostics:
        diagnostics = RetrievalDiagnostics(
            embedding_ms=latency.get("embedding_ms", 0),
            vector_ms=latency.get("vector_ms", 0),
            bm25_ms=latency.get("bm25_ms", 0),
            fusion_ms=latency.get("fusion_ms", 0),
            rerank_ms=latency.get("rerank_ms", 0),
            total_ms=meta.get("total_latency_ms", total_ms),
            vector_candidates=meta.get("vector_candidates", 0),
            bm25_candidates=meta.get("bm25_candidates", 0),
            total_candidates=meta.get("total_candidates", 0),
            expanded_queries=meta.get("expanded_queries", []),
            cache_hit=cache_hit,
        )

    return ChatResponse(
        answer=result.get("answer", ""),
        query=req.query,
        session_id=session.id,
        message_id=msg.id,
        feedback_id=feedback_id,
        confidence=round(confidence, 4),
        citations=citations,
        num_sources=len(citations),
        retrieval_latency_ms=retrieval_ms,
        llm_latency_ms=llm_ms,
        total_latency_ms=round(total_ms, 2),
        cache_hit=cache_hit,
        diagnostics=diagnostics,
    )


@router.post("/message/stream")
def send_message_stream(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream RAG response token-by-token via Server-Sent Events."""
    conv_svc = ConversationService(db)
    prefs_svc = PreferencesService(db)
    prefs = prefs_svc.get_or_create(current_user.id)

    session = conv_svc.get_or_create_session(
        user_id=current_user.id,
        session_id=req.session_id,
    )
    context_prefix = conv_svc.build_context_prompt(session, req.query)
    filters = _build_filters(req, current_user.id)
    expand = req.expand_query if req.expand_query is not None else prefs.query_expansion_enabled
    pipeline = get_rag_pipeline()

    def event_generator():
        full_answer = ""
        sources = []
        for event in pipeline.run_stream(
            query=req.query,
            top_k=req.top_k or settings.RETRIEVAL_TOP_K,
            final_top_k=req.final_top_k or settings.RETRIEVAL_FINAL_TOP_K,
            filters=filters,
            expand_query=expand,
            llm_provider=prefs.llm_provider,
            llm_model=prefs.llm_model,
            conversation_history=context_prefix or None,
        ):
            if event["type"] == "token":
                full_answer += event["content"]
            if event["type"] == "metadata":
                sources = event.get("sources", [])
            yield f"data: {json.dumps(event)}\n\n"

        citations = _build_citations(sources)
        feedback_svc = FeedbackService(db)
        feedback_id = feedback_svc.create_slot(
            user_id=current_user.id,
            session_id=session.id,
            message_id=None,
            query_text=req.query,
            answer_text=full_answer,
        )
        msg = conv_svc.save_turn(
            session=session,
            query=req.query,
            answer=full_answer,
            sources=[c.model_dump() for c in citations],
            feedback_id=feedback_id,
            retrieval_ms=0,
            llm_ms=0,
            confidence=0,
        )
        yield f"data: {json.dumps({'type': 'final', 'session_id': session.id, 'message_id': msg.id, 'feedback_id': feedback_id, 'citations': [c.model_dump() for c in citations]})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/sessions", response_model=SessionResponse, status_code=201)
def create_session(
    req: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ConversationService(db).get_or_create_session(
        user_id=current_user.id, title=req.title
    )


@router.get("/sessions", response_model=list[SessionResponse])
def list_sessions(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ConversationService(db).get_user_sessions(current_user.id, skip, limit)


@router.get("/sessions/{session_id}/messages", response_model=list[MessageResponse])
def get_session_messages(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ConversationService(db).get_session_messages(session_id, current_user.id)
