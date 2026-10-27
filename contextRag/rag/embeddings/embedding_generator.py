"""
Embedding Generator — wraps SentenceTransformers to compute dense vectors
"""
from __future__ import annotations

import logging
from typing import List, Union
import numpy as np
from sentence_transformers import SentenceTransformer

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingGenerator:
    """
    Computes dense vector representations for queries and document chunks.
    Uses cached model instance to avoid reloading.
    """

    _model_instance: SentenceTransformer | None = None

    def __init__(self) -> None:
        if EmbeddingGenerator._model_instance is None:
            logger.info(
                "Initializing SentenceTransformer: %s on %s",
                settings.EMBEDDING_MODEL,
                settings.EMBEDDING_DEVICE,
            )
            EmbeddingGenerator._model_instance = SentenceTransformer(
                settings.EMBEDDING_MODEL,
                device=settings.EMBEDDING_DEVICE,
            )
        self.model = EmbeddingGenerator._model_instance

    def embed_query(self, query: str) -> np.ndarray:
        """Generate a dense vector for a single query string."""
        vector = self.model.encode(
            query,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return np.asarray(vector, dtype=np.float32)

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate dense vectors for a list of chunk texts."""
        if not texts:
            return []
        vectors = self.model.encode(
            texts,
            batch_size=settings.EMBEDDING_BATCH_SIZE,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return [v.tolist() for v in vectors]