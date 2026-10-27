from app.db.session import SessionLocal
from app.models.chunk import Chunk

from rag.retrieval.bm25_manager import get_bm25
from rag.pipelines.rag_pipeline import run_rag
from rag.retrieval.schemas import RetrievalMode


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

    db.close()

    print("\n===== BM25 LOADED =====")
    print("BM25 READY =", bm25.is_ready)
    print("BM25 CORPUS =", bm25.corpus_size)


# -----------------------------
# Load BM25 BEFORE run_rag()
# -----------------------------
load_bm25()

# -----------------------------
# Run RAG
# -----------------------------
response = run_rag(
    "What skills are mentioned in Rohit's resume?",
    mode=RetrievalMode.HYBRID_RERANKED,
    expand_query=True,
    filters=filters,
)

# -----------------------------
# Debug Output
# -----------------------------
print("\n===== RESPONSE TYPE =====")
print(type(response))

print("\n===== RESPONSE KEYS =====")
if isinstance(response, dict):
    print(response.keys())

print("\n===== FULL RESPONSE =====")
print(response)

if isinstance(response, dict):
    print("\n===== ANSWER =====")
    print(response.get("answer"))

    print("\n===== NUM SOURCES =====")
    print(response.get("num_sources"))

    print("\n===== RETRIEVAL META =====")
    print(response.get("retrieval_meta"))