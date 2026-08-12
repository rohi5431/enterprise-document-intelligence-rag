from rag.embeddings.embedding_generator import generate_embeddings
from rag.vectorstore.qdrant_client import search_vectors

class Retriever:
    def __init__(self, top_k=5):
        self.top_k = top_k
    
    def retrieve(self, query: str):
        """Retrieve relevant chunks for the given query"""
        try:
            # Generate embedding for the query
            query_embedding = generate_embeddings([query])[0]
            
            # Search for similar vectors
            results = search_vectors(query_embedding, top_k=self.top_k)
            
            # Extract text from results
            retrieved_chunks = []
            for result in results:
                if hasattr(result, 'payload'):
                    retrieved_chunks.append({
                        'text': result.payload.get('text', ''),
                        'score': result.score
                    })
            
            return retrieved_chunks
        except Exception as e:
            print(f"Error retrieving documents: {e}")
            return []
