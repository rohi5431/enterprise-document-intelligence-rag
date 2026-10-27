from rag.pipelines.rag_pipeline import run_rag
from rag.retrieval.schemas import RetrievalMode

response = run_rag(
    "What skills are mentioned in Rohit's resume?",
    mode=RetrievalMode.HYBRID_RERANKED
)

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