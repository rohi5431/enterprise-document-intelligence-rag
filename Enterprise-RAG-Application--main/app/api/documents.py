from __future__ import annotations
import os
import shutil
from typing import Optional
from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.exceptions import ValidationException
from app.db.session import get_db
from app.dependencies.auth import get_current_user, get_current_admin
from app.models.user import User
from app.schemas.document import DocumentListResponse, DocumentResponse, DocumentVersionResponse, JobStatusResponse
from app.services.document_service import DocumentService
router = APIRouter(prefix="/documents", tags=["Documents"])
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    tags: Optional[str] = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload and queue a document for processing."""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise ValidationException(f"File type .{ext} not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}")
    # Save file
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
    # Queue background ingestion
    # Queue background ingestion
    try:
        from app.tasks.ingestion_tasks import ingest_document_task
    
        print("Before delay")
    
        task = ingest_document_task.delay(
            doc.id,
            save_path,
            ext
        )
    
        print("After delay")
        print("TASK CREATED")
        print("Task ID =", task.id)
    
        svc.update_task_id(doc.id, task.id)
    
    except Exception as e:
        import traceback
    
        print("CELERY ERROR =", str(e))
        traceback.print_exc()

    # Fallback to FastAPI background task
    def run_ingestion_fallback():
        from app.tasks.ingestion_tasks import ingest_document_task

        class DummyTask:
            request = type("Request", (), {"retries": 0})()

            def retry(self, exc, countdown):
                raise exc

        try:
            ingest_document_task(DummyTask(), doc.id, save_path, ext)
        except Exception as e:
            print("FALLBACK ERROR:", e)

    background_tasks.add_task(run_ingestion_fallback)
    def run_ingestion_fallback():
            from app.tasks.ingestion_tasks import ingest_document_task
            class DummyTask:
                request = type('Request', (), {'retries': 0})()
                def retry(self, exc, countdown):
                    raise exc
            try:
                ingest_document_task(DummyTask(), doc.id, save_path, ext)
            except Exception as e:
                print("CELERY ERROR:", e)
                raise
                
        background_tasks.add_task(run_ingestion_fallback)
    return doc
@router.get("/", response_model=DocumentListResponse)
def list_documents(
    status: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List documents owned by the current user."""
    docs, total = DocumentService(db).list_documents(
        owner_id=current_user.id if not current_user.is_admin else None,
        status=status,
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
    """Get document details by ID."""
    return DocumentService(db).get_document(doc_id, user_id=current_user.id if not current_user.is_admin else None)
@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a document."""
    DocumentService(db).delete_document(doc_id, user_id=current_user.id, is_admin=current_user.is_admin)
@router.get("/{doc_id}/versions", response_model=list[DocumentVersionResponse])
def get_document_versions(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all versions of a document."""
    return DocumentService(db).get_versions(doc_id)
@router.get("/job/{task_id}", response_model=JobStatusResponse)
def get_job_status(task_id: str, current_user: User = Depends(get_current_user)):
    """Get background ingestion job status."""
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
