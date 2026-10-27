from __future__ import annotations

import hashlib
import os
import shutil
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ConflictException, NotFoundException, ForbiddenException
from app.core.logger import get_logger
from app.models.document import Document
from app.models.document_version import DocumentVersion
from app.repositories.document_repository import DocumentRepository

logger = get_logger(__name__)


class DocumentService:
    def __init__(self, db: Session) -> None:
        self.repo = DocumentRepository(db)
        self.db = db

    def _compute_hash(self, file_path: str) -> str:
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def create_document(
        self,
        title: str,
        filename: str,
        file_path: str,
        file_size: int,
        file_type: str,
        owner_id: Optional[int] = None,
        tags: Optional[list] = None,
    ) -> Document:
        file_hash = self._compute_hash(file_path)
        existing = self.repo.get_document_by_hash(file_hash)
        if existing:
            raise ConflictException(f"Document with this content already exists (id={existing.id})")

        doc = Document(
            title=title,
            filename=filename,
            file_path=file_path,
            file_size=file_size,
            file_hash=file_hash,
            file_type=file_type,
            owner_id=owner_id,
            tags=tags or [],
            processing_status="pending",
            version_number=1,
            is_latest_version=True,
        )
        doc = self.repo.create(doc)

        # Create version record
        version = DocumentVersion(
            document_id=doc.id,
            version_number=1,
            file_path=file_path,
            file_hash=file_hash,
            file_size=file_size,
            uploaded_by=owner_id,
        )
        self.db.add(version)
        self.db.commit()

        logger.info("document_created", doc_id=doc.id, filename=filename)
        return doc

    def get_document(self, doc_id: int, user_id: Optional[int] = None) -> Document:
        doc = self.repo.get(doc_id)
        if not doc:
            raise NotFoundException("Document", doc_id)
        if user_id and doc.owner_id != user_id and not doc.is_public:
            raise ForbiddenException("Document access denied")
        return doc

    def list_documents(
        self,
        owner_id: Optional[int] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[List[Document], int]:
        return self.repo.list_documents(
            owner_id=owner_id, status=status, search=search, skip=skip, limit=limit
        )

    def delete_document(self, doc_id: int, user_id: int, is_admin: bool = False) -> bool:
        doc = self.get_document(doc_id)
        if not is_admin and doc.owner_id != user_id:
            raise ForbiddenException("Cannot delete another user's document")
        if doc.file_path and os.path.exists(doc.file_path):
            try:
                os.remove(doc.file_path)
            except OSError:
                pass
        return self.repo.delete(doc)

    def get_versions(self, doc_id: int) -> List[DocumentVersion]:
        doc = self.repo.get(doc_id)
        if not doc:
            raise NotFoundException("Document", doc_id)
        return self.db.query(DocumentVersion).filter(
            DocumentVersion.document_id == doc_id
        ).order_by(DocumentVersion.version_number).all()

    def update_task_id(self, doc_id: int, task_id: str) -> None:
        doc = self.repo.get(doc_id)
        if doc:
            doc.celery_task_id = task_id
            self.db.commit()
