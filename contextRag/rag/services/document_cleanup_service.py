"""
Phase 2: Document Cleanup & Deletion Service
Handles safe removal of documents from database and vector store
"""

import os
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from app.repositories.document_repository import DocumentRepository
from rag.vectorstore.qdrant_client import client, COLLECTION_NAME


class DocumentCleanupService:
    """Handles document deletion and cleanup operations"""
    
    def __init__(self, db: Session):
        self.db = db
        self.repo = DocumentRepository(db)
    
    def delete_document(self, document_id: int, delete_file: bool = True,
                       delete_vectors: bool = True) -> Dict:
        """
        Delete a document and optionally its associated resources
        
        Args:
            document_id: ID of document to delete
            delete_file: Whether to delete the physical PDF file
            delete_vectors: Whether to delete vectors from Qdrant
        
        Returns:
            Status dictionary with operation results
        """
        try:
            doc = self.repo.get_document(document_id)
            
            if not doc:
                return {
                    "status": "not_found",
                    "message": "Document not found"
                }
            
            results = {
                "status": "success",
                "document_id": document_id,
                "title": doc.title,
                "file_deleted": False,
                "vectors_deleted": False,
                "db_deleted": False
            }
            
            # Delete file from disk
            if delete_file and doc.file_path and os.path.exists(doc.file_path):
                try:
                    os.remove(doc.file_path)
                    results["file_deleted"] = True
                except Exception as e:
                    results["file_delete_error"] = str(e)
            
            # Delete vectors from Qdrant
            if delete_vectors:
                deleted_count = self._delete_document_vectors(document_id)
                results["vectors_deleted"] = deleted_count > 0
                results["vectors_deleted_count"] = deleted_count
            
            # Delete from database
            if self.repo.delete_document(document_id):
                results["db_deleted"] = True
            
            return results
        
        except Exception as e:
            return {
                "status": "error",
                "document_id": document_id,
                "error": str(e)
            }
    
    def delete_multiple_documents(self, document_ids: List[int], 
                                 delete_file: bool = True,
                                 delete_vectors: bool = True) -> Dict:
        """Delete multiple documents"""
        results = {
            "total": len(document_ids),
            "successful": 0,
            "failed": 0,
            "details": []
        }
        
        for doc_id in document_ids:
            result = self.delete_document(
                doc_id,
                delete_file=delete_file,
                delete_vectors=delete_vectors
            )
            results["details"].append(result)
            
            if result["status"] == "success":
                results["successful"] += 1
            else:
                results["failed"] += 1
        
        return results
    
    def _delete_document_vectors(self, document_id: int) -> int:
        """Delete all vectors for a document from Qdrant"""
        try:
            chunks = self.repo.get_document_chunks(document_id)
            deleted_count = 0
            
            for chunk in chunks:
                if chunk.qdrant_point_id:
                    try:
                        client.delete(
                            collection_name=COLLECTION_NAME,
                            points_selector=int(chunk.qdrant_point_id)
                        )
                        deleted_count += 1
                    except Exception as e:
                        print(f"Failed to delete vector {chunk.qdrant_point_id}: {e}")
            
            return deleted_count
        except Exception as e:
            print(f"Error deleting document vectors: {e}")
            return 0
    
    def cleanup_failed_documents(self, days_old: int = 0) -> Dict:
        """
        Clean up failed documents
        
        Args:
            days_old: Only cleanup documents failed more than X days ago (0 = all)
        
        Returns:
            Cleanup summary
        """
        failed_docs = self.repo.list_documents(status="failed")
        
        to_delete = []
        for doc in failed_docs:
            if doc.processing_error:  # Has error, ready for cleanup
                to_delete.append(doc.id)
        
        return self.delete_multiple_documents(
            to_delete,
            delete_file=True,
            delete_vectors=False  # Failed docs likely have no vectors
        )
    
    def cleanup_orphaned_chunks(self) -> Dict:
        """
        Clean up chunks whose documents have been deleted
        
        Returns:
            Cleanup summary
        """
        try:
            # Find all chunks whose document_id doesn't exist
            all_chunks = self.db.query("SELECT id, document_id FROM chunks")
            all_docs = self.db.query("SELECT id FROM documents")
            
            doc_ids = set(doc.id for doc in all_docs)
            orphaned_count = 0
            
            for chunk in all_chunks:
                if chunk.document_id not in doc_ids:
                    self.db.query("DELETE FROM chunks WHERE id = ?", (chunk.id,))
                    orphaned_count += 1
            
            self.db.commit()
            
            return {
                "status": "success",
                "orphaned_chunks_deleted": orphaned_count
            }
        
        except Exception as e:
            return {
                "status": "error",
                "error": str(e)
            }
    
    def cleanup_unused_uploads(self, remove_missing: bool = True) -> Dict:
        """
        Clean up orphaned files in uploads directory
        
        Args:
            remove_missing: Whether to remove files not in database
        
        Returns:
            Cleanup summary
        """
        try:
            upload_dir = "uploads/docs"
            
            if not os.path.exists(upload_dir):
                return {"status": "no_uploads_dir", "message": "Uploads directory not found"}
            
            # Get all files in database
            db_docs = self.repo.get_all_documents()
            db_files = set(doc.file_path for doc in db_docs if doc.file_path)
            
            # Find orphaned files
            orphaned_files = []
            for filename in os.listdir(upload_dir):
                file_path = os.path.join(upload_dir, filename)
                if os.path.isfile(file_path) and file_path not in db_files:
                    orphaned_files.append(file_path)
            
            deleted_count = 0
            if remove_missing:
                for file_path in orphaned_files:
                    try:
                        os.remove(file_path)
                        deleted_count += 1
                    except Exception as e:
                        print(f"Failed to delete file {file_path}: {e}")
            
            return {
                "status": "success",
                "orphaned_files_found": len(orphaned_files),
                "orphaned_files_deleted": deleted_count,
                "files": orphaned_files
            }
        
        except Exception as e:
            return {
                "status": "error",
                "error": str(e)
            }
    
    def get_cleanup_report(self) -> Dict:
        """Get a report of what needs cleanup"""
        try:
            stats = self.repo.get_document_stats()
            
            report = {
                "status": "success",
                "documents": {
                    "total": stats["total_documents"],
                    "processed": stats["processed_documents"],
                    "failed": stats["failed_documents"],
                    "pending": stats["total_documents"] - stats["processed_documents"] - stats["failed_documents"]
                },
                "recommendations": []
            }
            
            # Analyze for cleanup recommendations
            if stats["failed_documents"] > 0:
                report["recommendations"].append({
                    "action": "cleanup_failed_documents",
                    "count": stats["failed_documents"],
                    "description": "Remove documents that failed processing"
                })
            
            return report
        
        except Exception as e:
            return {
                "status": "error",
                "error": str(e)
            }
