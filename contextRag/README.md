# 🚀 Enterprise RAG Platform

An enterprise-grade Retrieval-Augmented Generation (RAG) application built with FastAPI that enables users to upload documents, perform semantic search, and generate context-aware answers using Large Language Models (LLMs).

---

## 📌 About the Project

Traditional LLMs are limited to their training data and may generate hallucinated or outdated responses. This project solves that problem by combining document retrieval with LLM generation.

The system allows users to upload documents, converts them into vector embeddings, stores them in a vector database, retrieves relevant context for a query, and generates accurate answers grounded in the uploaded documents.

---

## 🎯 Project Goals

- Build a production-ready RAG platform
- Reduce LLM hallucinations through retrieval
- Enable document-based question answering
- Implement semantic search using vector embeddings
- Learn industry-standard backend architecture
- Explore FastAPI, Vector Databases, and LLM integration

---

## 🏗️ System Architecture

<img width="3076" height="813" alt="mermaid-diagram (3)" src="https://github.com/user-attachments/assets/8cd103ef-5f13-4f19-8b4b-44a43de72eb2" />


## Architecture Overview
<img width="8445" height="3110" alt="mermaid-diagram (2)" src="https://github.com/user-attachments/assets/5f7c2bef-7777-4e74-9450-436aa4915746" />


---
## 🔐 User Authentication
<img width="1217" height="847" alt="image" src="https://github.com/user-attachments/assets/2c581c02-5559-4055-a923-1369d8440418" />


<img width="1140" height="735" alt="image" src="https://github.com/user-attachments/assets/c2c6f189-7f26-48bd-9e2e-945a18333480" />

<img width="1862" height="909" alt="image" src="https://github.com/user-attachments/assets/f1418c86-0d2c-45cb-b2f9-bf52586c59b7" />

<img width="1893" height="917" alt="image" src="https://github.com/user-attachments/assets/429e2037-7dac-4bde-9fa1-49fc330c2107" />

<img width="1885" height="917" alt="image" src="https://github.com/user-attachments/assets/43f32a06-c78d-49a3-b003-85cccfb2c486" />


## 💬 AI Chat Interface
<img width="1874" height="907" alt="image" src="https://github.com/user-attachments/assets/507dbaac-3523-4ddd-bcd4-61c368fdb212" />


## 🔄 RAG Pipeline

```text
Documents
    ↓
Document Loader
    ↓
Text Extraction
    ↓
Chunking
    ↓
Embedding Generation
    ↓
Vector Database Storage
    ↓
User Query
    ↓
Query Embedding
    ↓
Similarity Search
    ↓
Top-K Relevant Chunks
    ↓
Prompt Builder
    ↓
LLM
    ↓
Answer Generation
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
├── tests/
├── requirements.txt
└── README.md
```

---

## ⚙️ Tech Stack

### Backend
- FastAPI
- Python
- Uvicorn

### Databases
- SQLite
- PostgreSQL

### Vector Databases
- Qdrant
- ChromaDB
- FAISS

### AI / ML
- Sentence Transformers
- Hugging Face Models
- Ollama
- OpenAI API

### Infrastructure
- Docker
- Redis
- Nginx

---

## ✨ Features

### Current Features
- Document Upload API
- PDF Processing
- Text Chunking
- Embedding Generation
- Vector Storage
- Semantic Search
- Context-Aware Question Answering
- REST APIs
- Swagger Documentation

### Planned Features
- User Authentication
- Multi-Tenant Architecture
- Chat History
- Conversation Memory
- Hybrid Search
- Reranking
- Redis Caching
- Docker Deployment
- Kubernetes Deployment

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
2. The backend extracts text from the document.
3. The text is split into chunks.
4. Each chunk is converted into vector embeddings.
5. Embeddings are stored inside a vector database.
6. The user's query is converted into an embedding.
7. Similarity search retrieves the most relevant chunks.
8. Retrieved context is combined with the user question.
9. The LLM generates a grounded and accurate answer.

---

## 📈 Learning Outcomes

This project demonstrates practical experience with:

- Retrieval-Augmented Generation (RAG)
- FastAPI Backend Development
- Semantic Search
- Vector Databases
- Embedding Models
- LLM Integration
- API Design
- Scalable System Architecture
- Production-Level Project Structure

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
- FastAPI Setup
- Document Upload

### Phase 2
- Chunking Pipeline
- Embedding Generation

### Phase 3
- Vector Database Integration

### Phase 4
- Retrieval Layer

### Phase 5
- LLM Integration

### Phase 6
- Production Deployment

### Phase 7
- Enterprise Features

---

## 🎓 Why This Project?

This project showcases skills in:

- Backend Engineering
- AI Application Development
- Retrieval Systems
- Vector Search
- FastAPI
- System Design
- LLM Applications
- Production Architecture

---

## 👨‍💻 Author

**Rohit Kumar**

🎓 Computer Science Engineering Student  
💻 Backend Developer  
⚡ FastAPI Enthusiast  
🤖 AI/ML Explorer  
🚀 Building Enterprise RAG Systems
