from rag.retrieval.bm25_retriever import BM25Retriever

_bm25_instance = BM25Retriever()

def get_bm25():
    return _bm25_instance