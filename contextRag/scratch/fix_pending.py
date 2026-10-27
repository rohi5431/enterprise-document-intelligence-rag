import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.db.session import SessionLocal
from app.repositories.document_repository import DocumentRepository
from app.tasks.ingestion_tasks import ingest_document_task
def fix():
    with SessionLocal() as db:
        repo = DocumentRepository(db)
        docs = repo.list_documents(status="pending")[0]
        print(f"Found {len(docs)} pending documents to process.")
        
        class DummyTask:
            request = type('Request', (), {'retries': 0})()
            def retry(self, exc, countdown):
                raise exc
                
        for doc in docs:
            print(f"Processing doc {doc.id} ({doc.filename})...")
            try:
                ext = doc.filename.rsplit(".", 1)[-1].lower() if "." in doc.filename else ""
                ingest_document_task(DummyTask(), doc.id, doc.file_path, ext)
                print(f"Successfully processed {doc.filename}")
            except Exception as e:
                print(f"Failed to process {doc.filename}: {e}")
if __name__ == "__main__":
    fix()