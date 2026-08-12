#!/usr/bin/env python3
"""
Phase 1 Quick Start Script
Sets up and validates the RAG pipeline
"""

import subprocess
import sys
import os
from pathlib import Path

def run_command(cmd, description):
    """Run a command and handle errors"""
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
    """Run Phase 1 quick start"""
    print("\n")
    print("  ╔═══════════════════════════════════════════════════╗")
    print("  ║  RAG Application - Phase 1 Quick Start Setup      ║")
    print("  ║  PDF → Embeddings → Qdrant → Retriever → Ollama  ║")
    print("  ╚═══════════════════════════════════════════════════╝")
    
    steps = [
        ("pip install -r requirements.txt", "Installing Python dependencies"),
        ("python test_phase1.py", "Running Phase 1 validation tests"),
    ]
    
    for cmd, description in steps:
        if not run_command(cmd, description):
            print(f"\n✗ Failed at: {description}")
            print("\nTroubleshooting:")
            print("1. Ensure Python 3.9+ is installed")
            print("2. Check that you're in the RAG-APPLICATION directory")
            print("3. Create and activate virtual environment:")
            print("   python -m venv .venv")
            print("   .venv\\Scripts\\activate  # Windows")
            print("   source .venv/bin/activate  # macOS/Linux")
            return False
    
    print("\n")
    print("  ╔═══════════════════════════════════════════════════╗")
    print("  ║  ✓ Phase 1 Setup Complete!                       ║")
    print("  ╚═══════════════════════════════════════════════════╝")
    
    print("\n📋 Next Steps:\n")
    
    print("1. START REQUIRED SERVICES:")
    print("   Terminal 1 - Qdrant Vector Database:")
    print("   $ docker run -p 6333:6333 qdrant/qdrant\n")
    
    print("   Terminal 2 - Ollama LLM Service:")
    print("   $ ollama serve\n")
    
    print("   Terminal 3 - Pull a model:")
    print("   $ ollama pull llama2\n")
    
    print("2. START THE API SERVER:")
    print("   Terminal 4 - FastAPI Server:")
    print("   $ uvicorn app.main:app --reload --port 8000\n")
    
    print("3. INTERACT WITH THE API:\n")
    
    print("   Option A - Using cURL:")
    print("   # Upload a PDF")
    print("   $ curl -X POST 'http://localhost:8000/api/v1/documents/upload' \\")
    print("     -F 'file=@path/to/document.pdf'\n")
    
    print("   # Ask a question")
    print("   $ curl -X POST 'http://localhost:8000/api/v1/chat/message' \\")
    print("     -H 'Content-Type: application/json' \\")
    print("     -d '{\"query\": \"What is the document about?\"}'\n")
    
    print("   Option B - Using Python:")
    print("   import requests")
    print("   # Upload PDF")
    print("   with open('document.pdf', 'rb') as f:")
    print("       files = {'file': f}")
    print("       r = requests.post('http://localhost:8000/api/v1/documents/upload', files=files)")
    print("   # Ask question")
    print("   r = requests.post('http://localhost:8000/api/v1/chat/message',")
    print("                     json={'query': 'Your question here'})\n")
    
    print("   Option C - Interactive API Docs:")
    print("   → Visit: http://localhost:8000/docs (Swagger UI)")
    print("   → Visit: http://localhost:8000/redoc (ReDoc)\n")
    
    print("4. VERIFY SETUP:")
    print("   # Check if services are running")
    print("   $ curl http://localhost:6333/health       # Qdrant")
    print("   $ curl http://localhost:11434/api/tags   # Ollama")
    print("   $ curl http://localhost:8000/             # FastAPI\n")
    
    print("📚 Documentation:")
    print("   → See: PHASE1_SETUP.md")
    print("   → API Docs: http://localhost:8000/docs\n")
    
    print("🔍 Phase 1 Features Implemented:")
    print("   ✓ PDF document upload and text extraction")
    print("   ✓ Automatic text chunking (500 chars, 100 overlap)")
    print("   ✓ Embedding generation (BAAI/bge-small-en-v1.5, 384-dim)")
    print("   ✓ Vector storage in Qdrant")
    print("   ✓ Semantic similarity search")
    print("   ✓ LLM integration with Ollama")
    print("   ✓ RAG pipeline with context-aware generation")
    print("   ✓ FastAPI REST endpoints")
    print("   ✓ Comprehensive error handling\n")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
