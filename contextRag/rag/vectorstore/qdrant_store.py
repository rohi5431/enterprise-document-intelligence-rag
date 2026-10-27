"""
Qdrant Vector Store — manages Qdrant collections and stores dense vector embeddings
"""
from __future__ import annotations

import logging
import uuid
from typing import List, Dict, Any

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

from app.core.config import settings

logger = logging.getLogger(__name__)


class QdrantVectorStore:
    """Manages Qdrant lifecycle and vector/payload operations."""

    def __init__(self, client: QdrantClient | None = None) -> None:
        if client:
            self.client = client
        else:
            kwargs: dict = {"url": settings.QDRANT_URL}
            if settings.QDRANT_API_KEY:
                kwargs["api_key"] = settings.QDRANT_API_KEY
            self.client = QdrantClient(**kwargs)
        self.collection_name = settings.QDRANT_COLLECTION_NAME

    def ensure_collection(self) -> None:
        """Create Qdrant collection if it does not exist."""
        try:
            if not self.client.collection_exists(self.collection_name):
                logger.info("Creating Qdrant collection: %s", self.collection_name)
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=settings.QDRANT_VECTOR_SIZE,
                        distance=Distance.COSINE,
                    ),
                )
        except Exception as exc:
            logger.error("Failed to ensure Qdrant collection: %s", exc)
            raise

    def upsert_chunks(
        self, doc_id: int, chunks: List[Dict[str, Any]], embeddings: List[List[float]]
    ) -> List[str]:
        """Upsert a batch of chunk vectors and their payload to Qdrant. Returns list of string UUIDs."""
        self.ensure_collection()

        points: List[PointStruct] = []
        point_ids: List[str] = []

        # Try to retrieve doc metadata (title, filename, owner) from DB if available
        doc_title = None
        doc_filename = None
        owner_id = None
        
        try:
            from app.db.session import get_db_context
            from app.repositories.document_repository import DocumentRepository
            with get_db_context() as db:
                doc = DocumentRepository(db).get(doc_id)
                if doc:
                    doc_title = doc.title
                    doc_filename = doc.filename
                    owner_id = doc.owner_id
        except Exception as exc:
            logger.warning("Could not fetch document details from DB for payload embedding: %s", exc)

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = str(uuid.uuid4())
            point_ids.append(point_id)

            payload = {
                "doc_id": doc_id,
                "text": chunk["text"],
                "sequence_number": chunk.get("sequence_number", chunk.get("chunk_index", i)),
                "page_number": chunk.get("page_number"),
                "token_count": chunk.get("token_count", 0),
                "tags": chunk.get("tags", []),
                "user_id": owner_id or chunk.get("metadata", {}).get("user_id"),
                "doc_title": doc_title or chunk.get("metadata", {}).get("doc_title"),
                "doc_filename": doc_filename or chunk.get("metadata", {}).get("doc_filename"),
                "file_type": chunk.get("metadata", {}).get("file_type"),
                "block_type": chunk.get("block_type", "paragraph"),
                "bbox": chunk.get("bbox"),
                "ocr_used": chunk.get("ocr_used", False),
                "ocr_confidence": chunk.get("ocr_confidence", 1.0),
                "section": chunk.get("section", "General"),
            }

            points.append(
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload=payload,
                )
            )

        try:
            logger.info("Upserting %d points to collection %s", len(points), self.collection_name)
            result = self.client.upsert(
                collection_name=self.collection_name,
                points=points,
            )
            print("UPSERT RESULT =", result)
            print("COLLECTION =", self.collection_name)
            print("POINTS =", len(points))
            
            return point_ids
        except Exception as exc:
            logger.error("Failed to upsert points to Qdrant: %s", exc)
            raise
