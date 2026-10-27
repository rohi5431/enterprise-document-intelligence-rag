from rag.retrieval.bm25_retriever import BM25Retriever

bm25 = BM25Retriever()

chunks = [
    {
        "chunk_id": "1",
        "doc_id": 1,
        "text": "Node.js Express MongoDB React"
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