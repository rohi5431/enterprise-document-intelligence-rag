# test_qdrant_connection.py

from app.core.config import settings
from qdrant_client import QdrantClient

client = QdrantClient(
    url=settings.QDRANT_URL,
    api_key=settings.QDRANT_API_KEY,
)

count = client.count(
    collection_name="rag_application",
    exact=True,
)

print(count)