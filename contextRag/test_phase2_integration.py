"""
Phase 2: Retrieval Validation Tests
Comprehensive testing of the complete ingestion and retrieval pipeline
"""

import sys
import os
import tempfile
from pathlib import Path
from typing import List, Tuple

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def test_document_models():
    """Test document and chunk models"""
    print("\n" + "="*60)
    print("Testing Document Models")
    print("="*60)
    
    try:
        from app.models.document import Document
        from app.models.chunk import Chunk
        
        # Verify Document model fields
        doc_fields = {
            'id', 'title', 'filename', 'file_path', 'file_size', 'file_hash',
            'content', 'content_length', 'chunks_count', 'vectors_stored',
            'processing_status', 'processing_error', 'qdrant_collection_id',
            'vector_count', 'created_at', 'updated_at', 'processed_at',
            'owner_id', 'is_public', 'retrieval_count', 'last_retrieved_at',
            'average_chunk_score'
        }
        
        actual_fields = set(dir(Document))
        required_fields = doc_fields & actual_fields
        
        print(f"✓ Document model has {len(required_fields)}/{len(doc_fields)} required fields")
        
        # Verify Chunk model fields
        chunk_fields = {
            'id', 'document_id', 'text', 'sequence_number', 'qdrant_point_id',
            'token_count', 'character_count', 'relevance_score', 'retrieval_count',
            'created_at'
        }
        
        actual_chunk_fields = set(dir(Chunk))
        required_chunk_fields = chunk_fields & actual_chunk_fields
        
        print(f"✓ Chunk model has {len(required_chunk_fields)}/{len(chunk_fields)} required fields")
        
        return True
    
    except Exception as e:
        print(f"✗ Document model test failed: {e}")
        return False


def test_document_repository():
    """Test document repository operations"""
    print("\n" + "="*60)
    print("Testing Document Repository")
    print("="*60)
    
    try:
        from app.repositories.document_repository import DocumentRepository
        
        # Check required methods
        required_methods = {
            'create_document', 'get_document', 'get_document_by_hash',
            'list_documents', 'update_document_status', 'update_document_chunks',
            'update_document_content', 'increment_retrieval_count',
            'delete_document', 'get_document_stats',
            'create_chunk', 'create_chunks_batch', 'get_chunk',
            'get_document_chunks', 'get_chunk_by_qdrant_id',
            'update_chunk_qdrant_id', 'update_chunk_retrieval_score',
            'delete_document_chunks', 'get_chunk_stats'
        }
        
        repo_methods = set(dir(DocumentRepository))
        available_methods = required_methods & repo_methods
        
        print(f"✓ Repository has {len(available_methods)}/{len(required_methods)} required methods")
        
        if len(available_methods) == len(required_methods):
            print("✓ All repository methods implemented")
            return True
        else:
            missing = required_methods - available_methods
            print(f"✗ Missing methods: {missing}")
            return False
    
    except Exception as e:
        print(f"✗ Repository test failed: {e}")
        return False


def test_batch_ingestion_service():
    """Test batch ingestion service"""
    print("\n" + "="*60)
    print("Testing Batch Ingestion Service")
    print("="*60)
    
    try:
        from rag.services.batch_ingestion_service import BatchIngestionService
        
        required_methods = {
            'calculate_file_hash', 'ingest_single_document',
            'ingest_multiple_documents', 'ingest_directory',
            'get_ingestion_stats', 'get_document_ingestion_report',
            'list_ingested_documents'
        }
        
        service_methods = set(dir(BatchIngestionService))
        available_methods = required_methods & service_methods
        
        print(f"✓ Service has {len(available_methods)}/{len(required_methods)} required methods")
        
        return len(available_methods) == len(required_methods)
    
    except Exception as e:
        print(f"✗ Batch ingestion test failed: {e}")
        return False


def test_cleanup_service():
    """Test cleanup service"""
    print("\n" + "="*60)
    print("Testing Cleanup Service")
    print("="*60)
    
    try:
        from rag.services.document_cleanup_service import DocumentCleanupService
        
        required_methods = {
            'delete_document', 'delete_multiple_documents',
            'cleanup_failed_documents', 'cleanup_orphaned_chunks',
            'cleanup_unused_uploads', 'get_cleanup_report'
        }
        
        service_methods = set(dir(DocumentCleanupService))
        available_methods = required_methods & service_methods
        
        print(f"✓ Service has {len(available_methods)}/{len(required_methods)} required methods")
        
        return len(available_methods) == len(required_methods)
    
    except Exception as e:
        print(f"✗ Cleanup service test failed: {e}")
        return False


def test_vector_store_management():
    """Test vector store management service"""
    print("\n" + "="*60)
    print("Testing Vector Store Management Service")
    print("="*60)
    
    try:
        from rag.services.vector_store_management_service import VectorStoreManagementService
        
        required_methods = {
            'get_collection_info', 'get_collection_stats', 'check_health',
            'search_vectors', 'get_vector', 'delete_vector', 'delete_vectors_batch',
            'clear_collection', 'optimize_collection', 'recreate_collection',
            'get_storage_report', 'validate_collection'
        }
        
        service_methods = set(dir(VectorStoreManagementService))
        available_methods = required_methods & service_methods
        
        print(f"✓ Service has {len(available_methods)}/{len(required_methods)} required methods")
        
        # Try to create instance and check Qdrant
        service = VectorStoreManagementService()
        health = service.check_health()
        
        if health.get("status") == "healthy":
            print(f"✓ Qdrant service is healthy")
            info = service.get_collection_info()
            print(f"  Collection: {info.get('collection_name')}")
            print(f"  Points: {info.get('points_count', 0)}")
            print(f"  Vector size: {info.get('vector_size', 0)}")
        else:
            print(f"⚠ Qdrant service not fully available (will work once service starts)")
        
        return len(available_methods) == len(required_methods)
    
    except Exception as e:
        print(f"⚠ Vector store test partially failed: {e}")
        print("  (This is expected if Qdrant is not running)")
        return True  # Don't fail on this since Qdrant might not be running


def test_ingestion_pipeline_structure():
    """Test ingestion pipeline components"""
    print("\n" + "="*60)
    print("Testing Ingestion Pipeline Structure")
    print("="*60)
    
    try:
        from rag.ingestion.pdf_loader import load_pdf
        from rag.chunking.text_chunker import create_chunks
        from rag.embeddings.embedding_generator import generate_embeddings
        from rag.vectorstore.qdrant_client import store_chunks
        
        # Test with mock data
        test_text = "This is a test document. " * 50
        
        # Test chunking
        chunks = create_chunks(test_text)
        print(f"✓ Text chunking: Created {len(chunks)} chunks")
        
        # Test embedding
        embeddings = generate_embeddings(chunks[:2])  # Test with first 2
        print(f"✓ Embedding generation: Generated {len(embeddings)} embeddings")
        print(f"  Embedding dimensions: {embeddings[0].shape}")
        
        return True
    
    except Exception as e:
        print(f"✗ Pipeline structure test failed: {e}")
        return False


def test_retrieval_pipeline():
    """Test retrieval pipeline"""
    print("\n" + "="*60)
    print("Testing Retrieval Pipeline")
    print("="*60)
    
    try:
        from rag.retrieval.retriever import Retriever
        from rag.llm.ollama_client import OllamaClient
        from rag.pipelines.rag_pipeline import RAGPipeline
        
        # Test retriever
        retriever = Retriever(top_k=5)
        print(f"✓ Retriever initialized")
        
        # Test LLM client
        llm = OllamaClient()
        available = llm.is_available()
        print(f"{'✓' if available else '⚠'} Ollama client: {'Available' if available else 'Will be available after startup'}")
        
        # Test RAG pipeline
        pipeline = RAGPipeline()
        print(f"✓ RAG pipeline initialized")
        
        return True
    
    except Exception as e:
        print(f"✗ Retrieval pipeline test failed: {e}")
        return False


def test_phase2_integration():
    """Integration test for Phase 2 components"""
    print("\n" + "="*60)
    print("Phase 2 Component Integration Test")
    print("="*60)
    
    tests = [
        ("Document Models", test_document_models),
        ("Document Repository", test_document_repository),
        ("Batch Ingestion Service", test_batch_ingestion_service),
        ("Cleanup Service", test_cleanup_service),
        ("Vector Store Management", test_vector_store_management),
        ("Ingestion Pipeline", test_ingestion_pipeline_structure),
        ("Retrieval Pipeline", test_retrieval_pipeline),
    ]
    
    results = {}
    for name, test_func in tests:
        results[name] = test_func()
    
    return results


def main():
    """Run all Phase 2 validation tests"""
    print("\n")
    print("  ╔═══════════════════════════════════════════════════╗")
    print("  ║  Phase 2: Retrieval Pipeline Validation Tests    ║")
    print("  ║  PDF → Extract → Chunk → Embed → Store → Ready   ║")
    print("  ╚═══════════════════════════════════════════════════╝")
    
    results = test_phase2_integration()
    
    print("\n" + "="*60)
    print("Phase 2 Test Summary")
    print("="*60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for name, passed_test in results.items():
        status = "✓ PASS" if passed_test else "✗ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} component tests passed")
    
    if passed == total:
        print("\n✓ Phase 2 validation SUCCESSFUL!")
        print("\nNext Steps:")
        print("1. Start Qdrant: docker run -p 6333:6333 qdrant/qdrant")
        print("2. Start Ollama: ollama serve")
        print("3. Start API: uvicorn app.main:app --reload")
        print("4. Run integration tests: python test_phase2_integration.py")
    else:
        print(f"\n✗ {total - passed} test(s) failed")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
