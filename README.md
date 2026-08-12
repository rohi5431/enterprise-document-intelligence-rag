# 🚀 Enterprise RAG Platform

An enterprise-grade Retrieval-Augmented Generation (RAG) application built with FastAPI that enables users to upload documents, perform semantic search, and generate context-aware answers using Large Language Models (LLMs).

---

## 📌 About the Project

Traditional LLMs are limited to their training data and may generate hallucinated or outdated responses. This project solves that problem by combining document retrieval with LLM generation.

The system allows users to upload documents, converts them into vector embeddings, stores them in a vector database, retrieves relevant context for a query, and generates accurate answers grounded in the uploaded documents.

---

## 🌐 Live Demo

**🔗 Live Application v1:**
https://enterprise-rag-application-3.onrender.com

---

## 🎯 Project Goals

* Build a production-ready RAG platform
* Reduce LLM hallucinations through retrieval
* Enable document-based question answering
* Implement semantic search using vector embeddings
* Learn industry-standard backend architecture
* Explore FastAPI, Vector Databases, and LLM integration

---

## 🔒 Security Features

* JWT Authentication
* OAuth 2.0
* Role-Based Access Control (RBAC)
* Prompt Injection Detection
* Jailbreak Detection
* PII Detection
* Secure File Upload Validation
* API Rate Limiting
* Audit Logs
* AES-256 Encryption

## 📊 Enterprise Admin Dashboard

---

The platform includes a centralized admin dashboard for monitoring system health, AI usage, and enterprise operations.

### Dashboard Modules

* User Management
* Organization Management
* Workspace Management
* Document Management
* Knowledge Base
* Prompt Management
* AI Playground
* Model Management
* Analytics Dashboard
* Security Center
* Audit Logs
* Background Job Monitoring
* Token Usage Analytics
* Cost Analytics
* System Monitoring
* API Management
* Settings Management

---

## 📈 AI Evaluation

The RAG pipeline is continuously evaluated using industry-standard metrics.

Supported Metrics

* Faithfulness
* Context Precision
* Context Recall
* Answer Relevancy
* Retrieval Accuracy
* Hallucination Detection

---

## 📡 Monitoring & Observability

The platform provides enterprise-grade monitoring.

* LangSmith Tracing
* Request Logging
* Token Tracking
* Prompt Tracking
* Response Latency
* Retrieval Time
* Background Job Monitoring
* Error Monitoring

---

## 🚀 Production Features

* Docker Deployment
* Redis Caching
* Celery Background Workers
* Nginx Reverse Proxy
* Streaming Responses
* Horizontal Scaling Ready
* Modular Service Architecture
* Repository Pattern
* Dependency Injection
* Structured Logging

---

## 🎯 Enterprise Capabilities

* Enterprise Document Intelligence
* Production RAG Pipeline
* Agentic AI Workflow
* Hybrid Semantic Search
* AI Guardrails
* Enterprise Authentication
* Multi-Tenant Architecture
* Knowledge Base Management
* Enterprise Monitoring
* AI Evaluation Framework
* Prompt Management
* Production Deployment

---

# 📥 Document Ingestion & Intelligence

The platform provides a document ingestion pipeline designed to process both traditional digital documents and image-based/scanned documents.

### Supported File Types

* `.txt`
* `.pdf`
* `.docx`
* `.png`
* `.jpg`
* `.jpeg`

### Document Ingestion Pipeline

```text
Document Upload
      ↓
File Validation
      ↓
Document Type Detection
      ↓
Text Extraction
      ↓
OCR / Multimodal Fallback
      ↓
Metadata Extraction
      ↓
Paragraph-Aware Chunking
      ↓
Embedding Generation
      ↓
Vector Indexing
      ↓
BM25 Indexing
```

### Universal Document Parsing

The ingestion layer automatically identifies the uploaded document type and routes it to the appropriate parser.

```text
                    Uploaded File
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
        Text Document          Binary Document
             │                       │
             ▼                 ┌─────┴─────┐
         Text Read            PDF        DOCX
                                   │
                                   ▼
                              Text Parser
                                   │
                                   ▼
                           Extracted Content
```

### PDF Processing

The system supports both digitally generated and scanned PDFs.

```text
PDF
 │
 ├── Text Layer Available
 │       ↓
 │   Standard PDF Parser
 │
 └── No Text Layer
         ↓
   OCR / Multimodal Parsing
         ↓
    Extracted Content
```

This provides a fallback mechanism for image-only and scanned documents.

### Multimodal Document Understanding

Image-based documents can be processed using multimodal vision capabilities.

The system can extract meaningful information from:

* Scanned documents
* Images
* Slides
* Charts
* Tables
* Flowcharts
* Diagrams
* Structural designs
* Visual document layouts

The goal is not only to extract visible text but also to preserve useful semantic information contained within visual content.

---

## ✂️ Context-Preserving Chunking

After extraction, documents are divided into smaller chunks before embedding.

The chunking strategy is paragraph-aware and uses overlapping context.

```text
Maximum Chunk Size: 1000 characters
Overlap:            150 characters
Strategy:           Paragraph-aware
```

Example:

```text
Paragraph 1
Paragraph 2
Paragraph 3
Paragraph 4

        ↓

Chunk 1
[Paragraph 1 + Paragraph 2]

        ↓ 150 character overlap

Chunk 2
[End of Paragraph 2 + Paragraph 3]

        ↓ 150 character overlap

Chunk 3
[End of Paragraph 3 + Paragraph 4]
```

The overlap helps preserve contextual continuity between adjacent chunks and reduces information loss at chunk boundaries.

---

## 🧾 Document Metadata

The ingestion pipeline can associate metadata with extracted content and chunks.

Example metadata:

```json
{
  "document_id": "doc_001",
  "filename": "architecture.pdf",
  "file_type": "pdf",
  "page_number": 5,
  "chunk_id": "chunk_42"
}
```

Metadata can later be used for:

* Source citations
* Filtering
* Document-level retrieval
* Page-level references
* Debugging
* Analytics
* Access control

---

## 🔍 Hybrid Retrieval Architecture

The retrieval system combines semantic vector search with lexical BM25 search.

```text
                         User Query
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
          Query Embedding              BM25 Query
                 │                         │
                 ▼                         ▼
          Dense Search                Lexical Search
                 │                         │
                 ▼                         ▼
          Semantic Ranking             BM25 Ranking
                 │                         │
                 └────────────┬────────────┘
                              ▼
                     Reciprocal Rank
                        Fusion (RRF)
                              │
                              ▼
                       Final Results
```

### Dense Retrieval

Dense embeddings capture semantic relationships between the query and document chunks.

This allows the system to retrieve relevant content even when the query uses different wording from the source document.

### BM25 Lexical Retrieval

BM25 improves retrieval for exact terminology such as:

* Names
* IDs
* Technical terms
* Error messages
* Product names
* Acronyms
* Exact phrases

### Reciprocal Rank Fusion

RRF combines the rankings produced by dense and lexical retrieval.

This makes the retrieval layer more robust than relying on only semantic or keyword search.

---

## 🧠 Query Expansion

The retrieval pipeline can expand a user query into multiple semantically related search queries.

```text
User Query
     ↓
Query Expansion
     ↓
┌───────────────┬──────────────────┬──────────────────┐
│ Query Variant │ Query Variant    │ Query Variant    │
└───────────────┴──────────────────┴──────────────────┘
     ↓                  ↓                   ↓
 Dense Search       Dense Search        BM25 Search
     └──────────────────┬────────────────────┘
                        ↓
                       RRF
                        ↓
                 Relevant Context
```

This improves retrieval coverage for short, ambiguous, or differently worded questions.

---

## 💬 AI Chat Interface

The AI chat system supports:

* Streaming Responses
* Server-Sent Events (SSE)
* Conversation Memory
* Source Citations
* Multiple Response Styles
* Query History
* User Feedback
* Voice Input

### Response Styles

* Executive Brief
* Analytical Deep Dive
* Bulleted Breakdown
* FAQ
* Standard

---

## 📚 Source Citation & Traceability

Retrieved chunks retain document metadata so generated answers can be traced back to their source.

```text
Document
   ↓
Page
   ↓
Chunk
   ↓
Retrieved Context
   ↓
LLM Response
   ↓
Citation
```

This improves answer transparency and allows users to verify information against the original source.

---

## 💾 Lightweight Persistence

The application also supports an **In-Memory File Database with `db.json` persistence** for lightweight deployments and development environments.

```text
Application
     ↓
In-Memory Data Layer
     ↓
db.json
     ↓
Persistent Local State
```

This provides simple persistence without requiring a dedicated database server for basic deployments.

For larger production deployments, the architecture supports migration toward PostgreSQL-based persistence.

---

## 🏗️ System Architecture

<img width="3076" height="813" alt="mermaid-diagram (3)" src="https://github.com/user-attachments/assets/8cd103ef-5f13-4f19-8b4b-44a43de72eb2" />

## Architecture Overview

<img width="8445" height="3110" alt="mermaid-diagram (2)" src="https://github.com/user-attachments/assets/5f7c2bef-7777-4e74-9450-436aa4915746" />

---

## 🔐 User Authentication

<img width="1792" height="845" alt="image" src="https://github.com/user-attachments/assets/56e0b19b-a696-4778-9289-11e802604c88" />

<img width="1852" height="845" alt="image" src="https://github.com/user-attachments/assets/3211460c-6251-41c0-adaf-43571f27b0b2" />

<img width="1864" height="837" alt="image" src="https://github.com/user-attachments/assets/28d9d184-460c-4723-ac76-51c966672e53" />

<img width="1877" height="834" alt="image" src="https://github.com/user-attachments/assets/284869ca-ac98-4ca8-b982-ea832074c668" />

<img width="1870" height="836" alt="image" src="https://github.com/user-attachments/assets/ab64f57a-996e-4bac-a71a-7ddfe57f9eb6" />

---

## 💬 AI Chat Interface

<img width="1863" height="835" alt="image" src="https://github.com/user-attachments/assets/44e10c8a-3aff-41ea-8feb-6097b6c7ea94" />

<img width="1866" height="830" alt="image" src="https://github.com/user-attachments/assets/abe455a8-73ec-41b1-8f82-f92ccfe5406b" />

<img width="1865" height="843" alt="image" src="https://github.com/user-attachments/assets/fac53c1f-f45e-45c5-bcc5-b0801bcd1cfe" />

<img width="1868" height="829" alt="image" src="https://github.com/user-attachments/assets/681109b7-9592-46c0-ba20-0b601142436e" />

<img width="1872" height="842" alt="image" src="https://github.com/user-attachments/assets/5c54d0ee-8aa4-4e75-a4fb-4e8330f68643" />

---

## 🔄 RAG Pipeline

```text
Documents

    ↓

Document Loader

    ↓

File Validation

    ↓

Text Extraction / OCR / Multimodal Parsing

    ↓

Metadata Extraction

    ↓

Paragraph-Aware Chunking

    ↓

Embedding Generation

    ↓

Vector Database Storage

    ↓

BM25 Indexing

    ↓

User Query

    ↓

Query Expansion

    ↓

Query Embedding

    ↓

Dense Similarity Search

    ↓

BM25 Lexical Search

    ↓

Reciprocal Rank Fusion

    ↓

Top-K Relevant Chunks

    ↓

Context Builder

    ↓

Prompt Builder

    ↓

LLM

    ↓

Streaming Answer Generation

    ↓

Source Citations
```

---

## 🧱 Project Structure

```text
enterprise-rag-platform/

│

├── app/

│   ├── api/

│   │   ├── documents.py

│   │   ├── chat.py

│   │   └── health.py

│   │

│   ├── core/

│   │   ├── config.py

│   │   └── database.py

│   │

│   ├── services/

│   │   ├── document_loader.py

│   │   ├── chunking.py

│   │   ├── embeddings.py

│   │   ├── retrieval.py

│   │   ├── llm.py

│   │   └── rag_pipeline.py

│   │

│   ├── models/

│   ├── schemas/

│   └── main.py

│

├── uploads/

├── vector_store/

├── db.json

├── tests/

├── requirements.txt

└── README.md
```

---

## ⚙️ Tech Stack

### Backend

* FastAPI
* Python
* Uvicorn

### Databases

* SQLite
* PostgreSQL
* `db.json` In-Memory File Database Persistence

### Vector Databases

* Qdrant
* ChromaDB
* FAISS

### AI / ML

* Sentence Transformers
* Hugging Face Models
* Ollama
* OpenAI API
* Gemini Multimodal Processing
* Gemini Embeddings

### Document Processing

* PDF Processing
* OCR
* DOCX Processing
* Image Processing
* Multimodal Document Understanding

### Infrastructure

* Docker
* Redis
* Celery
* Nginx

---

## ✨ Enterprise Features

### AI & Retrieval

* Hybrid Search (Dense + BM25)
* Cross-Encoder Re-ranking
* Query Rewriting
* Multi-Query Retrieval
* Parent-Child Chunking
* Context Compression
* Source Citation
* Streaming Responses
* Conversation Memory
* Semantic Search
* Configurable Retrieval Pipeline
* Reciprocal Rank Fusion (RRF)
* Query Expansion

### Agentic AI

* LangGraph Agent Workflow
* Planner Agent
* Retriever Agent
* Context Builder
* Citation Generator
* AI Guardrails
* Tool Calling Ready

### Document Intelligence

* PDF Processing
* OCR Support
* Multimodal Document Parsing
* Scanned PDF Detection
* Image Document Processing
* Chart Understanding
* Diagram Understanding
* Flowchart Understanding
* Table Understanding
* Metadata Extraction
* Automatic Chunking
* Paragraph-Aware Chunking
* Embedding Generation
* Vector Indexing
* BM25 Indexing
* Document Versioning
* Source Traceability

### Enterprise Platform

* Multi-Tenant Architecture
* Role-Based Access Control (RBAC)
* Organization & Workspace Management
* User Authentication
* Audit Logging
* Prompt Management
* Knowledge Base Management

### Observability & Evaluation

* LangSmith Tracing
* RAGAS Evaluation
* Token Usage Analytics
* Latency Monitoring
* Retrieval Metrics
* Error Logging

### Infrastructure

* Docker
* Redis
* Celery
* PostgreSQL
* Qdrant
* Nginx
* FastAPI

---

## 📡 API Endpoints

### Health Check

```http
GET /health
```

### Upload Document

```http
POST /documents/upload
```

### Ask Question

```http
POST /chat/query
```

Request:

```json
{
  "question": "What is FastAPI?"
}
```

Response:

```json
{
  "answer": "FastAPI is a modern Python web framework designed for building high-performance APIs."
}
```

---

## 🚀 How It Works

1. User uploads a document.
2. The backend validates the uploaded file.
3. The document type is detected.
4. The appropriate parser extracts the content.
5. Scanned/image-only documents can use OCR or multimodal parsing.
6. Metadata such as document and page information is associated with the extracted content.
7. The text is split into paragraph-aware overlapping chunks.
8. Each chunk is converted into vector embeddings.
9. Embeddings are stored inside a vector database.
10. A BM25 lexical index is created for keyword retrieval.
11. The user's query is expanded when required.
12. The query is converted into an embedding.
13. Dense similarity search retrieves semantically relevant chunks.
14. BM25 retrieves keyword-relevant chunks.
15. Reciprocal Rank Fusion combines both retrieval results.
16. The highest-ranked chunks are selected as context.
17. Retrieved context is combined with the user question.
18. The LLM generates a grounded answer.
19. The response can be streamed through SSE.
20. Source citations map the answer back to the original document content.

---

## 📈 Learning Outcomes

This project demonstrates practical experience with:

* Retrieval-Augmented Generation (RAG)
* FastAPI Backend Development
* Semantic Search
* Hybrid Search
* BM25
* Reciprocal Rank Fusion
* Vector Databases
* Embedding Models
* LLM Integration
* Multimodal AI
* OCR Pipelines
* Document Intelligence
* API Design
* Scalable System Architecture
* Production-Level Project Structure

---

## 🛠️ Installation

### Clone Repository

```bash
git clone <repository-url>

cd enterprise-rag-platform
```

### Create Virtual Environment

```bash
python -m venv .venv
```

### Activate Environment

```bash
# Windows

.venv\Scripts\activate

# Linux / Mac

source .venv/bin/activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Run Server

```bash
uvicorn app.main:app --reload
```

### Open API Docs

```text
http://127.0.0.1:8000/docs
```

---

## 🎯 Future Roadmap

### Phase 1

* FastAPI Setup
* Document Upload

### Phase 2

* Chunking Pipeline
* Embedding Generation
* Document Intelligence
* OCR / Multimodal Parsing

### Phase 3

* Vector Database Integration
* BM25 Indexing
* Hybrid Retrieval

### Phase 4

* Retrieval Layer
* RRF
* Query Expansion
* Re-ranking

### Phase 5

* LLM Integration
* Streaming Responses
* Source Citations
* Conversation Memory

### Phase 6

* Production Deployment
* Monitoring
* Evaluation
* Performance Optimization

### Phase 7

* Enterprise Features
* Multi-Tenant Architecture
* Advanced AI Guardrails
* Agentic AI Workflows

---

## 🎓 Why This Project?

This project showcases skills in:

* Backend Engineering
* AI Application Development
* Retrieval Systems
* Vector Search
* Hybrid Search
* Document Intelligence
* Multimodal AI
* FastAPI
* System Design
* LLM Applications
* Production Architecture

---

## 👨‍💻 Author

**Rohit Kumar**

🎓 Computer Science Engineering Student

💻 Backend Developer

⚡ FastAPI Enthusiast

🤖 AI/ML Explorer

🚀 Building Enterprise RAG Systems
