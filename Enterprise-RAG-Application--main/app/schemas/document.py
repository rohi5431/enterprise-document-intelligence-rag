from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: int
    title: str
    filename: str
    file_type: str | None
    file_size: int
    processing_status: str
    chunks_count: int
    version_number: int
    is_latest_version: bool
    owner_id: int | None
    tags: list
    created_at: datetime
    processed_at: datetime | None

    model_config = {"from_attributes": True}


class DocumentVersionResponse(BaseModel):
    id: int
    document_id: int
    version_number: int
    file_size: int
    is_active: bool
    version_notes: str | None
    upload_date: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int


class ChunkPreviewResponse(BaseModel):
    chunk_id: str
    doc_id: int
    text: str
    page_number: int | None
    sequence_number: int | None


class SemanticSearchResult(BaseModel):
    chunk_id: str
    doc_id: int
    doc_title: str | None
    doc_filename: str | None
    page_number: int | None
    text: str
    score: float
    highlight: str


class JobStatusResponse(BaseModel):
    task_id: str
    status: str
    result: dict | None = None
    error: str | None = None
