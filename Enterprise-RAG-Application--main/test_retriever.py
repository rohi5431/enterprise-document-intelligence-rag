from rag.retrieval.vector_retriever import VectorRetriever
from rag.retrieval.schemas import RetrievalRequest

retriever = VectorRetriever()

request = RetrievalRequest(
    query="What skills are mentioned in Rohit's resume?",
    top_k=5
)

results = retriever.retrieve(request)

for r in results:
    print("=" * 80)
    print("Score:", r.score)
    print(r.text[:500])