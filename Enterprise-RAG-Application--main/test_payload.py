# test_payload.py

from app.core.config import settings
from qdrant_client import QdrantClient

client = QdrantClient(
    url=settings.QDRANT_URL,
    api_key=settings.QDRANT_API_KEY,
)

points, _ = client.scroll(
    collection_name="rag_application",
    limit=3,
    with_payload=True,
)

for p in points:
    print("\n===================")
    print("ID =", p.id)
    print("PAYLOAD =", p.payload)