from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.document import SemanticSearchResult
from rag.retrieval.schemas import MetadataFilter, RetrievalRequest
from rag.retrieval.vector_retriever import VectorRetriever

router = APIRouter(prefix="/search", tags=["Search"])


@router.get("/", response_model=list[SemanticSearchResult])
def semantic_search(
    q: str = Query(min_length=1, max_length=2048),
    top_k: int = Query(default=10, ge=1, le=50),
    doc_id: Optional[int] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Semantic search across user's documents without chat."""
    filters = MetadataFilter(user_id=current_user.id)
    if doc_id:
        filters.doc_ids = [doc_id]

    retriever = VectorRetriever()
    request = RetrievalRequest(
        query=q,
        top_k=top_k,
        final_top_k=top_k,
        filters=filters,
        expand_query=False,
    )
    chunks = retriever.retrieve(request)

    return [
        SemanticSearchResult(
            chunk_id=c.chunk_id,
            doc_id=c.doc_id,
            doc_title=c.doc_title,
            doc_filename=c.doc_filename,
            page_number=c.page_number,
            text=c.text,
            score=round(c.score, 4),
            highlight=c.text[:200] + ("…" if len(c.text) > 200 else ""),
        )
        for c in chunks
    ]
