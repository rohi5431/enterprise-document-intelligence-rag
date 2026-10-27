"""
Chunk model — one text chunk from a document
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)

    # Content
    text = Column(Text, nullable=False)
    sequence_number = Column(Integer, nullable=False)
    page_number = Column(Integer, nullable=True)

    # Vector reference
    qdrant_point_id = Column(String(100), unique=True, nullable=True, index=True)

    # Metadata
    token_count = Column(Integer, default=0)
    character_count = Column(Integer, default=0)
    chunk_metadata = Column(JSON, default=dict)
    tags = Column(JSON, default=list)

    # Quality metrics
    relevance_score = Column(Float, nullable=True)
    retrieval_count = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="chunks")

    def __repr__(self) -> str:
        return f"<Chunk(id={self.id}, doc_id={self.document_id}, seq={self.sequence_number})>"
