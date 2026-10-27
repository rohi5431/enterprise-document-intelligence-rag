import os
import sys
import traceback

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal
from app.repositories.document_repository import DocumentRepository
from app.tasks.ingestion_tasks import ingest_document_task

def test():
    with SessionLocal() as db:
        repo = DocumentRepository(db)
        doc = repo.get(1)
        if not doc:
            print("Doc 1 not found")
            return
            
        print(f"Processing doc id {doc.id} at {doc.file_path}")
        
        class DummyTask:
            request = type('Request', (), {'retries': 0})()
            def retry(self, exc, countdown):
                raise exc
                
        try:
            res = ingest_document_task(doc.id, doc.file_path, "pdf")
            print("Success:", res)
        except Exception as e:
            print("Error:")
            traceback.print_exc()

if __name__ == "__main__":
    test()