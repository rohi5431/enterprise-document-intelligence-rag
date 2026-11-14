# ContextRag — Enterprise Deployment & Operations Guide

## 1. System Overview

**ContextRag** is an enterprise-grade document intelligence and hybrid Retrieval-Augmented Generation (RAG) platform consisting of:
- **Core Node.js/Express Gateway** (Port 3000): Serves client UI, authenticated REST APIs, multi-provider LLM routing, and hybrid vector/lexical retrieval.
- **Python FastAPI Document AI Microservice** (Port 8000): Handles layout analysis, OCR transcription (PaddleOCR), OpenCV image deskewing, and evaluation benchmarks.
- **Qdrant Vector Database** (Port 6333): Stores dense embeddings with HNSW indexing and payload filtering.
- **Redis Cache & Rate Limiter** (Port 6379): Distributed token-bucket throttling and Celery job queue.

---

## 2. Environment Configuration

Create a `.env` file in the project root:

```ini
# Environment
NODE_ENV=production
ENVIRONMENT=production
PORT=3000
SECRET_KEY=your-secure-random-32-byte-hex-secret-key-here

# CORS Configuration
CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]

# Multi-Provider LLM Keys
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-3-flash-preview
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3:latest

# Embeddings
EMBEDDING_PROVIDER=ollama
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# Vector Database (Qdrant)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=contextrag_enterprise

# Cache & Storage
REDIS_URL=redis://localhost:6379
DATABASE_URL=sqlite:///./storage/contextrag.db
```

> **Security Warning:** Never commit `.env` or paste live secrets into source repositories.

---

## 3. Local Development Startup

### Prerequisites
- Node.js v20+
- Python 3.11+
- Qdrant (docker or binary)
- Optional: Ollama (if using local offline inference)

### Step 1: Install Dependencies
```bash
# Node dependencies
npm install

# Python dependencies
python -m venv .venv
source .venv/bin/activate  # Or on Windows: .venv\Scripts\activate
pip install -r contextRag/requirements.txt
```

### Step 2: Start Qdrant
```bash
docker run -d -p 6333:6333 -v qdrant_storage:/qdrant/storage qdrant/qdrant:v1.12.1
```

### Step 3: Run the Services
```bash
# Terminal 1: Node.js Core Server & Vite Frontend
npm run dev

# Terminal 2: Python Document AI Service
cd contextRag
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Access the web interface at `http://localhost:3000`.

---

## 4. Production Deployment with Docker Compose

Deploy the complete enterprise stack with a single command:

```bash
docker compose up -d --build
```

### Verifying Service Health
```bash
# Check container status
docker compose ps

# Probe Node Core Liveness
curl -s http://localhost:3000/health
# Output: {"status":"ok","service":"ContextRag Core Gateway","uptime_seconds":...}

# Probe Node Core Readiness
curl -s http://localhost:3000/ready
# Output: {"status":"ready","documents_count":...,"chunks_count":...}

# Probe Python Document AI Health
curl -s http://localhost:8000/health
# Output: {"status":"running"}
```

---

## 5. Storage & Persistence

The platform persists data across container restarts using Docker volumes:
- `node_storage`: Stores `db.json` and local state.
- `python_storage`: Stores SQLite metadata database (`contextrag.db`).
- `qdrant_storage`: Persists vector points, payloads, and HNSW graphs.
- `redis_data`: Persists rate limiter states and background queues.

### Backup Procedure
```bash
# Backup Node Database
docker compose exec contextrag-node cp db.json /app/storage/db.backup-$(date +%Y%m%d).json

# Backup Qdrant Snapshots
curl -X POST http://localhost:6333/collections/contextrag_enterprise/snapshots
```

### Restore Procedure
```bash
# Stop application containers
docker compose stop contextrag-node contextrag-python

# Restore db.json
cp db.backup-20261111.json db.json

# Restart containers
docker compose start
```

---

## 6. Security & RBAC Policies

1. **Authentication:**
   - Passwords hashed using salted cryptographic **scrypt**.
   - Session tokens signed using **HMAC-SHA256** (`cr_...`) with 24-hour expiration.
   - Plaintext passwords from legacy installations automatically upgraded on login.
2. **Authorization (RBAC):**
   - Administrative endpoints (`/api/v1/admin/*`) strictly require `u.role === "admin"`.
   - Unauthorized requests return `401 Unauthorized` (missing/invalid token) or `403 Forbidden` (non-admin role).
   - `x-demo-mode` header bypass is completely blocked.
3. **Upload Security:**
   - 15 MB hard file size limit enforced.
   - Dangerous executable formats (`.exe`, `.sh`, `.bat`, `.cmd`) rejected.
   - Supported formats: PDF (native & scanned OCR), DOCX, TXT, CSV (structured markdown tables), Markdown.
   - SHA-256 buffer deduplication prevents redundant processing.

---

## 7. Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| Gemini requests fail with 404 | Deprecated model name in `.env` | Set `GEMINI_MODEL=gemini-3-flash-preview` or `gemini-3.1-flash-lite`. |
| Groq returns 401 | Invalid or expired API key | Verify `GROQ_API_KEY` in `.env`. |
| Ollama skipped | Daemon not running | Start local Ollama daemon (`ollama serve`) or rely on Groq/Gemini hosted fallback. |
| Port 3000 already in use | Conflicting local process | Set `PORT=3001` in `.env` or stop conflicting process. |
| Duplicate document rejected | Content hash already indexed | File content is identical to an existing document. Reindexing is not needed. |
