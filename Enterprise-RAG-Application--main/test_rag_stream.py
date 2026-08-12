# test_rag_stream.py

from app.db.session import SessionLocal
from app.models.chunk import Chunk
from rag.retrieval.bm25_manager import get_bm25
from rag.pipelines.rag_pipeline import run_rag_stream


def load_bm25():
    bm25 = get_bm25()

    db = SessionLocal()

    chunks = db.query(Chunk).all()

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

    print("BM25 READY =", bm25.is_ready)
    print("BM25 CORPUS =", bm25.corpus_size)

    db.close()


load_bm25()

for token in run_rag_stream(
    "What technologies are mentioned in Rohit's resume?"
):
    print(token, end="", flush=True)