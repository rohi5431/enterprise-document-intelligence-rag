# Phase 1: RAG Pipeline Setup Guide

## Overview
Phase 1 implements the core RAG (Retrieval Augmented Generation) pipeline:
```
PDF → FastAPI → Embeddings → Qdrant → Retriever → Ollama → Answer
```

## Prerequisites
- Python 3.9+
- Docker & Docker Compose (for Qdrant and Ollama)
- Virtual Environment

## Installation Steps

### 1. Create Virtual Environment
```bash
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Start Services (Docker)

Start Qdrant vector database:
```bash
docker run -p 6333:6333 qdrant/qdrant
```

Start Ollama LLM server (in another terminal):
```bash
ollama serve
```

Then pull a model:
```bash
ollama pull llama2
```

Or use Docker Compose if available:
```bash
docker-compose up -d
```

## Project Structure

```
app/
├── api/v1/
│   ├── documents.py      # PDF upload endpoint
│   └── chat.py           # Chat/query endpoint
├── services/
│   └── chat_service.py   # RAG service layer
└── main.py               # FastAPI app

rag/
├── ingestion/
│   └── pdf_loader.py     # PDF text extraction
├── chunking/
│   └── text_chunker.py   # Document chunking
├── embeddings/
│   └── embedding_generator.py  # Text embeddings
├── vectorstore/
│   └── qdrant_client.py  # Vector DB operations
├── retrieval/
│   └── retriever.py      # Query document retrieval
├── llm/
│   ├── ollama_client.py  # LLM interface
│   └── prompt_templates.py  # Prompt management
└── pipelines/
    ├── ingestion_pipeline.py  # Document processing
    └── rag_pipeline.py        # Query processing
```

## Phase 1 Flow: Complete Component Map

### Component 1: PDF Upload (FastAPI)
**File**: `app/api/v1/documents.py`
- POST `/api/v1/documents/upload` - Upload PDF file
- GET `/api/v1/documents/` - List uploaded documents

**Flow**:
```
User uploads PDF
    ↓
FastAPI receives file
    ↓
Saves to uploads/docs/
    ↓
Triggers ingestion_pipeline
```

### Component 2: Document Ingestion
**File**: `rag/pipelines/ingestion_pipeline.py`
- Loads PDF text
- Creates text chunks
- Generates embeddings
- Stores in Qdrant

**Flow**:
```
PDF text
    ↓ load_pdf()
Raw text
    ↓ create_chunks()
Text chunks (500 chars, 100 overlap)
    ↓ generate_embeddings()
Vectors (384-dim)
    ↓ store_chunks()
Qdrant collection
```

### Component 3: Embedding Generation
**File**: `rag/embeddings/embedding_generator.py`
- Model: `BAAI/bge-small-en-v1.5`
- Output: 384-dimensional vectors
- Normalized embeddings

### Component 4: Vector Storage
**File**: `rag/vectorstore/qdrant_client.py`
- Collection: "documents"
- Vector size: 384
- Distance metric: Cosine similarity
- Point payload: chunk text

### Component 5: Query Processing (Chat)
**File**: `app/api/v1/chat.py`
- POST `/api/v1/chat/message` - Send query
- Expects: `{"query": "your question"}`

**Flow**:
```
User query
    ↓ FastAPI endpoint
RAG Pipeline
    ├─ Retriever: Find similar chunks
    ├─ Context: Combine top-5 chunks
    └─ LLM: Generate answer with context
Response with sources
```

### Component 6: Retrieval
**File**: `rag/retrieval/retriever.py`
- Embeds query
- Searches Qdrant (top-5)
- Returns relevant chunks + scores

### Component 7: LLM Generation
**File**: `rag/llm/ollama_client.py`
- Service: Ollama
- Model: llama2
- Prompt template: RAG-specific

### Component 8: RAG Pipeline Orchestration
**File**: `rag/pipelines/rag_pipeline.py`
- Coordinates all components
- Handles error cases
- Returns structured response

## Running Phase 1

### Start the Server
```bash
uvicorn app.main:app --reload --port 8000
```

### Test the API

**1. Upload a PDF**
```bash
curl -X POST "http://localhost:8000/api/v1/documents/upload" \
  -F "file=@path/to/document.pdf"
```

**2. Ask a Question**
```bash
curl -X POST "http://localhost:8000/api/v1/chat/message" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the main topic of the document?"}'
```

**3. API Documentation**
Visit: http://localhost:8000/docs

## Phase 1 Checklist

- [x] PDF document upload endpoint
- [x] Document text extraction
- [x] Text chunking (500 chars, 100 overlap)
- [x] Embedding generation (BAAI/bge-small-en-v1.5)
- [x] Qdrant vector storage
- [x] Vector similarity retrieval
- [x] Ollama LLM integration
- [x] RAG pipeline orchestration
- [x] Chat API endpoint
- [x] Error handling & logging
- [x] FastAPI documentation

## Key Features Implemented

1. **Document Ingestion**: Fully automated PDF → embeddings → storage
2. **Vector Search**: Semantic similarity search with Qdrant
3. **RAG Pipeline**: Complete retrieval + generation flow
4. **Chat API**: Easy-to-use query interface
5. **Error Handling**: Graceful error messages
6. **Logging**: Request tracking and debugging

## Configuration

### Environment Variables (create `.env` file)
```
QDRANT_HOST=localhost
QDRANT_PORT=6333
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
```

### Adjustable Parameters

**Chunking** (rag/chunking/text_chunker.py):
```python
chunk_size=500      # Character count per chunk
chunk_overlap=100   # Overlap between chunks
```

**Retrieval** (rag/retrieval/retriever.py):
```python
top_k=5            # Number of chunks to retrieve
```

**LLM** (rag/llm/ollama_client.py):
```python
model="llama2"     # Ollama model name
base_url="http://localhost:11434"
```

## Troubleshooting

### Qdrant Connection Failed
- Ensure Qdrant is running: `docker ps`
- Check port 6333 is accessible
- Verify connection: `curl http://localhost:6333/health`

### Ollama Connection Failed
- Ensure Ollama service is running
- Check Ollama API: `curl http://localhost:11434/api/tags`
- Model might not be downloaded: `ollama pull llama2`

### PDF Upload Failed
- File must be .pdf extension
- Ensure uploads/docs/ directory exists
- Check file size and format

### Empty Results
- Verify documents were uploaded successfully
- Check Qdrant collection has points
- Ensure embeddings were generated properly

## Performance Metrics

- Embedding generation: ~100ms per chunk
- Vector search: <10ms for 5 results
- LLM response: 2-5s (depends on model)
- Document upload: <5s for typical PDF
