from __future__ import annotations

from qdrant_client.models import MatchValue

from rag.retrieval.bm25_retriever import BM25Retriever
from rag.retrieval.metadata_filter import MetadataFilterBuilder
from rag.retrieval.schemas import MetadataFilter, RetrievalRequest


def test_bm25_retrieval_applies_user_ownership_filter():
    retriever = BM25Retriever()
    retriever.build_index(
        [
            {
                "chunk_id": "owner-a",
                "doc_id": 1,
                "text": "orchard database security design",
                "user_id": 1,
            },
            {
                "chunk_id": "owner-b",
                "doc_id": 2,
                "text": "orchard database security architecture",
                "user_id": 2,
            },
            {
                "chunk_id": "other-owner-a",
                "doc_id": 3,
                "text": "different subject matter",
                "user_id": 1,
            },
        ]
    )

    results = retriever.retrieve(
        RetrievalRequest(
            query="orchard database security",
            filters=MetadataFilter(user_id=1),
            top_k=10,
        )
    )

    assert results
    assert {chunk.user_id for chunk in results} == {1}
    assert "owner-b" not in {chunk.chunk_id for chunk in results}


def test_qdrant_filter_requires_matching_owner_id():
    qdrant_filter = MetadataFilterBuilder().build(MetadataFilter(user_id=47))

    assert qdrant_filter is not None
    owner_condition = next(
        condition for condition in qdrant_filter.must if condition.key == "user_id"
    )
    assert isinstance(owner_condition.match, MatchValue)
    assert owner_condition.match.value == 47
