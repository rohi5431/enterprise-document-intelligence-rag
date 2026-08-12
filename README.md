# 🚀 Enterprise-Grade Full-Stack RAG Platform

An enterprise-grade, fully functional **Retrieval-Augmented Generation (RAG)** platform designed to ingest visual slides, complex PDFs, Word files, and textual documents to deliver instant, cited, and fully verifiable AI-driven insights. 

Featuring a modern React client with Tailwind CSS, an Express server, an intelligent RAG engine, hybrid vector search with BM25 Lexical search, Reciprocal Rank Fusion (RRF), real-time SSE streaming, user role structures, and rich diagnostic analytics.

---

## 🏗️ System Architecture & Workflow

```
   ┌────────────────────────────────────────────────────────┐
   │                    DOCUMENT INGESTION                  │
   └───────────────────────────┬────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │   Extract Raw Text / OCR / Multimodal Visual Parsing   │
   │  (pdf-parse / Gemini Multimodal for Scanned PDFs & JPG)│
   └───────────────────────────┬────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │              Smart Paragraph & Overlap Chunker         │
   │           (1000 Char Limit / 150 Char Overlap)         │
   └───────────────────────────┬────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │            Vector Embeddings Generation                │
   │          (gemini-embedding-2-preview)                  │
   └───────────────────────────┬────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │               Hybrid Retrieval Engine                  │
   │       (Cosine Vector Similarity + BM25 Lexical)        │
   └───────────────────────────┬────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │               Reciprocal Rank Fusion (RRF)             │
   │            (Combines Dense & Sparse Ranks)             │
   └───────────────────────────┬────────────────────────────┘
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │                Real-time SSE Generator                 │
   │     (Gemini-3.5-Flash Streaming / Custom Styles)       │
   └────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

### 📂 Sophisticated Document Ingestion & Multimodal OCR
* **Universal Parsing Engine:** Supports `.txt`, `.pdf`, `.docx`, `.png`, `.jpg`, and `.jpeg`.
* **Visual Document Parsing:** Instantly parses slides and image documents using Gemini's multimodal vision system to transcribe charts, flowcharts, structural designs, and complex diagrams into text.
* **Hybrid OCR & Fallback:** Utilizes a standard PDF parser and automatically triggers Gemini's multimodal system for scanned or image-only PDFs.
* **Context-Preserving Chunking:** Paragraph-aware chunking with a 1000-character maximum size and 150-character sliding overlap to maintain lexical continuity.

### 🔍 Advanced Hybrid Search & Retrieval
* **Dual-Path Ingestion:** Computes dense vector representations via the modern `@google/genai` (`gemini-embedding-2-preview` model) while constructing a BM25 TF-IDF sparse index.
* **Reciprocal Rank Fusion (RRF):** Blends the mathematical precision of dense semantic searches with keyword lexical matching to produce highly resilient search results.
* **Query Expansion:** Intelligently expands simple user queries into diverse phrasing variants under the hood using Gemini before querying the vector space.

### 💬 Immersive Chat & Real-Time Streaming
* **Server-Sent Events (SSE):** Renders answers instantly with low latency, chunk by chunk.
* **Interactive Citations:** Highlighted source references map directly to inline PDF snippets, slide previews, and metadata logs.
* **Flexible Personas & Styles:** Supports on-the-fly style rendering, including *Executive Brief, Analytical Deep Dive, Bulleted Breakdown, FAQ, and Standard*.
* **Microphone Voice Input:** Seamlessly input queries via high-fidelity, native speech-to-text integration.

### 📊 Enterprise Analytics & System Evaluation
* **Usage & Performance Metrics:** Monitor request counts, document capacities, and average processing latency over time.
* **Quality Assurance Benchmarks:** Tracks critical LLM parameters:
  * **Recall@K** & **MRR** (Mean Reciprocal Rank)
  * **Faithfulness** (Hallucination tracking)
  * **Answer Relevancy** & **Context Precision**
* **User Feedback Loop:** Direct rating mechanism to continually refine the retrieved knowledge pipeline.

---

## 🛠️ Tech Stack

* **Frontend:**
  * **React 19 & Vite 6** (Single Page Application SPA)
  * **Tailwind CSS** (Modern styling and responsive grid utility design)
  * **Lucide React** (Consistent vector icon layout)
  * **Framer Motion** (Staggered list cards, interactive menus, and layout state shifts)
  * **Recharts** (Visual data reporting, analytics trends, and latency graphs)
* **Backend:**
  * **Node.js & Express**
  * **TypeScript & Esbuild** (Production bundling pipeline compile)
  * **Multer** (Streamlined in-memory file buffer processing)
  * **pdf-parse** (Fast, localized standard document conversion)
  * **@google/genai SDK** (State-of-the-art official Gemini client SDK)
  * **In-Memory File Database** (`db.json` persistence)

---

## 🚀 Getting Started

### 📋 Prerequisites
* **Node.js** (v18.0 or higher recommended)
* **Google Gemini API Key** (Required for visual transcription, embeddings, and chat generation)

### 🔧 Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/your-username/enterprise-rag-platform.git
   cd enterprise-rag-platform
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory (based on `.env.example`):
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3000
   ```

### 🏃 Running the Application

* **Development Mode:**
  Runs the Express server alongside the Vite dev middleware with automatic hot reloading.
  ```bash
  npm run dev
  ```

* **Production Build:**
  Compiles the frontend assets to static files and compiles the backend TypeScript server into a high-performance, single-bundle CommonJS file (`dist/server.cjs`) using `esbuild`.
  ```bash
  npm run build
  ```

* **Start Production Server:**
  Launches the production environment.
  ```bash
  npm run start
  ```

---

## 📁 Repository Structure

```
├── .env.example              # Template for environment variables
├── .gitignore                # Production artifact exclusions
├── README.md                 # Project documentation
├── db.json                   # In-memory database persistence file
├── index.html                # Vite entry page
├── metadata.json             # Applet runtime capabilities configuration
├── package.json              # App scripts and core packages
├── server.ts                 # Full-stack Express server and RAG engine
├── src/                      # Frontend Application Context
│   ├── App.tsx               # Main container, routing, and UI layout
│   ├── index.css             # Tailwind base styles and theme definitions
│   ├── main.tsx              # React entry mount point
│   ├── types.ts              # Shareable schema TypeScript declarations
│   ├── api/                  # Axios/Fetch API request proxy wrappers
│   ├── components/           # Extracted React Components
│   │   ├── AuthPanel.tsx     # Sign-in/registration panels
│   │   ├── ChatPanel.tsx     # Message composer, streaming controls, voice input
│   │   ├── SessionSidebar.tsx# Workspace navigation dropdown & session history
│   └── pages/                # High-level workspaces
│       ├── DocumentPage.tsx  # Multi-document upload dashboard & file table
│       ├── SearchPage.tsx    # Live hybrid vector & BM25 search workspace
│       ├── AdminPage.tsx     # Enterprise usage reporting & analytics
│       ├── EvalPage.tsx      # RAG evaluation, quality logging, and testing
│       └── SettingsPage.tsx  # Workspace preferences & LLM model configuration
```

---

## 🔒 Security & Privacy

* **Key Safety:** The **Gemini API Key** is retained strictly server-side (`server.ts`) and is never sent or exposed to the browser client.
* **Sandboxed Ingestion:** Files are handled in-memory using `multer.memoryStorage()`, ensuring no unauthenticated files are stored persistently in arbitrary directories.
* **Local Sandboxing:** User profiles and document chunks are isolated securely by user ID, meaning document search queries cannot leak across unauthorized organizational tiers.

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Crafted with precision using Google AI Studio Build.*
