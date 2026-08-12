import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.db.session import SessionLocal
from app.repositories.document_repository import DocumentRepository
def list_all():
    with SessionLocal() as db:
        repo = DocumentRepository(db)
        docs = repo.list_documents(limit=100)[0]
        for doc in docs:
            print(f"ID: {doc.id}, Name: {doc.filename}, Status: {doc.processing_status}, Vectors: {doc.vectors_stored}")
if __name__ == "__main__":
    list_all()