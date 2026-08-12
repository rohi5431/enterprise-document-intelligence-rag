"""
Phase 2: Advanced Batch Document Ingestion
Handles processing multiple documents with progress tracking and error recovery
"""

import hashlib
import os
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session

from rag.ingestion.pdf_loader import load_pdf
from rag.chunking.text_chunker import create_chunks
from rag.embeddings.embedding_generator import generate_embeddings
from rag.vectorstore.qdrant_client import store_chunks
from app.repositories.document_repository import DocumentRepository


class BatchIngestionService:
    """Handles batch document ingestion with database tracking"""
    
    def __init__(self, db: Session):
        self.db = db
        self.repo = DocumentRepository(db)
    
    def calculate_file_hash(self, file_path: str) -> str:
        """Calculate SHA-256 hash of a file"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    
    def ingest_single_document(self, file_path: str, title: str = None, 
                              owner_id: int = None) -> Dict:
        """
        Ingest a single document with full tracking
        
        Returns:
            Dict with status, document_id, chunks_count, and any errors
        """
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"File not found: {file_path}")
            
            # Calculate file hash for deduplication
            file_hash = self.calculate_file_hash(file_path)
            
            # Check if document already exists
            existing = self.repo.get_document_by_hash(file_hash)
            if existing:
                return {
                    "status": "duplicate",
                    "message": "Document already ingested",
                    "document_id": existing.id,
                    "existing_chunks": existing.chunks_count
                }
            
            # Get file info
            file_size = os.path.getsize(file_path)
            filename = os.path.basename(file_path)
            if not title:
                title = Path(filename).stem
            
            # Create document record
            doc = self.repo.create_document(
                title=title,
                filename=filename,
                file_path=file_path,
                file_size=file_size,
                file_hash=file_hash,
                owner_id=owner_id
            )
            
            # Update status: processing
            self.repo.update_document_status(doc.id, "processing")
            
            # Extract text
            text = load_pdf(file_path)
            
            if not text or len(text.strip()) == 0:
                raise ValueError("Document is empty or unreadable")
            
            # Store content
            self.repo.update_document_content(doc.id, text)
            
            # Create chunks
            chunks_text = create_chunks(text)
            
            if not chunks_text:
                raise ValueError("Could not create chunks from document")
            
            # Generate embeddings
            embeddings = generate_embeddings(chunks_text)
            
            # Store in Qdrant and get point IDs
            vectors_stored = store_chunks(chunks_text, embeddings)
            
            # Create chunk records in database
            chunks_data = [
                {"text": chunk_text, "token_count": len(chunk_text.split())}
                for chunk_text in chunks_text
            ]
            db_chunks = self.repo.create_chunks_batch(doc.id, chunks_data)
            
            # Update document with completion status
            self.repo.update_document_chunks(doc.id, len(chunks_text), vectors_stored)
            self.repo.update_document_status(doc.id, "success")
            
            return {
                "status": "success",
                "document_id": doc.id,
                "filename": filename,
                "title": title,
                "chunks_created": len(chunks_text),
                "vectors_stored": vectors_stored,
                "text_length": len(text),
                "file_size": file_size
            }
        
        except Exception as e:
            # Log error and update status
            if 'doc' in locals():
                self.repo.update_document_status(
                    doc.id, "failed", 
                    error=str(e)
                )
            
            return {
                "status": "error",
                "filename": os.path.basename(file_path),
                "error": str(e)
            }
    
    def ingest_multiple_documents(self, file_paths: List[str], owner_id: int = None,
                                 skip_duplicates: bool = True) -> Dict:
        """
        Ingest multiple documents
        
        Args:
            file_paths: List of file paths to ingest
            owner_id: Owner ID for all documents
            skip_duplicates: Whether to skip duplicate documents
        
        Returns:
            Dict with summary and per-file results
        """
        results = {
            "total_files": len(file_paths),
            "successful": 0,
            "failed": 0,
            "duplicates": 0,
            "details": []
        }
        
        for file_path in file_paths:
            result = self.ingest_single_document(file_path, owner_id=owner_id)
            
            results["details"].append(result)
            
            if result["status"] == "success":
                results["successful"] += 1
            elif result["status"] == "duplicate":
                if skip_duplicates:
                    results["duplicates"] += 1
                else:
                    results["successful"] += 1
            else:
                results["failed"] += 1
        
        return results
    
    def ingest_directory(self, directory_path: str, owner_id: int = None,
                        recursive: bool = True) -> Dict:
        """
        Ingest all PDF files from a directory
        
        Args:
            directory_path: Path to directory
            owner_id: Owner ID for documents
            recursive: Whether to search subdirectories
        
        Returns:
            Batch ingestion results
        """
        if not os.path.isdir(directory_path):
            raise ValueError(f"Not a directory: {directory_path}")
        
        # Find all PDF files
        pdf_files = []
        
        if recursive:
            pdf_files = list(Path(directory_path).rglob("*.pdf"))
        else:
            pdf_files = list(Path(directory_path).glob("*.pdf"))
        
        pdf_paths = [str(f) for f in pdf_files]
        
        return self.ingest_multiple_documents(pdf_paths, owner_id=owner_id)
    
    def get_ingestion_stats(self) -> Dict:
        """Get overall ingestion statistics"""
        stats = self.repo.get_document_stats()
        
        # Add additional metrics
        all_docs = self.repo.get_all_documents()
        total_size = sum(d.file_size or 0 for d in all_docs)
        
        stats.update({
            "total_file_size_mb": total_size / (1024 * 1024),
            "avg_file_size_kb": (total_size / len(all_docs) / 1024) if all_docs else 0,
            "processing_success_rate": (
                stats["processed_documents"] / max(stats["total_documents"], 1) * 100
            )
        })
        
        return stats
    
    def get_document_ingestion_report(self, document_id: int) -> Dict:
        """Get detailed ingestion report for a document"""
        doc = self.repo.get_document(document_id)
        
        if not doc:
            return {"status": "not_found"}
        
        chunk_stats = self.repo.get_chunk_stats(document_id)
        
        return {
            "document_id": doc.id,
            "title": doc.title,
            "filename": doc.filename,
            "status": doc.processing_status,
            "created_at": doc.created_at.isoformat(),
            "processed_at": doc.processed_at.isoformat() if doc.processed_at else None,
            "file_info": {
                "size_bytes": doc.file_size,
                "size_mb": doc.file_size / (1024 * 1024) if doc.file_size else 0,
                "hash": doc.file_hash
            },
            "content_info": {
                "length": doc.content_length,
                "chunks": doc.chunks_count,
                "vectors_stored": doc.vectors_stored
            },
            "chunk_stats": chunk_stats,
            "retrieval_stats": {
                "total_retrievals": doc.retrieval_count,
                "last_retrieved": doc.last_retrieved_at.isoformat() if doc.last_retrieved_at else None
            },
            "error": doc.processing_error if doc.processing_status == "failed" else None
        }
    
    def list_ingested_documents(self, owner_id: int = None, 
                               status: str = None) -> List[Dict]:
        """List all ingested documents with summaries"""
        docs = self.repo.list_documents(owner_id=owner_id, status=status)
        
        return [
            {
                "id": doc.id,
                "title": doc.title,
                "filename": doc.filename,
                "status": doc.processing_status,
                "chunks": doc.chunks_count,
                "created_at": doc.created_at.isoformat(),
                "processed_at": doc.processed_at.isoformat() if doc.processed_at else None,
                "retrievals": doc.retrieval_count
            }
            for doc in docs
        ]
