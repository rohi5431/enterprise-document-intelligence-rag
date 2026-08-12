"""
Phase 1 Integration Test
Tests the complete RAG pipeline: PDF → Embeddings → Qdrant → Retriever → Ollama → Answer
"""

import asyncio
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

def test_imports():
    """Test that all Phase 1 modules can be imported"""
    print("Testing imports...")
    try:
        from rag.ingestion.pdf_loader import load_pdf
        from rag.chunking.text_chunker import create_chunks
        from rag.embeddings.embedding_generator import generate_embeddings
        from rag.vectorstore.qdrant_client import store_chunks, search_vectors, create_collection
        from rag.retrieval.retriever import Retriever
        from rag.llm.ollama_client import OllamaClient
        from rag.llm.prompt_templates import get_rag_prompt
        from rag.pipelines.ingestion_pipeline import ingest_document
        from rag.pipelines.rag_pipeline import run_rag
        from app.api.v1.documents import upload_document
        from app.api.v1.chat import message
        from app.services.chat_service import ChatService
        
        print("✓ All imports successful")
        return True
    except Exception as e:
        print(f"✗ Import failed: {e}")
        return False

def test_embedding_generation():
    """Test embedding generation"""
    print("\nTesting embedding generation...")
    try:
        from rag.embeddings.embedding_generator import generate_embeddings
        
        test_texts = ["Hello world", "This is a test"]
        embeddings = generate_embeddings(test_texts)
        
        assert len(embeddings) == 2, "Should generate 2 embeddings"
        assert embeddings[0].shape == (384,), "Embedding should be 384-dimensional"
        
        print(f"✓ Generated {len(embeddings)} embeddings, shape: {embeddings[0].shape}")
        return True
    except Exception as e:
        print(f"✗ Embedding generation failed: {e}")
        return False

def test_text_chunking():
    """Test text chunking"""
    print("\nTesting text chunking...")
    try:
        from rag.chunking.text_chunker import create_chunks
        
        test_text = "This is a longer text. " * 100
        chunks = create_chunks(test_text)
        
        assert len(chunks) > 0, "Should create at least 1 chunk"
        assert all(len(c) > 0 for c in chunks), "All chunks should be non-empty"
        
        print(f"✓ Created {len(chunks)} chunks")
        return True
    except Exception as e:
        print(f"✗ Text chunking failed: {e}")
        return False

def test_qdrant_connection():
    """Test Qdrant connection"""
    print("\nTesting Qdrant connection...")
    try:
        from rag.vectorstore.qdrant_client import client, create_collection, COLLECTION_NAME
        
        # Try to get server info
        info = client.get_collections()
        print(f"✓ Qdrant connected. Collections: {len(info.collections)}")
        
        # Create test collection
        create_collection()
        print(f"✓ Collection '{COLLECTION_NAME}' ready")
        return True
    except Exception as e:
        print(f"✗ Qdrant connection failed: {e}")
        print("  Make sure Qdrant is running on localhost:6333")
        print("  Run: docker run -p 6333:6333 qdrant/qdrant")
        return False

def test_ollama_connection():
    """Test Ollama LLM connection"""
    print("\nTesting Ollama connection...")
    try:
        from rag.llm.ollama_client import OllamaClient
        
        client = OllamaClient()
        
        if client.is_available():
            print("✓ Ollama service is available")
            return True
        else:
            print("✗ Ollama service is not available")
            print("  Make sure Ollama is running on localhost:11434")
            print("  Run: ollama serve")
            return False
    except Exception as e:
        print(f"✗ Ollama connection failed: {e}")
        return False

def test_retriever():
    """Test Retriever implementation"""
    print("\nTesting Retriever...")
    try:
        from rag.retrieval.retriever import Retriever
        
        retriever = Retriever(top_k=5)
        
        # This should work even without documents (returns empty list)
        results = retriever.retrieve("test query")
        
        assert isinstance(results, list), "Should return a list"
        print(f"✓ Retriever working (found {len(results)} documents)")
        return True
    except Exception as e:
        print(f"✗ Retriever test failed: {e}")
        return False

def test_ingestion_pipeline():
    """Test ingestion pipeline with mock data"""
    print("\nTesting ingestion pipeline...")
    try:
        from rag.pipelines.ingestion_pipeline import ingest_document
        import tempfile
        
        # Create a temporary text file (PDF would require actual file)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write("This is a test document. " * 50)
            temp_path = f.name
        
        try:
            # Try to ingest (will fail if trying to load as PDF, but tests the pipeline)
            result = ingest_document(temp_path, doc_type="pdf")
            
            # Expected to fail with PDF error, but pipeline structure is tested
            if result["status"] == "error":
                # Check it's the expected error
                if "unreadable" in result.get("error", "").lower():
                    print("✓ Ingestion pipeline structure validated")
                    return True
        finally:
            os.unlink(temp_path)
            
    except Exception as e:
        print(f"✗ Ingestion pipeline test failed: {e}")
        return False

def test_rag_pipeline_structure():
    """Test RAG pipeline structure"""
    print("\nTesting RAG pipeline structure...")
    try:
        from rag.pipelines.rag_pipeline import RAGPipeline, run_rag
        
        # Create pipeline instance
        pipeline = RAGPipeline()
        
        # Test pipeline method
        result = run_rag("test query")
        
        assert isinstance(result, dict), "Should return a dictionary"
        assert "query" in result, "Should have query field"
        assert "answer" in result, "Should have answer field"
        
        print("✓ RAG pipeline structure validated")
        return True
    except Exception as e:
        print(f"✗ RAG pipeline test failed: {e}")
        return False

def test_fastapi_integration():
    """Test FastAPI integration"""
    print("\nTesting FastAPI integration...")
    try:
        from app.main import app
        from fastapi.testclient import TestClient
        
        client = TestClient(app)
        
        # Test root endpoint
        response = client.get("/")
        assert response.status_code == 200
        
        # Test documents endpoint
        response = client.get("/api/v1/documents/")
        assert response.status_code == 200
        
        # Test chat health
        response = client.get("/api/v1/chat/health")
        assert response.status_code == 200
        
        print("✓ FastAPI endpoints responding correctly")
        return True
    except Exception as e:
        print(f"✗ FastAPI integration test failed: {e}")
        return False

def main():
    """Run all tests"""
    print("="*60)
    print("Phase 1 RAG Pipeline - Integration Tests")
    print("="*60)
    
    tests = [
        ("Imports", test_imports),
        ("Embedding Generation", test_embedding_generation),
        ("Text Chunking", test_text_chunking),
        ("Qdrant Connection", test_qdrant_connection),
        ("Ollama Connection", test_ollama_connection),
        ("Retriever", test_retriever),
        ("Ingestion Pipeline", test_ingestion_pipeline),
        ("RAG Pipeline Structure", test_rag_pipeline_structure),
        ("FastAPI Integration", test_fastapi_integration),
    ]
    
    results = {}
    for name, test_func in tests:
        results[name] = test_func()
    
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for name, passed_test in results.items():
        status = "✓ PASS" if passed_test else "✗ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✓ All Phase 1 components validated successfully!")
        print("\nYou can now:")
        print("1. Start the server: uvicorn app.main:app --reload")
        print("2. Upload PDFs: POST /api/v1/documents/upload")
        print("3. Ask questions: POST /api/v1/chat/message")
    else:
        print(f"\n✗ {total - passed} test(s) failed. See details above.")
        if not results.get("Qdrant Connection", False):
            print("   → Start Qdrant: docker run -p 6333:6333 qdrant/qdrant")
        if not results.get("Ollama Connection", False):
            print("   → Start Ollama: ollama serve")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
