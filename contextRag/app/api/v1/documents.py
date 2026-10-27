from __future__ import annotations

import os
import shutil
from typing import Optional

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ValidationException
from app.db.session import get_db
from app.dependencies.auth import get_current_user, get_current_admin
from app.models.user import User
from app.models.chunk import Chunk
from app.schemas.document import (
    DocumentListResponse,
    DocumentResponse,
    DocumentVersionResponse,
    JobStatusResponse,
    ChunkPreviewResponse,
    SemanticSearchResult,
)
from app.services.document_service import DocumentService
from app.services.cache_service import get_cache_service

router = APIRouter(prefix="/documents", tags=["Documents"])

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    tags: Optional[str] = Form(default=None),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Upload and queue a document for processing (Admin only)."""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise ValidationException(
            f"File type .{ext} not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}"
        )

    save_path = os.path.join(settings.UPLOAD_DIR, file.filename)
    with open(save_path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    file_size = os.path.getsize(save_path)
    if file_size > settings.max_file_size_bytes:
        os.remove(save_path)
        raise ValidationException(f"File too large. Max {settings.MAX_FILE_SIZE_MB} MB")

    svc = DocumentService(db)
    doc = svc.create_document(
        title=title or file.filename,
        filename=file.filename,
        file_path=save_path,
        file_size=file_size,
        file_type=ext,
        owner_id=current_user.id,
        tags=[t.strip() for t in tags.split(",")] if tags else [],
    )

    get_cache_service().invalidate_user(current_user.id)

    try:
        from app.tasks.ingestion_tasks import ingest_document_task
        task = ingest_document_task.delay(doc.id, save_path, ext)
        svc.update_task_id(doc.id, task.id)
    except Exception:
        def run_ingestion_fallback():
            from app.tasks.ingestion_tasks import ingest_document_task
            class DummyTask:
                request = type("Request", (), {"retries": 0})()
                def retry(self, exc, countdown):
                    raise exc
            try:
                ingest_document_task(DummyTask(), doc.id, save_path, ext)
            except Exception:
                pass
        background_tasks.add_task(run_ingestion_fallback)

    return doc


@router.get("/", response_model=DocumentListResponse)
def list_documents(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List documents with optional search filter."""
    docs, total = DocumentService(db).list_documents(
        owner_id=current_user.id if not current_user.is_admin else None,
        status=status,
        search=search,
        skip=skip,
        limit=limit,
    )
    return DocumentListResponse(documents=docs, total=total)


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return DocumentService(db).get_document(
        doc_id, user_id=current_user.id if not current_user.is_admin else None
    )


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Delete a document (Admin only)."""
    DocumentService(db).delete_document(
        doc_id, user_id=current_user.id, is_admin=current_user.is_admin
    )
    get_cache_service().invalidate_user(current_user.id)


@router.get("/{doc_id}/download")
def download_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download original document file."""
    doc = DocumentService(db).get_document(
        doc_id, user_id=current_user.id if not current_user.is_admin else None
    )
    if not doc.file_path or not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        doc.file_path,
        filename=doc.filename,
        media_type=doc.mime_type or "application/octet-stream",
    )


@router.get("/{doc_id}/preview")
def preview_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return document metadata and content preview for PDF viewer."""
    doc = DocumentService(db).get_document(
        doc_id, user_id=current_user.id if not current_user.is_admin else None
    )
    return {
        "id": doc.id,
        "title": doc.title,
        "filename": doc.filename,
        "file_type": doc.file_type,
        "page_count": doc.page_count,
        "download_url": f"/api/v1/documents/{doc.id}/download",
        "content_preview": (doc.content or "")[:2000],
    }


@router.get("/{doc_id}/chunks/{chunk_id}", response_model=ChunkPreviewResponse)
def get_chunk(
    doc_id: int,
    chunk_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get chunk text for citation highlighting."""
    DocumentService(db).get_document(
        doc_id, user_id=current_user.id if not current_user.is_admin else None
    )
    chunk = db.query(Chunk).filter(
        Chunk.document_id == doc_id,
        Chunk.qdrant_point_id == chunk_id,
    ).first()
    if not chunk:
        chunk = db.query(Chunk).filter(Chunk.id == int(chunk_id)).first() if chunk_id.isdigit() else None
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")
    return ChunkPreviewResponse(
        chunk_id=str(chunk.qdrant_point_id or chunk.id),
        doc_id=doc_id,
        text=chunk.text,
        page_number=chunk.page_number,
        sequence_number=chunk.sequence_number,
    )


@router.get("/{doc_id}/versions", response_model=list[DocumentVersionResponse])
def get_document_versions(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return DocumentService(db).get_versions(doc_id)


@router.get("/job/{task_id}", response_model=JobStatusResponse)
def get_job_status(task_id: str, current_user: User = Depends(get_current_user)):
    try:
        from app.workers.celery_app import celery_app
        result = AsyncResult(task_id, app=celery_app)
        return JobStatusResponse(
            task_id=task_id,
            status=result.status,
            result=result.result if result.successful() else None,
            error=str(result.result) if result.failed() else None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
