
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

