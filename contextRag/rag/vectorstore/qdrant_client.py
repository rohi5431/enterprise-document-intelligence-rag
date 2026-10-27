from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from app.core.config import settings
import uuid

client = QdrantClient(
    url=settings.QDRANT_URL,
    api_key=settings.QDRANT_API_KEY
)

COLLECTION_NAME = settings.QDRANT_COLLECTION_NAME
VECTOR_SIZE = settings.QDRANT_VECTOR_SIZE

def create_collection():
    if not client.collection_exists(COLLECTION_NAME):
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(
                size=VECTOR_SIZE,
                distance=Distance.COSINE
            )
        )

def store_chunks(chunks, embeddings):
    """Store document chunks and their embeddings in Qdrant"""
    create_collection()
    
    points = []
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        point = PointStruct(
            id=int(uuid.uuid4().int % 10**9),
            vector=embedding.tolist(),
            payload={"text": chunk}
        )
        points.append(point)
    
    client.upsert(
        collection_name=COLLECTION_NAME,
        points=points
    )
    
    return len(points)

def search_vectors(query_embedding, top_k=5):
    """Search for similar vectors in Qdrant"""
    create_collection()
    
    results = client.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_embedding.tolist(),
        limit=top_k
    )
    
    return results

def get_collection_info():
    """Get information about the collection"""
    try:
        info = client.get_collection(COLLECTION_NAME)
        return info
    except:
        return None