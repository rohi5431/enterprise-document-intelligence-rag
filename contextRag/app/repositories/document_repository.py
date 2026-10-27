from __future__ import annotations

from typing import List, Optional, Tuple
from datetime import datetime

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.chunk import Chunk
from app.repositories.base_repository import BaseRepository


class DocumentRepository(BaseRepository[Document]):
    def __init__(self, db: Session) -> None:
        super().__init__(Document, db)

    def get_document_by_hash(self, file_hash: str) -> Optional[Document]:
        return self.db.query(Document).filter(Document.file_hash == file_hash).first()

    def list_documents(
        self,
        owner_id: Optional[int] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[Document], int]:
        q = self.db.query(Document)
        if owner_id is not None:
            q = q.filter(Document.owner_id == owner_id)
        if status:
            q = q.filter(Document.processing_status == status)
        if search:
            pattern = f"%{search}%"
            q = q.filter(
                (Document.title.ilike(pattern)) | (Document.filename.ilike(pattern))
            )
        total = q.count()
        docs = q.order_by(desc(Document.created_at)).offset(skip).limit(limit).all()
        return docs, total

    def update_status(
        self, doc_id: int, status: str, error: Optional[str] = None
    ) -> Optional[Document]:
        doc = self.get(doc_id)
        if doc:
            doc.processing_status = status
            if error:
                doc.processing_error = error
            if status == "success":
                doc.processed_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(doc)
        return doc

    def update_chunks_count(
        self, doc_id: int, chunks_count: int, vectors_stored: int
    ) -> Optional[Document]:
        doc = self.get(doc_id)
        if doc:
            doc.chunks_count = chunks_count
            doc.vectors_stored = vectors_stored
            doc.vector_count = vectors_stored
            self.db.commit()
            self.db.refresh(doc)
        return doc

    def increment_retrieval(self, doc_id: int) -> None:
        doc = self.get(doc_id)
        if doc:
            doc.retrieval_count += 1
            doc.last_retrieved_at = datetime.utcnow()
            self.db.commit()

    def create_chunk(
        self,
        document_id: int,
        text: str,
        sequence_number: int,
        page_number: Optional[int] = None,
        token_count: int = 0,
        tags: Optional[list] = None,
        chunk_metadata: Optional[dict] = None,
    ) -> Chunk:
        chunk = Chunk(
            document_id=document_id,
            text=text,
            sequence_number=sequence_number,
            page_number=page_number,
            token_count=token_count,
            character_count=len(text),
            tags=tags or [],
            chunk_metadata=chunk_metadata or {},
        )
        self.db.add(chunk)
        self.db.commit()
        self.db.refresh(chunk)
        return chunk

    def create_chunks_batch(self, chunks_data: List[dict]) -> List[Chunk]:
        chunks = [
            Chunk(
                document_id=d["document_id"],
                text=d["text"],
                sequence_number=d["sequence_number"],
                page_number=d.get("page_number"),
                token_count=d.get("token_count", 0),
                character_count=len(d["text"]),
                tags=d.get("tags", []),
                chunk_metadata=d.get("chunk_metadata", {}),
            )
            for d in chunks_data
        ]
        self.db.add_all(chunks)
        self.db.commit()
        return chunks

    def get_document_chunks(self, document_id: int) -> List[Chunk]:
        return (
            self.db.query(Chunk)
            .filter(Chunk.document_id == document_id)
            .order_by(Chunk.sequence_number)
            .all()
        )

    def update_chunk_qdrant_id(self, chunk_id: int, qdrant_id: str) -> None:
        self.db.query(Chunk).filter(Chunk.id == chunk_id).update(
            {"qdrant_point_id": qdrant_id}
        )
        self.db.commit()

    def get_stats(self) -> dict:
        total = self.db.query(Document).count()
        processed = self.db.query(Document).filter(
            Document.processing_status == "success"
        ).count()
        failed = self.db.query(Document).filter(
            Document.processing_status == "failed"
        ).count()
        total_chunks = self.db.query(Chunk).count()
        return {
            "total_documents": total,
            "processed_documents": processed,
            "failed_documents": failed,
            "total_chunks": total_chunks,
        }
