# test_bm25_build.py

from rag.retrieval.bm25_manager import get_bm25

bm25 = get_bm25()

chunks = [
    {
        "chunk_id": "1",
        "doc_id": 1,
        "text": "Node.js Express React MongoDB"
    },
    {
        "chunk_id": "2",
        "doc_id": 1,
        "text": "Python FastAPI Redis Qdrant"
    }
]

bm25.build_index(chunks)

print("READY =", bm25.is_ready)
print("CORPUS =", bm25.corpus_size)