"""
BGE Embedder — wrapper class alias for EmbeddingGenerator used in document ingestion tasks
"""
from __future__ import annotations

from rag.embeddings.embedding_generator import EmbeddingGenerator


class BGEEmbedder(EmbeddingGenerator):
    """Alias for EmbeddingGenerator specifically matching Phase goals and ingestion tasks imports."""
    pass
