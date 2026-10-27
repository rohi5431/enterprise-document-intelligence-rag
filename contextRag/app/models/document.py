"""
Document model with versioning support
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text, JSON
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)

    # Metadata
    title = Column(String(500), nullable=False, index=True)
    filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=True)
    file_size = Column(Integer, default=0)
    file_hash = Column(String(64), nullable=True, index=True)
    file_type = Column(String(20), nullable=True)  # pdf, docx, txt, md
    mime_type = Column(String(100), nullable=True)

    # Content
    content = Column(Text, nullable=True)
    content_length = Column(Integer, default=0)
    page_count = Column(Integer, default=0)

    # Processing
    chunks_count = Column(Integer, default=0)
    vectors_stored = Column(Integer, default=0)
    processing_status = Column(String(20), default="pending", index=True)
    processing_error = Column(Text, nullable=True)
    celery_task_id = Column(String(200), nullable=True)

    # Versioning
    version_number = Column(Integer, default=1, nullable=False)
    is_latest_version = Column(Boolean, default=True, nullable=False)
    parent_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)

    # Qdrant
    qdrant_collection_id = Column(String(200), nullable=True)
    vector_count = Column(Integer, default=0)

    # Ownership
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    tenant_id = Column(String(100), nullable=True, index=True)  # multi-tenant
    is_public = Column(Boolean, default=False)

    # Tags & metadata
    tags = Column(JSON, default=list)
    doc_metadata = Column(JSON, default=dict)

    # Retrieval metrics
    retrieval_count = Column(Integer, default=0)
    last_retrieved_at = Column(DateTime, nullable=True)
    average_chunk_score = Column(Float, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    # Relationships
    owner = relationship("User", back_populates="documents")
    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")
    versions = relationship(
        "DocumentVersion",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentVersion.version_number"
    )

    def __repr__(self) -> str:
        return f"<Document(id={self.id}, title={self.title!r}, status={self.processing_status!r})>"
