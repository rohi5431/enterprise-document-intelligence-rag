"""
Advanced Retrieval Package
===========================
Exports the canonical retrieval interfaces used throughout the platform.
"""

from rag.retrieval.schemas import (
    RetrievedChunk,
    RetrievalRequest,
    RetrievalResult,
    RetrievalMode,
    MetadataFilter,
    TagFilter,
)
from rag.retrieval.vector_retriever import VectorRetriever
from rag.retrieval.bm25_retriever import BM25Retriever
from rag.retrieval.hybrid_retriever import HybridRetriever
from rag.retrieval.query_expander import QueryExpander
from rag.retrieval.metadata_filter import MetadataFilterBuilder

__all__ = [
    # Data contracts
    "RetrievedChunk",
    "RetrievalRequest",
    "RetrievalResult",
    "RetrievalMode",
    "MetadataFilter",
    "TagFilter",
    # Retrievers
    "VectorRetriever",
    "BM25Retriever",
    "HybridRetriever",
    # Utilities
    "QueryExpander",
    "MetadataFilterBuilder",
]
