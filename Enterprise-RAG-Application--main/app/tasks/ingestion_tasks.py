"""
Celery tasks for document ingestion pipeline
"""

from __future__ import annotations

import sys
import os
from rag.retrieval.bm25_manager import get_bm25
from rag.retrieval.schemas import RetrievalRequest
print("CURRENT WD =", os.getcwd())
print("PYTHONPATH =", sys.path)

PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)

print("PROJECT_ROOT =", PROJECT_ROOT)

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

print("UPDATED SYS PATH =", sys.path[:5])

try:
    import rag
    print("RAG FILE =", rag.__file__)
except Exception as e:
    print("RAG IMPORT ERROR =", e)

import logging
from typing import Optional

from celery import Task
from tenacity import retry, stop_after_attempt, wait_exponential

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


class BaseIngestionTask(Task):
    abstract = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error(
            f"task_failed task_id={task_id} error={str(exc)}"
        )

        # Update document status to failed
        try:
            doc_id = args[0] if args else kwargs.get("doc_id")

            if doc_id:
                from app.db.session import get_db_context
                from app.repositories.document_repository import (
                    DocumentRepository,
                )

                with get_db_context() as db:
                    DocumentRepository(db).update_status(
                        doc_id,
                        "failed",
                        error_message=str(exc)
                    )

        except Exception:
            pass

@celery_app.task(
    bind=True,
    base=BaseIngestionTask,
    name="app.tasks.ingestion_tasks.ingest_document_task",
    max_retries=3,
    default_retry_delay=60,
)
def ingest_document_task(self, doc_id: int, file_path: str, file_type: str) -> dict:
    """
    Full document ingestion pipeline:
    Load → Chunk → Embed → Store in Qdrant → Update DB
    """

    logger.info(
        f"ingest_start doc_id={doc_id} file_path={file_path}"
    )

    try:
        # ===== DEBUG IMPORTS =====
        from app.db.session import get_db_context
        print("✓ get_db_context OK")

        from app.repositories.document_repository import DocumentRepository
        print("✓ DocumentRepository OK")
        
        import importlib.util
        
        print("rag spec =", importlib.util.find_spec("rag"))
        print("rag.ingestion spec =", importlib.util.find_spec("rag.ingestion"))
        print(
            "document_loader spec =",
            importlib.util.find_spec("rag.ingestion.document_loader")
        )
        
        from rag.ingestion.document_loader import DocumentLoader
        print("✓ DocumentLoader OK")

        from rag.chunking.text_chunker import TextChunker
        print("✓ TextChunker OK")

        from rag.embeddings.bge_embedder import BGEEmbedder
        print("✓ BGEEmbedder OK")

        from rag.vectorstore.qdrant_store import QdrantVectorStore
        print("✓ QdrantVectorStore OK")

        from app.core.config import settings
        print("✓ Settings OK")
        # =========================

        with get_db_context() as db:
            repo = DocumentRepository(db)
            repo.update_status(doc_id, "processing")

        # 1. Load document
        loader = DocumentLoader()
        pages = loader.load(file_path, file_type)

        # 1b. Extract tables from PDFs
        table_records = []
        if settings.TABLE_EXTRACTION_ENABLED and file_type.lower() in ("pdf",):
            from rag.ingestion.table_extractor import TableExtractor
            from app.models.extracted_table import ExtractedTable
            tables = TableExtractor().extract(file_path)
            for tbl in tables:
                table_records.append(tbl)
                pages.append({
                    "text": f"[TABLE page {tbl['page_number']}]\n{tbl['table_text']}",
                    "page_number": tbl["page_number"],
                    "metadata": {"source": file_path, "type": "table"},
                })

        full_text = "\n\n".join(page["text"] for page in pages)

        # 2. Chunk
        chunker = TextChunker(
            chunk_size=settings.CHUNK_SIZE,
            overlap=settings.CHUNK_OVERLAP,
        )

        chunks = chunker.chunk(
            full_text,
            doc_id=doc_id,
            pages=pages,
        )

        if not chunks:
            raise ValueError(
                "No chunks extracted from document"
            )

        # 3. Embed
        embedder = BGEEmbedder()

        texts = [
            chunk["text"]
            for chunk in chunks
        ]

        embeddings = embedder.embed_batch(texts)

        # 4. Store in Qdrant
        store = QdrantVectorStore()

        store.ensure_collection()

        point_ids = store.upsert_chunks(
            doc_id=doc_id,
            chunks=chunks,
            embeddings=embeddings,
        )
        # 5. Build BM25 Index
        bm25 = get_bm25()
        owner_id = None
        doc_title = None
        doc_filename = None

        with get_db_context() as db:
            doc = DocumentRepository(db).get(doc_id)
            if doc:
                owner_id = doc.owner_id
                doc_title = doc.title
                doc_filename = doc.filename

        bm25_chunks = []
        for point_id, chunk in zip(point_ids, chunks):
            bm25_chunks.append(
                {
                    "chunk_id": str(point_id),
                    "doc_id": doc_id,
                    "text": chunk["text"],
                    "tags": chunk.get("tags", []),
                    "page_number": chunk.get("page_number"),
                    "user_id": owner_id,
                    "doc_title": doc_title,
                    "doc_filename": doc_filename,
                }
            )

        bm25.build_index(bm25_chunks)
        # 5. Update DB
        with get_db_context() as db:
            repo = DocumentRepository(db)

            chunk_records = repo.create_chunks_batch(
                [
                    {
                        "document_id": doc_id,
                        "text": c["text"],
                        "sequence_number": c["sequence_number"],
                        "page_number": c.get("page_number"),
                        "token_count": c.get("token_count", 0),
                        "tags": c.get("tags", []),
                        "chunk_metadata": c.get("metadata", {}),
                    }
                    for c in chunks
                ]
            )

            for chunk_rec, pid in zip(chunk_records, point_ids):
                repo.update_chunk_qdrant_id(
                    chunk_rec.id,
                    str(pid),
                )

            repo.update_status(doc_id, "success")

            repo.update_chunks_count(
                doc_id,
                len(chunks),
                len(point_ids),
            )

            doc = repo.get(doc_id)

            if doc:
                doc.content = full_text[:50000]
                doc.content_length = len(full_text)
                doc.page_count = len(pages)
                db.commit()

            if table_records:
                from app.models.extracted_table import ExtractedTable
                for tbl in table_records:
                    db.add(ExtractedTable(
                        document_id=doc_id,
                        page_number=tbl["page_number"],
                        table_index=tbl["table_index"],
                        table_data=tbl["table_data"],
                        table_text=tbl["table_text"],
                        extraction_method=tbl["extraction_method"],
                    ))
                db.commit()

        logger.info(
            f"ingest_complete doc_id={doc_id} chunks={len(chunks)}"
        )

        return {
            "doc_id": doc_id,
            "chunks": len(chunks),
            "vectors": len(point_ids),
            "status": "success",
        }

    except Exception as exc:
        import traceback

        print("\n===== FULL ERROR =====")
        traceback.print_exc()
        print("======================\n")

        logger.error(
            f"ingest_error doc_id={doc_id} error={str(exc)}"
        )

        try:
            with get_db_context() as db:
                DocumentRepository(db).update_status(
                    doc_id,
                    "failed",
                    error=str(exc),
                )
        except Exception:
            pass

        raise self.retry(
            exc=exc,
            countdown=60 * (self.request.retries + 1),
        )