from app.db.session import SessionLocal
from app.models.chunk import Chunk
from rag.retrieval.bm25_manager import get_bm25
from rag.pipelines.rag_pipeline import run_rag


def load_bm25():
    bm25 = get_bm25()

    db = SessionLocal()
    chunks = db.query(Chunk).all()

    print("\n===== DATABASE =====")
    print("DB CHUNKS =", len(chunks))

    bm25_chunks = []

    for chunk in chunks:
        bm25_chunks.append(
            {
                "chunk_id": chunk.qdrant_point_id or str(chunk.id),
                "doc_id": chunk.document_id,
                "text": chunk.text,
                "tags": chunk.tags or [],
                "page_number": chunk.page_number,
            }
        )

    bm25.build_index(bm25_chunks)

    print("\n===== BM25 LOADED =====")
    print("BM25 READY =", bm25.is_ready)
    print("BM25 CORPUS =", bm25.corpus_size)

    db.close()


# Load BM25 before running RAG
load_bm25()

print("\n===== QUESTION 1 =====")
response1 = run_rag("What is RAG?")
print(response1["answer"])

print("\n===== QUESTION 2 =====")
response2 = run_rag("How does BM25 fit into it?")
print(response2["answer"])