# ContextRAG — Enterprise Document Intelligence & Multimodal RAG Platform

ContextRAG is an AI-powered document intelligence platform that transforms unstructured documents, scanned files, images, and handwritten notes into searchable knowledge. It combines **Retrieval-Augmented Generation (RAG), Optical Character Recognition (OCR), hybrid search, document layout analysis, and Large Language Models (LLMs)** to generate context-aware answers with source citations.

The platform supports document ingestion, text and layout extraction, semantic indexing, hybrid retrieval, reranking, conversational memory, and streaming responses. It also supports internet-based information retrieval where configured.

The system is designed around modular backend services, asynchronous processing, vector search, caching, and configurable LLM providers.

---

## Live Applications

| Version | Application |
|---|---|
| Live Application v1 | https://enterprise-rag-application-3.onrender.com |
| Live Application v2 | https://enterprise-document-intelligence-rag-6.onrender.com |
| Final Live Application | https://enterprise-document-intelligence-rag-1-lw2p.onrender.com |

---

## Key Features

### Document Intelligence and Multimodal Ingestion

- Multi-format document ingestion: PDF, DOCX, XLSX, PPTX, HTML, CSV, JSON, and Markdown.
- Digital and scanned PDF processing.
- Image text extraction using OCR.
- Handwritten document recognition.
- Image preprocessing using OpenCV.
- Document layout analysis and reading-order reconstruction.
- Table, text, and figure-aware processing.
- Structure-aware and parent-child chunking.
- Metadata extraction and document versioning.
- Batch document ingestion and background processing.

### Retrieval-Augmented Generation

- End-to-end RAG pipeline.
- Dense vector retrieval.
- BM25 lexical retrieval.
- Hybrid search using Reciprocal Rank Fusion (RRF).
- Query rewriting and multi-query retrieval.
- Cross-encoder reranking.
- Parent-child retrieval.
- Context compression.
- Source-grounded answer generation.
- Document-level citations.
- Configurable retrieval pipeline.

### Conversational AI

- Multi-session conversations.
- Conversation memory.
- Context-aware follow-up questions.
- Streaming LLM responses.
- Configurable LLM providers.
- Internet-based information retrieval where configured.
- Source references for retrieved information.

### Authentication and Security

The project includes the following security features and controls:

- JWT-based authentication.
- OAuth 2.0 integration.
- Role-Based Access Control (RBAC).
- Organization and workspace access management.
- Prompt-injection detection.
- Jailbreak detection.
- PII detection.
- Secure file-upload validation.
- API rate limiting.
- Audit logging.
- AES-256 encryption support.

### Enterprise Administration

The platform includes an administrative dashboard for managing application operations.

**Dashboard modules:**

- User management.
- Organization management.
- Workspace management.
- Document management.
- Knowledge-base management.
- Prompt management.
- AI playground.
- Model management.
- Analytics dashboard.
- Security center.
- Audit logs.
- Background-job monitoring.
- Token-usage analytics.
- Cost analytics.
- System monitoring.
- API management.
- Settings management.

---

## System Architecture

The platform follows a modular architecture that separates document ingestion, indexing, retrieval, generation, and application management.

### High-Level Architecture

<img width="3076" height="813" alt="ContextRAG System Architecture" src="https://github.com/user-attachments/assets/8cd103ef-5f13-4f19-8b4b-44a43de72eb2" />

### Architecture Overview

<img width="8445" height="3110" alt="ContextRAG Architecture Overview" src="https://github.com/user-attachments/assets/5f7c2bef-7777-4e74-9450-436aa4915746" />

### Main Processing Layers

| Layer | Responsibility |
|---|---|
| Application Layer | Authentication, APIs, frontend, sessions, and user interaction. |
| Ingestion Layer | File validation, document detection, text extraction, and OCR. |
| Processing Layer | Layout analysis, reading-order reconstruction, and chunking. |
| Indexing Layer | Embedding generation, metadata storage, and vector indexing. |
| Retrieval Layer | Dense search, BM25, hybrid fusion, and reranking. |
| Generation Layer | Context construction, LLM inference, and answer generation. |
| Infrastructure Layer | Redis, databases, background workers, monitoring, and deployment. |

---

## Document AI Ingestion Pipeline

ContextRAG uses different processing paths for digital and scanned documents.

```text
                    DOCUMENT
                       |
                       v
              Document Detection
                       |
               +-------+-------+
               |               |
               v               v
           Digital           Scanned
               |               |
               v               v
            PyMuPDF          PyMuPDF
                            Render Image
                                |
                                v
                              OpenCV
                                |
                                v
                            PaddleOCR
               |                |
               +-------+--------+
                       |
                       v
                 Layout Analysis
                       |
              +--------+--------+
              |        |        |
              v        v        v
             Text    Tables   Figures
              |        |        |
              +--------+--------+
                       |
                       v
                 Reading Order
                       |
                       v
              Semantic / Layout
                   Chunking
                       |
                       v
                  Embeddings
                       |
                       v
                    Qdrant
                       |
                       v
                 RAG Retrieval
                       |
                       v
                      LLM
                       |
                       v
                Answer + Citations
```

### Document Processing Steps

1. Detect the uploaded document format.
2. Identify whether PDF pages contain digital text or scanned content.
3. Extract digital text using PyMuPDF.
4. Render scanned pages into images.
5. Apply image preprocessing using OpenCV.
6. Extract text using PaddleOCR.
7. Analyze document layouts and identify content structures.
8. Reconstruct logical reading order.
9. Generate semantic and layout-aware chunks.
10. Generate embeddings for processed content.
11. Store embeddings and associated metadata in Qdrant.

---

## RAG Pipeline

The RAG pipeline retrieves relevant document context before generating an answer.

```text
              Documents
                  |
                  v
             Document Loader
                  |
                  v
             Text Extraction
                  |
                  v
                Chunking
                  |
                  v
          Embedding Generation
                  |
                  v
          Vector Database Storage
                  |
                  v
              User Query
                  |
                  v
             Query Embedding
                  |
                  v
            Similarity Search
                  |
                  v
          Hybrid Retrieval (BM25)
                  |
                  v
           RRF Ranking / Reranking
                  |
                  v
          Top-K Relevant Chunks
                  |
                  v
             Prompt Builder
                  |
                  v
                 LLM
                  |
                  v
           Answer Generation
                  |
                  v
          Citations + Response
```

### Query Processing

1. The user submits a question through the chat interface.
2. The query is transformed into an embedding.
3. Dense retrieval searches for semantically similar passages.
4. BM25 retrieves keyword-relevant passages.
5. Reciprocal Rank Fusion combines the retrieval rankings.
6. A reranker improves the ordering of relevant results.
7. The context builder prepares the final prompt.
8. The selected LLM generates a context-grounded response.
9. The application streams the answer and displays source citations.

---

## Authentication and User Interface

### User Authentication

<img width="1792" height="845" alt="Authentication Interface" src="https://github.com/user-attachments/assets/56e0b19b-a696-4778-9289-11e802604c88" />

<img width="1883" height="924" alt="Authentication Interface" src="https://github.com/user-attachments/assets/a7892af6-31bf-4ad5-a214-d0454ca20556" />

<img width="1905" height="920" alt="Authentication Interface" src="https://github.com/user-attachments/assets/a59378e1-d14b-43a3-95bf-fc59bbff95de" />

<img width="1901" height="918" alt="Authentication Interface" src="https://github.com/user-attachments/assets/b6a4299a-b0da-4213-bc3d-3debec242661" />

<img width="1905" height="918" alt="Authentication Interface" src="https://github.com/user-attachments/assets/5eec4c82-e9a8-481f-a87e-5d03dd874faf" />

<img width="1877" height="834" alt="Authentication Interface" src="https://github.com/user-attachments/assets/284869ca-ac98-4ca8-b982-ea832074c668" />

<img width="1870" height="836" alt="Authentication Interface" src="https://github.com/user-attachments/assets/ab64f57a-996e-4bac-a71a-7ddfe57f9eb6" />

### AI Chat Interface

<img width="1863" height="835" alt="AI Chat Interface" src="https://github.com/user-attachments/assets/44e10c8a-3aff-41ea-8feb-6097b6c7ea94" />

<img width="1866" height="830" alt="AI Chat Interface" src="https://github.com/user-attachments/assets/abe455a8-73ec-41b1-8f82-f92ccfe5406b" />

<img width="1865" height="843" alt="AI Chat Interface" src="https://github.com/user-attachments/assets/fac53c1f-f45e-45c5-bcc5-b0801bcd1cfe" />

<img width="1904" height="920" alt="AI Chat Interface" src="https://github.com/user-attachments/assets/8314ed06-2752-4180-a152-5178c1020c02" />

<img width="1909" height="927" alt="AI Chat Interface" src="https://github.com/user-attachments/assets/fb2a4a0e-1474-4318-b36e-551e1339aa83" />

---

## Performance Engineering and Benchmarks

The following figures are from the project's reported benchmark and optimization runs. They represent specific component, endpoint, and provider measurements rather than a single end-to-end RAG benchmark.

### 1. Storage Blocking Optimization

**Problem:** The admin health-check path synchronously read and parsed a 100.2 MB `db.json` file using `fs.readFileSync()` and `JSON.parse()`. The reported operation took 7,607 ms and blocked the Node.js event loop.

**Optimization:** Replaced the full-file read and parse in that check with `fs.statSync(DB_FILE)` against the in-memory database singleton.

| Metric | Before | After | Reported improvement |
|---|---:|---:|---:|
| Storage monitoring check | 7,607 ms | 1 ms | Approximately 7,600× faster |

This optimization applies to the storage monitoring check; it does not mean that every database read or write takes 1 ms.

### 2. Retrieval and Caching Optimization

| Pipeline operation | Before / uncached | Optimized / cached | Optimization |
|---|---:|---:|---|
| Storage monitoring check | 7,607 ms | 1 ms | In-memory metadata check |
| BM25 retrieval scoring | 120–180 ms | 15–30 ms | Query-term pre-filtering |
| Dense query embedding | 120–250 ms | Reported 0 ms on cache hit | In-memory LRU cache |
| Groq LLM generation | 1,800–4,500 ms (previous CPU Ollama setup) | 350–500 ms | Provider routing to Groq |
| Repeated / cached RAG query | 1,500–3,500 ms | Below 5 ms | Redis response cache |

**Redis caching:** Repeated or semantically equivalent requests can use cached responses instead of repeating the full embedding, retrieval, and generation workflow. The reported cache latency depends on a warm cache hit.

### 3. Express Endpoint Concurrency Benchmark

The following load test measures the Express identity endpoint, including request routing, authentication, and response handling. It is not a measurement of full document ingestion or end-to-end RAG throughput.

| Concurrent streams | Requests | Success rate | Mean latency | P95 latency | P99 latency | Throughput |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 20 | 100% | 5.51 ms | 62.34 ms | 62.34 ms | 180 req/s |
| 5 | 100 | 100% | 4.10 ms | 6.25 ms | 7.84 ms | 1,182 req/s |
| 10 | 200 | 100% | 2.24 ms | 7.70 ms | 8.63 ms | 4,060 req/s |
| 25 | 500 | 100% | 5.16 ms | 16.38 ms | 21.03 ms | 4,801 req/s |
| 50 | 1,000 | 100% | 2.33 ms | 4.88 ms | 6.71 ms | 20,947 req/s |

### 4. Multimodal OCR and Handwriting Evaluation

The reported OCR evaluation contains 100 samples: 50 printed images and 50 handwritten notes.

| Category | Samples | CER | WER | Exact match |
|---|---:|---:|---:|---:|
| Printed images — Raw OCR | 50 | 0.97% | 2.00% | 45/50 (90%) |
| Printed images — Preprocessed | 50 | 0.00% | 0.00% | 50/50 (100%) |
| Handwritten notes — Raw OCR | 50 | 0.57% | 4.00% | 25/50 (50%) |
| Handwritten notes — Preprocessed | 50 | 0.68% | 0.50% | 47/50 (94%) |

**Interpretation:**

- Printed-image preprocessing improved exact match from 90% to 100%.
- Handwriting preprocessing improved exact match from 50% to 94%.
- Handwritten WER decreased from 4.00% to 0.50%.
- Handwritten CER increased slightly from 0.57% to 0.68%; therefore, not every OCR metric improved.

CER measures character-level errors, while WER measures word-level errors. Exact match measures the proportion of samples whose complete extracted text matches the reference.

### 5. LLM Provider Performance

The project uses configurable inference providers:

| Provider | Model | Reported TTFT | Reported total response | P99 | Output throughput |
|---|---|---:|---:|---:|---:|
| Groq | `openai/gpt-oss-120b` | 280 ms | 616 ms | 780 ms | ~145 tokens/s |
| Google Gemini | `gemini-3-flash-preview` | 410 ms | 1,605 ms | 1,890 ms | ~92 tokens/s |
| Ollama | `llama3:latest` | 320 ms | 657 ms | 840 ms | Not reported |

These are reported provider measurements. Prompt size, output-token count, iteration count, network conditions, and warm-up procedure were not specified in the supplied benchmark summary, so the values should not be treated as a controlled provider comparison.

---

## Technology Stack

### Backend

- Python
- FastAPI
- Uvicorn
- Node.js
- Express.js
- TypeScript

### Frontend

- React
- TypeScript
- Vite

### Databases and Storage

- PostgreSQL
- SQLite
- Qdrant
- Redis
- ChromaDB / FAISS (retrieval alternatives)

### AI and Document Processing

- LangChain
- LangGraph
- Sentence Transformers
- Hugging Face
- PaddleOCR
- OpenCV
- PyMuPDF
- Ollama
- Groq API
- Google Gemini API
- OpenAI API integration

### Background Processing and Infrastructure

- Celery
- Docker
- Docker Compose
- Nginx

### Observability and Evaluation

- LangSmith
- RAGAS
- Request and error logging
- Token-usage tracking
- Retrieval and latency metrics

---

## API Overview

The following are the documented example endpoints from the project README. Confirm the actual route prefixes and request schemas in the running API documentation.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/documents/upload` | Upload a document |
| POST | `/chat/query` | Submit a question |

### Health Check

```http
GET /health
```

### Upload Document

```http
POST /documents/upload
```

### Ask a Question

```http
POST /chat/query
Content-Type: application/json
```

Example request:

```json
{
  "question": "What is FastAPI?"
}
```

Example response:

```json
{
  "answer": "FastAPI is a modern Python web framework designed for building high-performance APIs."
}
```

For the complete endpoint list, request schemas, and interactive testing, use the FastAPI Swagger interface after starting the backend:

```text
http://127.0.0.1:8000/docs
```

---

## Installation and Local Development

### Prerequisites

Install the following tools before starting:

- Python 3.11+
- Node.js and npm
- Git
- Docker Desktop (for containerized dependencies)
- Ollama (if using local LLM inference)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <repository-folder>
```

### 2. Create a Python Virtual Environment

```bash
python -m venv .venv
```

Activate it on Windows:

```powershell
.venv\Scripts\Activate.ps1
```

Activate it on Linux or macOS:

```bash
source .venv/bin/activate
```

### 3. Install Python Dependencies

Use the requirements file belonging to the Python backend:

```bash
pip install -r requirements.txt
```

If the Python service has its own requirements file in a subdirectory, run the command from that service directory.

### 4. Install Node.js Dependencies

From the directory containing `package.json`:

```bash
npm install
```

### 5. Configure Environment Variables

Create local `.env` files based on the environment configuration required by the application.

Typical configuration categories include:

```env
# LLM provider configuration
LLM_PROVIDER=groq

# Provider API credentials
GROQ_API_KEY=
GEMINI_API_KEY=

# Local model configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3:latest

# Database and cache configuration
DATABASE_URL=
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
```

These are illustrative settings. Use the exact variable names expected by your current backend configuration. Do not commit real API keys, credentials, or production secrets to GitHub.

### 6. Start Infrastructure

If your repository contains a Docker Compose configuration:

```bash
docker compose up -d
```

Check container status:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```

### 7. Start the Python Backend

From the Python service directory:

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 8. Start the Main Application

From the directory containing the relevant `package.json`:

```bash
npm run dev
```

Check the available project scripts before starting separate frontend, backend, or worker processes:

```bash
npm run
```

### 9. Start Background Workers

If the project uses Celery, start the worker using the actual Celery application module configured in the repository:

```bash
celery -A <celery_application_module> worker --loglevel=info --pool=solo
```

The module path is project-specific and should be taken from the worker configuration.

### 10. Open the Application

Open the frontend URL printed by the development server.

For FastAPI documentation:

```text
http://127.0.0.1:8000/docs
```

---

## Production Deployment Considerations

The project includes Docker, Redis, background processing, API services, and reverse-proxy components. For a production deployment, the following operational controls should be configured and tested for the target environment.

### Application and Infrastructure

- Run application services in containers.
- Use a reverse proxy such as Nginx.
- Keep secrets in environment variables or a dedicated secrets manager.
- Use persistent storage for database and uploaded-document data.
- Configure database backups and restore procedures.
- Configure Redis persistence or recovery according to its role.
- Use health and readiness checks.
- Configure resource limits for containers.
- Run application processes with least-privilege permissions.

### Security

- Enforce authentication and authorization on protected routes.
- Validate uploaded file types, sizes, and content.
- Restrict cross-origin access to trusted origins.
- Apply API rate limits.
- Protect internal services from SSRF.
- Avoid logging credentials, tokens, and sensitive document content.
- Rotate secrets and signing keys.
- Review tenant isolation and workspace-level access boundaries.

### Reliability and Observability

- Use structured application logs.
- Track API latency and error rates.
- Monitor background-job failures and retries.
- Monitor Redis, database, and Qdrant health.
- Track LLM usage and provider failures.
- Configure timeouts and bounded retries.
- Test backup restoration and service recovery.
- Run load tests against the complete document-to-answer workflow before making end-to-end capacity claims.

---

## Monitoring and Evaluation

### Monitoring

The project includes or integrates monitoring capabilities for:

- Request logging.
- Token-usage tracking.
- Prompt and response tracking.
- Response latency.
- Retrieval latency.
- Background-job monitoring.
- Error monitoring.
- LangSmith tracing.

### RAG Evaluation Metrics

The retrieval and generation pipeline can be evaluated using:

- Faithfulness.
- Context precision.
- Context recall.
- Answer relevancy.
- Retrieval precision.
- Retrieval recall.
- Mean Reciprocal Rank (MRR).
- Normalized Discounted Cumulative Gain (nDCG).
- Hallucination analysis.

Evaluation scores depend on the dataset, ground-truth annotations, and evaluation configuration.

---

## Engineering Highlights

The implementation demonstrates several practical backend and AI engineering concepts:

1. **Document processing:** Separate extraction paths for digital PDFs and scanned documents.
2. **Hybrid retrieval:** Combines dense vector search with BM25 lexical search.
3. **Ranking optimization:** Uses Reciprocal Rank Fusion and reranking to improve retrieval ordering.
4. **Caching:** Uses Redis and in-memory caching to reduce repeated computation.
5. **Asynchronous processing:** Uses background workers for long-running operations where configured.
6. **LLM provider routing:** Supports cloud and local inference providers.
7. **Streaming:** Sends generated responses incrementally.
8. **Access control:** Organizes authentication and role-based access.
9. **Performance engineering:** Reduces synchronous blocking and unnecessary retrieval work.
10. **Observability:** Tracks application and AI pipeline behavior.

---

## Repository Setup and Configuration Notes

Before deploying a fresh environment:

- Verify all required `.env` variables.
- Confirm database migrations or initialization steps.
- Ensure Qdrant collections and embedding dimensions match the configured embedding model.
- Verify Redis connectivity.
- Confirm background workers are using the correct queue configuration.
- Download required local models if using Ollama.
- Confirm the frontend API base URL points to the correct backend.
- Test file upload, retrieval, citations, and streaming after deployment.

---

## Author

**Rohit Kumar**

Computer Science & Engineering  
Backend Engineering | Applied AI | Retrieval-Augmented Generation

Areas of interest:

- Backend Engineering
- Distributed Systems
- Document Intelligence
- Retrieval-Augmented Generation
- Vector Search
- AI Application Development
- Scalable API Design

---

## License

Add a license file to the repository if you intend to distribute or reuse the project under an open-source license.

