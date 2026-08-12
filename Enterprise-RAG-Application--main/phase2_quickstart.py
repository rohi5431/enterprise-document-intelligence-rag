#!/usr/bin/env python3
"""
Phase 2: Production System Quick Start
Complete document ingestion pipeline with metadata management
"""

import subprocess
import sys
from pathlib import Path

def run_command(cmd, description):
    """Run a command and handle output"""
    print(f"\n{'='*60}")
    print(f"Step: {description}")
    print(f"{'='*60}")
    print(f"Running: {cmd}\n")
    
    try:
        result = subprocess.run(cmd, shell=True, cwd=Path(__file__).parent)
        return result.returncode == 0
    except Exception as e:
        print(f"Error: {e}")
        return False

def main():
    """Phase 2 Quick Start"""
    print("\n")
    print("  ╔════════════════════════════════════════════════════╗")
    print("  ║  Phase 2: Production Document Ingestion System    ║")
    print("  ║  PDF → Extract → Chunk → Embed → Store → Manage   ║")
    print("  ╚════════════════════════════════════════════════════╝")
    
    steps = [
        ("pip install -r requirements.txt", "Installing dependencies"),
        ("python test_phase2_integration.py", "Running Phase 2 validation tests"),
    ]
    
    print("\n📋 Phase 2 Components:")
    print("  ✓ Document metadata model with 20+ fields")
    print("  ✓ Chunk tracking for granular control")
    print("  ✓ Batch ingestion service (single/multiple/directory)")
    print("  ✓ Document cleanup and maintenance service")
    print("  ✓ Vector store management and health monitoring")
    print("  ✓ Performance monitoring and reporting")
    print("  ✓ Comprehensive validation tests")
    
    for cmd, description in steps:
        if not run_command(cmd, description):
            print(f"\n✗ Failed at: {description}")
            return False
    
    print("\n")
    print("  ╔════════════════════════════════════════════════════╗")
    print("  ║  ✓ Phase 2 Setup Complete!                        ║")
    print("  ╚════════════════════════════════════════════════════╝")
    
    print("\n📚 Phase 2 Features:\n")
    
    print("1. BATCH INGESTION")
    print("   • Single document processing")
    print("   • Multiple documents batch processing")
    print("   • Directory scanning (recursive)")
    print("   • File deduplication (SHA-256 hash)")
    print("   • Detailed progress tracking\n")
    
    print("2. DOCUMENT MANAGEMENT")
    print("   • Metadata tracking (25+ fields)")
    print("   • Processing status (pending → processing → success/failed)")
    print("   • Retrieval statistics")
    print("   • Quality metrics (relevance scores)")
    print("   • Chunk-level tracking\n")
    
    print("3. CLEANUP & MAINTENANCE")
    print("   • Safe document deletion")
    print("   • Vector store cleanup")
    print("   • Orphaned chunk removal")
    print("   • Unused file cleanup")
    print("   • Cleanup recommendations\n")
    
    print("4. VECTOR STORE MANAGEMENT")
    print("   • Collection health checks")
    print("   • Storage usage reports")
    print("   • Vector optimization")
    print("   • Integrity validation")
    print("   • Performance monitoring\n")
    
    print("5. PERFORMANCE MONITORING")
    print("   • Operation timing (ms precision)")
    print("   • Per-phase breakdown (Extract, Chunk, Embed, Store)")
    print("   • Success/error rates")
    print("   • Historical trends (last hour, etc.)")
    print("   • Slowest operations tracking\n")
    
    print("🚀 Quick Start Examples:\n")
    
    print("1. SINGLE DOCUMENT INGESTION")
    print("""
    from sqlalchemy.orm import Session
    from rag.services.batch_ingestion_service import BatchIngestionService
    
    db = Session()
    service = BatchIngestionService(db)
    
    result = service.ingest_single_document(
        file_path="document.pdf",
        title="My Document",
        owner_id=1
    )
    print(f"Chunks created: {result['chunks_created']}")
    """)
    
    print("\n2. BATCH INGESTION (MULTIPLE FILES)")
    print("""
    results = service.ingest_multiple_documents(
        file_paths=["doc1.pdf", "doc2.pdf", "doc3.pdf"],
        owner_id=1,
        skip_duplicates=True
    )
    print(f"Successful: {results['successful']}/{results['total_files']}")
    """)
    
    print("\n3. DIRECTORY INGESTION")
    print("""
    results = service.ingest_directory(
        directory_path="./documents/",
        owner_id=1,
        recursive=True
    )
    print(f"Processed: {results['successful']} documents")
    """)
    
    print("\n4. GET INGESTION STATISTICS")
    print("""
    stats = service.get_ingestion_stats()
    print(f"Total documents: {stats['total_documents']}")
    print(f"Processed: {stats['processed_documents']}")
    print(f"Success rate: {stats['processing_success_rate']:.1f}%")
    """)
    
    print("\n5. CLEANUP OPERATIONS")
    print("""
    from rag.services.document_cleanup_service import DocumentCleanupService
    
    cleanup = DocumentCleanupService(db)
    
    # Delete specific document
    result = cleanup.delete_document(doc_id=1)
    
    # Cleanup failed documents
    result = cleanup.cleanup_failed_documents()
    
    # Get cleanup recommendations
    report = cleanup.get_cleanup_report()
    """)
    
    print("\n6. VECTOR STORE MANAGEMENT")
    print("""
    from rag.services.vector_store_management_service import VectorStoreManagementService
    
    store = VectorStoreManagementService()
    
    # Health check
    health = store.check_health()
    print(f"Status: {health['status']}")
    
    # Collection stats
    stats = store.get_collection_stats()
    print(f"Vectors: {stats['collection']['total_vectors']}")
    
    # Optimize
    store.optimize_collection()
    """)
    
    print("\n7. PERFORMANCE MONITORING")
    print("""
    from rag.services.performance_monitor import (
        get_ingestion_tracker,
        get_performance_monitor
    )
    
    tracker = get_ingestion_tracker()
    tracker.start_document_ingestion(doc_id=1)
    
    # ... ingestion process ...
    
    tracker.end_document_ingestion(doc_id=1, status="success")
    
    # Get report
    monitor = get_performance_monitor()
    report = monitor.get_performance_report()
    """)
    
    print("\n📊 API Endpoints (Ready for Phase 3):\n")
    
    print("Document Operations:")
    print("  POST   /api/v2/documents/upload          # Single document")
    print("  POST   /api/v2/documents/upload-batch    # Multiple documents")
    print("  GET    /api/v2/documents/                # List all")
    print("  GET    /api/v2/documents/{id}/           # Get details")
    print("  GET    /api/v2/documents/{id}/report     # Ingestion report")
    print("  DELETE /api/v2/documents/{id}            # Delete\n")
    
    print("Management Operations:")
    print("  GET    /api/v2/system/stats              # System statistics")
    print("  GET    /api/v2/system/cleanup-report     # Cleanup recommendations")
    print("  POST   /api/v2/system/cleanup            # Execute cleanup\n")
    
    print("Monitoring:")
    print("  GET    /api/v2/system/performance        # Performance metrics")
    print("  GET    /api/v2/system/vector-store       # Vector store status\n")
    
    print("🧪 Running Tests:\n")
    print("  # Validate all Phase 2 components")
    print("  python test_phase2_integration.py\n")
    
    print("📚 Documentation:")
    print("  → PHASE2_IMPLEMENTATION_SUMMARY.md  (This file, detailed)")
    print("  → PHASE1_SETUP.md                   (Phase 1 reference)")
    print("  → API_EXAMPLES.md                   (Code examples)\n")
    
    print("🔄 Phase 2 Workflow:\n")
    
    print("  1. Start services:")
    print("     - Qdrant: docker run -p 6333:6333 qdrant/qdrant")
    print("     - Ollama: ollama serve\n")
    
    print("  2. Prepare database:")
    print("     - Run migrations (Phase 3)")
    print("     - Or use auto-create (development)\n")
    
    print("  3. Start API server:")
    print("     - uvicorn app.main:app --reload\n")
    
    print("  4. Use ingestion service:")
    print("     - Via API endpoints (Phase 3)")
    print("     - Or directly in code\n")
    
    print("  5. Monitor operations:")
    print("     - Query performance metrics")
    print("     - Check vector store health")
    print("     - Review cleanup recommendations\n")
    
    print("✨ Phase 2 Improvements Over Phase 1:\n")
    print("  ✓ Document metadata tracking")
    print("  ✓ Batch processing (single, multiple, directory)")
    print("  ✓ File deduplication (prevents re-processing)")
    print("  ✓ Processing status tracking")
    print("  ✓ Chunk-level tracking and management")
    print("  ✓ Vector store lifecycle management")
    print("  ✓ Data cleanup and maintenance")
    print("  ✓ Performance monitoring and reporting")
    print("  ✓ Enhanced error handling")
    print("  ✓ Comprehensive statistics and reporting\n")
    
    print("🎯 Phase 2 Ready for:")
    print("  • Phase 3: REST API endpoints")
    print("  • Advanced retrieval (hybrid, re-ranking)")
    print("  • Multi-user document management")
    print("  • Enterprise analytics and audit logging\n")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
