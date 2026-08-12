"""
Phase 1 API Usage Examples
Complete examples for the RAG pipeline
"""

# ============================================================================
# EXAMPLE 1: PYTHON - Basic RAG Pipeline Test
# ============================================================================
"""
Test the RAG pipeline directly without HTTP
"""
from rag.pipelines.rag_pipeline import run_rag
from rag.pipelines.ingestion_pipeline import ingest_document

# Example 1A: Ingest a document
result = ingest_document("path/to/document.pdf", doc_type="pdf")
print(f"Chunks created: {result.get('chunks_created')}")
print(f"Chunks stored: {result.get('chunks_stored')}")

# Example 1B: Query the RAG pipeline
response = run_rag("What is the main topic?")
print(f"Question: {response['query']}")
print(f"Answer: {response['answer']}")
print(f"Sources found: {response['num_sources']}")


# ============================================================================
# EXAMPLE 2: PYTHON - Using Requests Library
# ============================================================================
"""
Interact with FastAPI endpoints via HTTP
"""
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

# Example 2A: Upload a PDF document
def upload_document(file_path):
    with open(file_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(
            f"{BASE_URL}/documents/upload",
            files=files
        )
    return response.json()

result = upload_document("sample.pdf")
print(json.dumps(result, indent=2))
# Output:
# {
#   "status": "success",
#   "filename": "sample.pdf",
#   "chunks_created": 15,
#   "chunks_stored": 15,
#   "message": "Document ingested successfully"
# }


# Example 2B: List uploaded documents
def list_documents():
    response = requests.get(f"{BASE_URL}/documents/")
    return response.json()

docs = list_documents()
print(f"Documents: {docs['documents']}")
# Output: Documents: ['sample.pdf', 'guide.pdf']


# Example 2C: Send a query
def ask_question(query, top_k=5):
    payload = {
        "query": query,
        "top_k": top_k
    }
    response = requests.post(
        f"{BASE_URL}/chat/message",
        json=payload
    )
    return response.json()

answer = ask_question("What are the main features?")
print(json.dumps(answer, indent=2))
# Output:
# {
#   "query": "What are the main features?",
#   "answer": "Based on the documents, the main features include...",
#   "num_sources": 5,
#   "sources": [
#     {
#       "text": "Feature 1 description...",
#       "score": 0.85
#     },
#     ...
#   ]
# }


# ============================================================================
# EXAMPLE 3: BASH/CURL - Command Line
# ============================================================================
"""
Using curl for direct API calls
"""

# Example 3A: Upload a document
# curl -X POST "http://localhost:8000/api/v1/documents/upload" \
#   -F "file=@document.pdf"

# Example 3B: List documents
# curl -X GET "http://localhost:8000/api/v1/documents/"

# Example 3C: Send a query
# curl -X POST "http://localhost:8000/api/v1/chat/message" \
#   -H "Content-Type: application/json" \
#   -d '{"query": "Summarize the document", "top_k": 5}'

# Example 3D: Check chat health
# curl -X GET "http://localhost:8000/api/v1/chat/health"


# ============================================================================
# EXAMPLE 4: Advanced - Batch Processing
# ============================================================================
"""
Process multiple documents and queries
"""

def batch_upload_documents(file_paths):
    """Upload multiple documents"""
    results = []
    for file_path in file_paths:
        result = upload_document(file_path)
        results.append({
            "file": file_path,
            "status": result.get("status"),
            "chunks": result.get("chunks_stored")
        })
    return results

def batch_queries(queries):
    """Submit multiple queries"""
    results = []
    for query in queries:
        result = ask_question(query)
        results.append({
            "query": query,
            "answer": result.get("answer"),
            "sources": result.get("num_sources")
        })
    return results

# Upload multiple documents
documents = ["doc1.pdf", "doc2.pdf", "doc3.pdf"]
upload_results = batch_upload_documents(documents)
for result in upload_results:
    print(f"{result['file']}: {result['chunks']} chunks")

# Ask multiple questions
questions = [
    "What is the purpose?",
    "Who are the stakeholders?",
    "What are the risks?",
    "What is the timeline?",
]
query_results = batch_queries(questions)
for result in query_results:
    print(f"Q: {result['query']}")
    print(f"A: {result['answer']}\n")


# ============================================================================
# EXAMPLE 5: Advanced - Context Retrieval Details
# ============================================================================
"""
Get detailed retrieval information
"""

def get_retrieval_details(query):
    """Get detailed info about what was retrieved"""
    response = ask_question(query)
    
    print(f"Query: {response['query']}")
    print(f"Answer: {response['answer']}")
    print(f"Number of sources: {response['num_sources']}")
    print("\nRetrieval Details:")
    
    for i, source in enumerate(response['sources'], 1):
        # Score: 0-1, where 1 is perfect match
        relevance = int(source['score'] * 100)
        print(f"\n{i}. Relevance: {relevance}%")
        print(f"   Text: {source['text']}")

get_retrieval_details("What is the main topic?")


# ============================================================================
# EXAMPLE 6: Component Integration Testing
# ============================================================================
"""
Test individual RAG components
"""

from rag.retrieval.retriever import Retriever
from rag.llm.ollama_client import OllamaClient
from rag.embeddings.embedding_generator import generate_embeddings

# Test embedding generation
def test_embeddings():
    texts = ["Hello world", "Another test"]
    embeddings = generate_embeddings(texts)
    print(f"Generated {len(embeddings)} embeddings")
    print(f"Embedding size: {embeddings[0].shape}")

# Test retriever
def test_retriever(query):
    retriever = Retriever(top_k=5)
    results = retriever.retrieve(query)
    print(f"Retrieved {len(results)} documents for: {query}")
    for result in results:
        print(f"- Score: {result['score']:.2f}")
        print(f"  Text: {result['text'][:100]}...")

# Test LLM
def test_llm(prompt):
    llm = OllamaClient()
    
    if not llm.is_available():
        print("Ollama service not available")
        return
    
    response = llm.generate(prompt)
    print(f"Prompt: {prompt}")
    print(f"Response: {response}")

test_embeddings()
test_retriever("What is this about?")
test_llm("What is machine learning?")


# ============================================================================
# EXAMPLE 7: Error Handling
# ============================================================================
"""
Proper error handling for API calls
"""

def safe_upload(file_path):
    """Upload with error handling"""
    try:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        if not file_path.endswith('.pdf'):
            raise ValueError("Only PDF files are supported")
        
        response = requests.post(
            f"{BASE_URL}/documents/upload",
            files={'file': open(file_path, 'rb')}
        )
        
        if response.status_code == 200:
            return {"success": True, "data": response.json()}
        else:
            return {
                "success": False,
                "error": f"HTTP {response.status_code}",
                "message": response.json().get("detail")
            }
    
    except FileNotFoundError as e:
        return {"success": False, "error": "FileNotFound", "message": str(e)}
    except ValueError as e:
        return {"success": False, "error": "ValueError", "message": str(e)}
    except requests.RequestException as e:
        return {"success": False, "error": "ConnectionError", "message": str(e)}

result = safe_upload("document.pdf")
if result['success']:
    print("Upload successful!")
else:
    print(f"Error: {result['error']} - {result['message']}")


# ============================================================================
# EXAMPLE 8: FastAPI TestClient (For Testing)
# ============================================================================
"""
Unit testing with FastAPI TestClient
"""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Test root endpoint
response = client.get("/")
assert response.status_code == 200
print("✓ Server is running")

# Test documents endpoint
response = client.get("/api/v1/documents/")
assert response.status_code == 200
print("✓ Documents endpoint works")

# Test chat health
response = client.get("/api/v1/chat/health")
assert response.status_code == 200
assert response.json()["status"] == "healthy"
print("✓ Chat service is healthy")


# ============================================================================
# EXAMPLE 9: Integration Workflow
# ============================================================================
"""
Complete end-to-end workflow
"""

def complete_workflow():
    """Run complete RAG workflow"""
    
    print("Step 1: Upload Document")
    print("-" * 50)
    upload_result = upload_document("document.pdf")
    if upload_result.get("status") != "success":
        print("Failed to upload")
        return
    print(f"✓ Uploaded: {upload_result['chunks_stored']} chunks")
    
    print("\nStep 2: Query Document")
    print("-" * 50)
    queries = [
        "What is the main topic?",
        "Summarize the key points",
        "What are the next steps?"
    ]
    
    for query in queries:
        result = ask_question(query)
        print(f"\nQ: {query}")
        print(f"A: {result['answer'][:200]}...")
        print(f"Sources: {result['num_sources']}")

# complete_workflow()


# ============================================================================
# EXAMPLE 10: Configuration & Customization
# ============================================================================
"""
Customize RAG pipeline behavior
"""

from rag.pipelines.rag_pipeline import RAGPipeline

# Create pipeline with custom settings
pipeline = RAGPipeline(
    top_k=10,           # Get top 10 most relevant chunks
    model="llama2"      # Use specific Ollama model
)

# Use custom pipeline
response = pipeline.run_rag("Your question here")
print(f"Found {response['num_sources']} relevant documents")
print(f"Answer: {response['answer']}")

# Or use the global pipeline with default settings
from rag.pipelines.rag_pipeline import run_rag
response = run_rag("Another question")
print(response['answer'])


# ============================================================================
# Performance Notes
# ============================================================================
"""
Expected Performance Metrics for Phase 1:

Document Upload & Ingestion:
  - Small PDF (< 10 pages): 2-5 seconds
  - Medium PDF (10-50 pages): 10-20 seconds
  - Chunking: ~1ms per chunk
  - Embedding generation: ~100ms per chunk
  - Storage in Qdrant: ~10ms per chunk

Query Processing:
  - Embedding query: ~50ms
  - Vector search (top-5): <10ms
  - LLM generation: 2-10 seconds (depends on model and length)
  - Total query time: 2-12 seconds

Memory Usage:
  - Embedding model: ~300MB
  - Qdrant (empty): ~50MB
  - FastAPI app: ~100MB
  - Total baseline: ~500MB

Optimizations (for Phase 2+):
  - Batch processing for multiple documents
  - Async/await for concurrent requests
  - Caching for frequent queries
  - Model quantization for faster inference
"""
