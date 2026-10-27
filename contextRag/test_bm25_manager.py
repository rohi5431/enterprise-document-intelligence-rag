# test_bm25_manager.py

from rag.retrieval.bm25_manager import get_bm25

bm25 = get_bm25()

print("READY =", bm25.is_ready)
print("CORPUS =", bm25.corpus_size)