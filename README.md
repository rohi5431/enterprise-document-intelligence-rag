## 🚀 ContextRAG — Enterprise Document Intelligence & RAG Platform

ContextRAG is an AI-powered document intelligence platform that enables users to extract knowledge from documents, images, and online information through natural language queries. Built with FastAPI, React, Qdrant, and Large Language Models (LLMs), it combines Retrieval-Augmented Generation (RAG), Optical Character Recognition (OCR), semantic search, and context-aware generation to deliver relevant, source-grounded answers.

The platform processes text-based and scanned documents, extracts meaningful information from images, retrieves relevant context from indexed knowledge sources, and generates answers based on the available evidence. It can also integrate internet-based information retrieval to answer questions using relevant online content.

### ✨ Key Highlights

-  **Multi-Format Document Intelligence:** Upload and process supported documents, including PDFs and text-based files.
-  **Image Understanding & OCR:** Extract readable text from scanned documents and images using OCR.
-  **Internet-Based Information Retrieval:** Retrieve relevant online information to answer questions beyond uploaded documents.
-  **Context-Aware RAG Pipeline:** Combine document retrieval and LLM generation to produce evidence-grounded responses.
-  **Semantic Search:** Find relevant information using vector embeddings and Qdrant.
-  **Conversational AI:** Maintain contextual conversations with multi-session chat and conversation memory.
-  **Source Citations:** Provide references to retrieved document passages or online sources where supported.
-  **Streaming Responses:** Display generated answers incrementally for a responsive, interactive experience.
-  **Authentication & Access Control:** Protect application endpoints through authentication.
-  **Modular Backend Architecture:** Use FastAPI, PostgreSQL, Redis, and Celery to organize APIs, data persistence, caching, and background processing.

---

## 🌐 Live Demo

**🔗 Live Application v1:**  
https://enterprise-rag-application-3.onrender.com

**🔗 Live Application v2:**  
https://enterprise-document-intelligence-rag-6.onrender.com


**🔗 Final Live Application:**  
https://enterprise-document-intelligence-rag-1-lw2p.onrender.com

## 🎯 Project Goals



- Build a production-ready RAG platform

- Reduce LLM hallucinations through retrieval

- Enable document-based question answering

- Implement semantic search using vector embeddings

- Learn industry-standard backend architecture

- Explore FastAPI, Vector Databases, and LLM integration



---

## 🔒 Security Features



- JWT Authentication

- OAuth 2.0

- Role-Based Access Control (RBAC)

- Prompt Injection Detection

- Jailbreak Detection

- PII Detection

- Secure File Upload Validation

- API Rate Limiting

- Audit Logs

- AES-256 Encryption

## 📊 Enterprise Admin Dashboard



---



The platform includes a centralized admin dashboard for monitoring system health, AI usage, and enterprise operations.



### Dashboard Modules



- User Management

- Organization Management

- Workspace Management

- Document Management

- Knowledge Base

- Prompt Management

- AI Playground

- Model Management

- Analytics Dashboard

- Security Center

- Audit Logs

- Background Job Monitoring

- Token Usage Analytics

- Cost Analytics

- System Monitoring

- API Management

- Settings Management



---



## 📈 AI Evaluation



The RAG pipeline is continuously evaluated using industry-standard metrics.



Supported Metrics



- Faithfulness

- Context Precision

- Context Recall

- Answer Relevancy

- Retrieval Accuracy

- Hallucination Detection



---



## 📡 Monitoring & Observability



The platform provides enterprise-grade monitoring.



- LangSmith Tracing

- Request Logging

- Token Tracking

- Prompt Tracking

- Response Latency

- Retrieval Time

- Background Job Monitoring

- Error Monitoring



---



## 🚀 Production Features



- Docker Deployment

- Redis Caching

- Celery Background Workers

- Nginx Reverse Proxy

- Streaming Responses

- Horizontal Scaling Ready

- Modular Service Architecture

- Repository Pattern

- Dependency Injection

- Structured Logging



---



## 🎯 Enterprise Capabilities



- Enterprise Document Intelligence

- Production RAG Pipeline

- Agentic AI Workflow

- Hybrid Semantic Search

- AI Guardrails

- Enterprise Authentication

- Multi-Tenant Architecture

- Knowledge Base Management

- Enterprise Monitoring

- AI Evaluation Framework

- Prompt Management

- Production Deployment



---

## 📄 Document AI Ingestion Pipeline

```text
           DOCUMENT
              │
              ▼
      Document Detection
              │
      ┌───────┴────────┐
      │                │
   Digital           Scanned
      │                │
   PyMuPDF          PyMuPDF
      │             render image
      │                │
      │             OpenCV
      │                │
      │           PaddleOCR
      │                │
      └───────┬────────┘
              ▼
        Layout Analysis
              │
  ┌───────────┼────────────┐
  ▼           ▼            ▼
Text        Tables       Figures
  │           │            │
  └───────────┼────────────┘
              ▼
        Reading Order
              │
              ▼
    Semantic / Layout
         Chunking
              │
              ▼
         Embeddings
              │
              ▼
           Qdrant
              │
              ▼
        RAG Retrieval
              │
              ▼
             LLM
              │
              ▼
       Answer + Citations
```


## 🏗️ System Architecture



<img width="3076" height="813" alt="mermaid-diagram (3)" src="https://github.com/user-attachments/assets/8cd103ef-5f13-4f19-8b4b-44a43de72eb2" />





## Architecture Overview

<img width="8445" height="3110" alt="mermaid-diagram (2)" src="https://github.com/user-attachments/assets/5f7c2bef-7777-4e74-9450-436aa4915746" />





---

## 🔐 User Authentication

<img width="1792" height="845" alt="image" src="https://github.com/user-attachments/assets/56e0b19b-a696-4778-9289-11e802604c88" />



<img width="1883" height="924" alt="image" src="https://github.com/user-attachments/assets/a7892af6-31bf-4ad5-a214-d0454ca20556" />


<img width="1905" height="920" alt="image" src="https://github.com/user-attachments/assets/a59378e1-d14b-43a3-95bf-fc59bbff95de" />


<img width="1901" height="918" alt="image" src="https://github.com/user-attachments/assets/b6a4299a-b0da-4213-bc3d-3debec242661" />

<img width="1905" height="918" alt="image" src="https://github.com/user-attachments/assets/5eec4c82-e9a8-481f-a87e-5d03dd874faf" />



<img width="1877" height="834" alt="image" src="https://github.com/user-attachments/assets/284869ca-ac98-4ca8-b982-ea832074c668" />



<img width="1870" height="836" alt="image" src="https://github.com/user-attachments/assets/ab64f57a-996e-4bac-a71a-7ddfe57f9eb6" />





## 💬 AI Chat Interface

<img width="1863" height="835" alt="image" src="https://github.com/user-attachments/assets/44e10c8a-3aff-41ea-8feb-6097b6c7ea94" />



<img width="1866" height="830" alt="image" src="https://github.com/user-attachments/assets/abe455a8-73ec-41b1-8f82-f92ccfe5406b" />



<img width="1865" height="843" alt="image" src="https://github.com/user-attachments/assets/fac53c1f-f45e-45c5-bcc5-b0801bcd1cfe" />


<img width="1904" height="920" alt="image" src="https://github.com/user-attachments/assets/8314ed06-2752-4180-a152-5178c1020c02" />



<img width="1909" height="927" alt="image" src="https://github.com/user-attachments/assets/fb2a4a0e-1474-4318-b36e-551e1339aa83" />










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



## ✨ Enterprise Features



### AI & Retrieval

- Hybrid Search (Dense + BM25)

- Cross-Encoder Re-ranking

- Query Rewriting

- Multi-Query Retrieval

- Parent-Child Chunking

- Context Compression

- Source Citation

- Streaming Responses

- Conversation Memory

- Semantic Search

- Configurable Retrieval Pipeline



### Agentic AI

- LangGraph Agent Workflow

- Planner Agent

- Retriever Agent

- Context Builder

- Citation Generator

- AI Guardrails

- Tool Calling Ready



### Document Intelligence

- PDF Processing

- OCR Support

- Metadata Extraction

- Automatic Chunking

- Embedding Generation

- Vector Indexing

- Document Versioning



### Enterprise Platform

- Multi-Tenant Architecture

- Role-Based Access Control (RBAC)

- Organization & Workspace Management

- User Authentication

- Audit Logging

- Prompt Management

- Knowledge Base Management



### Observability & Evaluation

- LangSmith Tracing

- RAGAS Evaluation

- Token Usage Analytics

- Latency Monitoring

- Retrieval Metrics

- Error Logging



### Infrastructure

- Docker

- Redis

- Celery

- PostgreSQL

- Qdrant

- Nginx

- FastAPI



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

### 📥 Document Ingestion

1. **User uploads a document.**
2. **Document Detection** identifies whether each PDF page is digital or scanned.
3. **Digital pages** are processed using **PyMuPDF**.
4. **Scanned pages** are rendered using PyMuPDF, preprocessed with **OpenCV**, and processed through **PaddleOCR**.
5. **Layout Analysis** identifies text, tables, figures, and other document structures.
6. **Reading Order** reconstructs the logical flow of the document.
7. **Semantic / Layout-Aware Chunking** creates meaningful chunks while preserving document structure.
8. **Embeddings** are generated for the processed chunks.
9. **Qdrant** stores the generated embeddings and document metadata.

### 🔍 Query & Retrieval

10. **User submits a question** through the AI chat interface.
11. The query is converted into an **embedding**.
12. **Semantic similarity search** retrieves the most relevant document chunks from Qdrant.
13. **Hybrid retrieval / ranking** selects the most relevant context.
14. Retrieved chunks and metadata are passed to the **RAG context builder**.
15. The context is combined with the user's question to construct the LLM prompt.

### 🤖 Generation & Response

16. The **LLM** generates an answer grounded in the retrieved document context.
17. The response is **streamed to the user** when streaming is enabled.
18. **Source citations** are returned with the answer so the user can trace the information back to the source document.


---



## 📈 Learning Outcomes

This project demonstrates practical experience with:

* Retrieval-Augmented Generation (RAG)
* FastAPI Backend Development
* Document AI & Intelligent Document Ingestion
* Digital & Scanned PDF Processing
* OCR with PaddleOCR
* Image Preprocessing with OpenCV
* PDF Processing with PyMuPDF
* Document Layout Analysis
* Reading Order Detection
* Layout-Aware & Semantic Chunking
* Embedding Generation
* Vector Databases & Qdrant
* Semantic & Hybrid Search
* LLM Integration
* Context-Grounded Generation
* Source Citations & Traceability
* Streaming AI Responses
* API Design
* Scalable System Architecture
* Production-Level RAG Pipeline


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
=======
>>>>>>> dd7ce3b (Add Streaming Response Like GPT)
