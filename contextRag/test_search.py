from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer

client = QdrantClient(
    url="https://a6ad705b-6952-4696-af59-88b78193e7b0.eu-west-1-0.aws.cloud.qdrant.io",
    api_key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6YmRhODQwM2MtZTQ4OC00ZjY0LWI5NDUtYzZmMTg0ZTg3NzM2In0.Ec0_cnS4QrjLZO3d4Ur2RDmRkIiAbSgk6VsmCuZeVxs"
)


model = SentenceTransformer("BAAI/bge-small-en-v1.5")

query = "Rohit Kumar"

vector = model.encode(query).tolist()

results = client.search(
    collection_name="rag_application",
    query_vector=vector,
    limit=5,
    with_payload=True,
)

print(f"RESULTS = {len(results)}")

for i, r in enumerate(results, 1):
    print("\n" + "=" * 80)
    print(f"Result #{i}")
    print("Score:", r.score)
    print("Doc ID:", r.payload.get("doc_id"))
    print("Text:", r.payload.get("text", "")[:300])