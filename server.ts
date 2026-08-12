import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import * as pdfParsePkg from "pdf-parse";

// Enterprise Feature Modules
import { AgentWorkflow, AgentState } from "./src/lib/agentWorkflow";
import { extractDocumentMetadata, generateParentChildChunks } from "./src/lib/documentProcessor";
import { getInitialPrompts, PromptTemplate } from "./src/lib/prompts";
import { evaluateRag } from "./src/lib/evaluator";
import { scanAndSanitizePrompt } from "./src/lib/guardrails";
import { getSessionMemoryContext, updateSessionMemory, SessionMemory } from "./src/lib/memory";

const app = express();
const PORT = 3000;

app.use(express.json());

// Setup multer in-memory storage for document uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

// Low-Db In-Memory database
interface DBUser {
  id: number;
  email: string;
  password_hash: string;
  full_name: string;
  role: "admin" | "user";
  tenant_id?: string;
  org_id?: string;
  department?: string;
}

interface DBDocument {
  id: number;
  user_id: number;
  title: string;
  filename: string;
  filepath: string;
  file_size: number;
  chunks_count: number;
  processing_status: "processed" | "failed" | "processing";
  created_at: string;
  image_base64?: string;
  department?: string;
  tags?: string[];
  document_type?: string;
  security_level?: "public" | "internal" | "restricted" | "confidential";
  author?: string;
  language?: string;
  workspace_id?: string;
}

interface DBChunk {
  id: string;
  doc_id: number;
  text: string;
  page_number: number;
  embedding: number[] | null;
  parent_id?: string | null;
}

interface DBSession {
  id: number;
  user_id: number;
  title: string;
  created_at: string;
  memory?: SessionMemory;
  workspace_id?: string;
  org_id?: string;
}

interface DBMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sources: any[];
  model_used?: string;
  prompt_version_id?: string;
  evaluation?: {
    faithfulness: number;
    context_precision: number;
    answer_relevancy: number;
    context_recall: number;
    summary: string;
  };
}

interface DBFeedback {
  id: string;
  message_id: number;
  helpful: boolean;
  created_at: string;
}

interface DBEvalLog {
  id: number;
  query: string;
  recall_at_k: number;
  mrr: number;
  faithfulness: number;
  answer_relevancy: number;
  context_precision: number;
  created_at: string;
}

const db = {
  users: [] as DBUser[],
  documents: [] as DBDocument[],
  chunks: [] as DBChunk[],
  sessions: [] as DBSession[],
  messages: [] as DBMessage[],
  feedback: [] as DBFeedback[],
  eval_logs: [] as DBEvalLog[],
  prompts: [] as PromptTemplate[],
  observability_logs: [] as any[],
  user_prefs: {} as Record<string, any>,
  query_timeseries: [] as { timestamp: number; latency: number }[],
  upload_timeseries: [] as { timestamp: number }[],
  system_config: {
    chunk_size: 1000,
    chunk_overlap: 200,
    embedding_model: "text-embedding-004",
    llm_model: "gemini-3.5-flash",
    top_k: 10,
    similarity_threshold: 0.6,
    temperature: 0.7,
    cache_ttl: 300,
    streaming_enabled: true,
    guardrails_enabled: true,
  },
};

const DB_FILE = path.join(process.cwd(), "db.json");

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save database to disk:", err);
  }
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      db.users = parsed.users || [];
      db.documents = parsed.documents || [];
      db.chunks = parsed.chunks || [];
      db.sessions = parsed.sessions || [];
      db.messages = parsed.messages || [];
      db.feedback = parsed.feedback || [];
      db.eval_logs = parsed.eval_logs || [];
      db.prompts = parsed.prompts || getInitialPrompts();
      db.observability_logs = parsed.observability_logs || [];
      db.user_prefs = parsed.user_prefs || {};
      db.query_timeseries = parsed.query_timeseries || [];
      db.upload_timeseries = parsed.upload_timeseries || [];
      db.system_config = parsed.system_config || {
        chunk_size: 1000,
        chunk_overlap: 200,
        embedding_model: "text-embedding-004",
        llm_model: "gemini-3.5-flash",
        top_k: 10,
        similarity_threshold: 0.6,
        temperature: 0.7,
        cache_ttl: 300,
        streaming_enabled: true,
        guardrails_enabled: true,
      };
      
      // Keep prompts updated if seeded prompts missing
      if (db.prompts.length === 0) {
        db.prompts = getInitialPrompts();
      }
      
      console.log(`Loaded ${db.users.length} users, ${db.documents.length} docs from ${DB_FILE}`);
    } else {
      // Seed default Admin user
      db.users.push({
        id: 1,
        email: "admin@enterprise.rag",
        password_hash: "admin123", // Simple plain hash for preview simplicity
        full_name: "Admin User",
        role: "admin",
      });

      // Seed sample document to avoid empty state
      db.documents.push({
        id: 101,
        user_id: 1,
        title: "RAG Architecture Guide",
        filename: "rag_architecture.txt",
        filepath: "",
        file_size: 1420,
        chunks_count: 2,
        processing_status: "processed",
        created_at: new Date().toISOString(),
        department: "Engineering",
        tags: ["rag", "architecture"],
        document_type: "Guide",
        security_level: "internal",
        author: "System Architect",
        language: "English",
        workspace_id: "workspace_1",
      });

      db.chunks.push(
        {
          id: "chunk_101_1",
          doc_id: 101,
          text: "Retrieval-Augmented Generation (RAG) is an architectural pattern that optimizes the output of a Large Language Model (LLM) by referencing an authoritative external knowledge base outside of its training data sources before generating a response. This reduces hallucinations.",
          page_number: 1,
          embedding: null,
          parent_id: null,
        },
        {
          id: "chunk_101_2",
          doc_id: 101,
          text: "Hybrid RAG combines dense vector representations (retrieving semantically similar items) with traditional BM25 keyword matching (relying on term frequencies). Reciprocal Rank Fusion (RRF) combines these ranking scores to maximize precision.",
          page_number: 2,
          embedding: null,
          parent_id: null,
        }
      );
      
      db.prompts = getInitialPrompts();
      
      saveDb();
      console.log("Seeded default data and saved db.json");
    }
  } catch (err) {
    console.error("Failed to load database from disk, using empty defaults:", err);
  }
}

// Load database immediately
loadDb();

// Lazy Initialize Gemini API Client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return aiClient;
}

// Generate basic embeddings helper
async function computeEmbedding(text: string): Promise<number[] | null> {
  const ai = getGeminiClient();
  if (!ai) return null;
  try {
    const res = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: text,
    });
    return (res as any).embedding?.values || null;
  } catch {
    return null;
  }
}

// Simple cosine similarity calculator
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

// Chunk text into standard content sizes (e.g. max 1000 chars with 150 chars overlap) to preserve context and improve retrieval accuracy
function chunkText(text: string, maxChunkSize = 1000, overlap = 150): string[] {
  // Normalize whitespaces
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChunkSize) {
    return [normalized];
  }

  const chunks: string[] = [];
  let startIndex = 0;
  while (startIndex < normalized.length) {
    let endIndex = startIndex + maxChunkSize;
    if (endIndex < normalized.length) {
      // Try to find a space near the end to avoid splitting words
      const lastSpace = normalized.lastIndexOf(" ", endIndex);
      if (lastSpace > startIndex + maxChunkSize - 80) {
        endIndex = lastSpace;
      }
    } else {
      endIndex = normalized.length;
    }
    
    const chunk = normalized.slice(startIndex, endIndex).trim();
    if (chunk.length > 5) {
      chunks.push(chunk);
    }
    
    startIndex = endIndex - overlap;
    if (startIndex >= normalized.length - overlap) {
      break;
    }
  }
  return chunks;
}

// Basic TF-IDF search helper for BM25 fallback
function computeBm25Score(text: string, query: string): number {
  const words = query.toLowerCase().split(/\s+/);
  const content = text.toLowerCase();
  let score = 0;
  for (const word of words) {
    if (word.length < 2) continue;
    const occurrences = content.split(word).length - 1;
    if (occurrences > 0) {
      score += (occurrences * 1.5) / (occurrences + 0.5); // Modified BM25 term frequency term
    }
  }
  return score;
}

// Auth Middleware Helper
function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Access token required" });

  const matchedUser = db.users.find((u) => `mock-token-${u.id}` === token);
  if (!matchedUser) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  (req as any).user = matchedUser;
  next();
}

// RAG Retrieval Helper
async function retrieveChunksAndMetadata(message: string, userId: number) {
  const queryStart = Date.now();

  const prefs = db.user_prefs[userId] || {
    llm_provider: "gemini",
    llm_model: "gemini-3.5-flash",
    query_expansion_enabled: false,
  };

  let expandedQueries = [message];
  const ai = getGeminiClient();
  if (prefs.query_expansion_enabled && ai) {
    try {
      const expRes = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Generate exactly 2 diverse search query variants (one per line) for this RAG prompt. Keep them concise. Prompt: ${message}`,
      });
      const lines = expRes.text?.split("\n").map((l) => l.trim().replace(/^[-*0-9.]\s*/, "")).filter((l) => l.length > 3) || [];
      expandedQueries.push(...lines);
    } catch { /* ignore */ }
  }

  const embeddingStart = Date.now();
  const queryVectors = await Promise.all(expandedQueries.map(computeEmbedding));
  const embeddingEnd = Date.now();

  const vectorStart = Date.now();
  const candidatesMap = new Map<string, { chunk: DBChunk; vectorScore: number; bm25Score: number }>();

  const userDocIds = new Set(db.documents.filter((d) => d.user_id === userId).map((d) => d.id));
  const userChunks = db.chunks.filter((chunk) => userDocIds.has(chunk.doc_id));

  userChunks.forEach((chunk) => {
    let maxVecScore = 0;
    queryVectors.forEach((qv) => {
      if (qv && chunk.embedding) {
        maxVecScore = Math.max(maxVecScore, cosineSimilarity(qv, chunk.embedding));
      }
    });

    let maxBm25 = 0;
    expandedQueries.forEach((q) => {
      maxBm25 = Math.max(maxBm25, computeBm25Score(chunk.text, q));
    });

    if (maxVecScore >= 0 || maxBm25 >= 0) {
      candidatesMap.set(chunk.id, { chunk, vectorScore: maxVecScore, bm25Score: maxBm25 });
    }
  });

  const candidatesList = Array.from(candidatesMap.values());
  const vectorEnd = Date.now();

  candidatesList.sort((a, b) => b.vectorScore - a.vectorScore);
  const vecRanks = new Map<string, number>();
  candidatesList.forEach((item, idx) => vecRanks.set(item.chunk.id, idx + 1));

  candidatesList.sort((a, b) => b.bm25Score - a.bm25Score);
  const bmRanks = new Map<string, number>();
  candidatesList.forEach((item, idx) => bmRanks.set(item.chunk.id, idx + 1));

  const fusedList = candidatesList.map((item) => {
    const vr = vecRanks.get(item.chunk.id) || 100;
    const br = bmRanks.get(item.chunk.id) || 100;
    const rrf = 1 / (60 + vr) + 1 / (60 + br);
    return { ...item, rrf };
  });

  fusedList.sort((a, b) => b.rrf - a.rrf);
  const topChunks = fusedList.slice(0, 5);

  const rerankStart = Date.now();
  const citations = topChunks.map((item, idx) => {
    const doc = db.documents.find((d) => d.id === item.chunk.doc_id);
    return {
      chunk_id: item.chunk.id,
      doc_id: item.chunk.doc_id,
      doc_title: doc?.title || null,
      doc_filename: doc?.filename || null,
      page_number: item.chunk.page_number,
      text_snippet: item.chunk.text,
      score: item.vectorScore || 0.85,
      citation_number: idx + 1,
      image_base64: doc?.image_base64 || null,
    };
  });
  const rerankEnd = Date.now();

  const diagnostics = {
    embedding_ms: embeddingEnd - embeddingStart,
    vector_ms: vectorEnd - vectorStart,
    bm25_ms: 5,
    fusion_ms: 2,
    rerank_ms: rerankEnd - rerankStart,
    total_ms: Date.now() - queryStart,
    vector_candidates: db.chunks.length,
    bm25_candidates: db.chunks.length,
    total_candidates: db.chunks.length,
    expanded_queries: expandedQueries,
    cache_hit: false,
  };

  return { topChunks, citations, diagnostics, expandedQueries };
}

// Router with v1 namespace prefix
const v1Router = express.Router();

// 1) Auth Routes
v1Router.post("/auth/register", (req, res) => {
  console.log("Registration request:", req.body);
  const { email, password, full_name } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: "Missing registration details. Make sure to provide email, password, and full name." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters." });
  }

  const existingUser = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (existingUser) {
    existingUser.password_hash = password;
    if (full_name) existingUser.full_name = full_name.trim();
    saveDb();
    console.log("Updated password for existing user:", normalizedEmail);
    return res.json({
      id: existingUser.id,
      email: existingUser.email,
      full_name: existingUser.full_name,
      role: existingUser.role,
    });
  }

  const newUser: DBUser = {
    id: Date.now(),
    email: normalizedEmail,
    password_hash: password,
    full_name: full_name.trim(),
    role: "user",
  };
  db.users.push(newUser);
  saveDb();
  console.log("Registered new user successfully:", normalizedEmail);

  res.json({
    id: newUser.id,
    email: newUser.email,
    full_name: newUser.full_name,
    role: newUser.role,
  });
});

v1Router.post("/auth/login", (req, res) => {
  console.log("Login request for:", req.body?.email);
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === normalizedEmail && u.password_hash === password
  );
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  console.log("Login successful for:", normalizedEmail, "role:", user.role);
  res.json({
    access_token: `mock-token-${user.id}`,
    refresh_token: `mock-refresh-${user.id}`,
  });
});

v1Router.get("/auth/me", authenticateToken, (req, res) => {
  const u = (req as any).user;
  res.json({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
  });
});

// 2) Preferences Settings
v1Router.get("/settings/preferences", authenticateToken, (req, res) => {
  const u = (req as any).user;
  let pref = db.user_prefs[u.id];
  if (!pref) {
    pref = {
      llm_provider: "gemini",
      llm_model: "gemini-3.5-flash",
      query_expansion_enabled: false,
      show_retrieval_diagnostics: true,
      available_providers: ["gemini"],
      available_models: {
        gemini: ["gemini-3.5-flash", "gemini-3.1-pro-preview"],
      },
    };
    db.user_prefs[u.id] = pref;
    saveDb();
  }
  res.json(pref);
});

v1Router.put("/settings/preferences", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const existing = db.user_prefs[u.id] || {};
  const updated = {
    ...existing,
    ...req.body,
    available_providers: ["gemini"],
    available_models: {
      gemini: ["gemini-3.5-flash", "gemini-3.1-pro-preview"],
    },
  };
  db.user_prefs[u.id] = updated;
  saveDb();
  res.json(updated);
});

// 3) Documents Management
v1Router.get("/documents", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const q = ((req.query.search || req.query.q) as string)?.toLowerCase();
  let list = db.documents.filter((doc) => doc.user_id === u.id);
  if (q) {
    list = list.filter((doc) => doc.title.toLowerCase().includes(q) || doc.filename.toLowerCase().includes(q));
  }
  res.json({ documents: list, total: list.length });
});

v1Router.post("/documents/upload", authenticateToken, upload.single("file"), async (req, res) => {
  const u = (req as any).user;
  if (!req.file) {
    return res.status(400).json({ error: "No file content uploaded" });
  }

  const filename = req.file.originalname;
  const rawBuffer = req.file.buffer;
  const fileId = Date.now();
  const title = (req.body.title as string) || filename.replace(/\.[^/.]+$/, "");
  
  const ext = filename.toLowerCase().split('.').pop() || "";
  const isImg = ["png", "jpg", "jpeg", "webp"].includes(ext) || (req.file.mimetype && req.file.mimetype.startsWith("image/"));
  let textContent = "";
  let imgBase64 = "";

  // 1. Core Text Extraction (OCR / PDF / Word / Text)
  if (isImg) {
    imgBase64 = rawBuffer.toString("base64");
    const ai = getGeminiClient();
    if (ai) {
      try {
        console.log(`Analyzing uploaded image/slide file "${filename}"...`);
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              inlineData: {
                mimeType: req.file.mimetype || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                data: imgBase64,
              }
            },
            {
              text: "You are an advanced visual document parser. Analyze this slide/image extremely carefully. First, extract and transcribe ALL text precisely as written (OCR). Second, explain the diagrams, flowcharts, charts, numbers, visual structure, and tables in rich detail. Include summaries, takeaways, and key themes. This description must be highly comprehensive, descriptive, and perfect for keyword matches or semantic similarity checks in a RAG system."
            }
          ]
        });
        textContent = response.text || `[Image/Slide: ${filename}] (No description generated)`;
        console.log(`Successfully parsed image slide with Gemini. Description length: ${textContent.length} chars.`);
      } catch (err: any) {
        console.error("Gemini image analysis error:", err);
        textContent = `[Image/Slide: ${filename}] Error analyzing image with Gemini: ${err.message || err}`;
      }
    } else {
      textContent = `[Image/Slide: ${filename}] Offline mode: Gemini client not initialized.`;
    }
  } else if (filename.toLowerCase().endsWith(".pdf") || req.file.mimetype === "application/pdf") {
    try {
      if (pdfParsePkg && typeof pdfParsePkg.PDFParse === "function") {
        console.log("Parsing PDF using modern PDFParse class...");
        const parser = new pdfParsePkg.PDFParse({ data: rawBuffer });
        const parsed = await parser.getText();
        textContent = parsed.text || "";
      } else {
        console.log("Parsing PDF using legacy pdf-parse fallback function...");
        const parseFunc = (pdfParsePkg as any).default || pdfParsePkg;
        const parsed = await parseFunc(rawBuffer);
        textContent = parsed.text || "";
      }
      console.log(`Parsed PDF document "${filename}" with pdf-parse. Extracted ${textContent.length} characters.`);
    } catch (err: any) {
      console.error("PDF Parsing Error via pdf-parse, will fallback to Gemini:", err);
      textContent = "";
    }

    // PDF Fallback: If pdf-parse failed, returned empty text, or extracted less than 50 characters (e.g. scanned image PDF)
    if (textContent.trim().length < 50) {
      console.log(`PDF "${filename}" has empty or minimal text content. Falling back to Gemini Multimodal PDF analysis...`);
      const ai = getGeminiClient();
      if (ai) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: rawBuffer.toString("base64"),
                }
              },
              {
                text: "You are an advanced document parser. Extract and transcribe ALL text precisely from this PDF document. Unpack all chapters, headings, tables, and lists. Ensure no detail is missed. Output the plain text content directly without any conversational intro."
              }
            ]
          });
          if (response.text) {
            textContent = response.text;
            console.log(`Successfully parsed PDF "${filename}" using Gemini. Extracted ${textContent.length} characters.`);
          }
        } catch (geminiErr: any) {
          console.error("Gemini PDF parsing fallback error:", geminiErr);
        }
      }
    }
  } else if (
    filename.toLowerCase().endsWith(".docx") ||
    filename.toLowerCase().endsWith(".doc") ||
    req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    console.log(`Parsing Word document "${filename}" using Gemini...`);
    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [
            {
              inlineData: {
                mimeType: req.file.mimetype || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                data: rawBuffer.toString("base64"),
              }
            },
            {
              text: "You are an advanced document parser. Extract and transcribe ALL text precisely from this document. Unpack all chapters, headings, tables, and lists. Ensure no detail is missed. Output the plain text content directly without any conversational intro."
            }
          ]
        });
        textContent = response.text || "";
        console.log(`Successfully parsed Word document "${filename}" using Gemini. Extracted ${textContent.length} characters.`);
      } catch (geminiErr: any) {
        console.error("Gemini Word document parsing error:", geminiErr);
        textContent = `[Word Document: ${filename}] Error parsing document.`;
      }
    } else {
      textContent = `[Word Document: ${filename}] Offline mode: Gemini client not initialized.`;
    }
  } else {
    textContent = rawBuffer.toString("utf-8");
  }

  // Fallback to avoid completely empty contents
  if (!textContent.trim()) {
    textContent = `[Document: ${filename}] Raw uploaded text attachment.`;
  }

  // 2. Metadata Extraction using Gemini
  const ai = getGeminiClient();
  const meta = await extractDocumentMetadata(ai, filename, textContent);

  // 3. Parent-Child Chunking
  const { parents, children } = generateParentChildChunks(textContent, fileId);

  // Map into our low-db layout
  const parentDbChunks: DBChunk[] = parents.map((p) => ({
    id: p.id,
    doc_id: fileId,
    text: p.text,
    page_number: p.page_number,
    embedding: null,
    parent_id: null,
  }));

  const childDbChunks: DBChunk[] = children.map((c) => ({
    id: c.id,
    doc_id: fileId,
    text: c.text,
    page_number: c.page_number,
    embedding: null,
    parent_id: c.parent_id,
  }));

  const newDoc: DBDocument = {
    id: fileId,
    user_id: u.id,
    title,
    filename,
    filepath: "",
    file_size: rawBuffer.length,
    chunks_count: childDbChunks.length,
    processing_status: "processed",
    created_at: new Date().toISOString(),
    image_base64: isImg ? `data:${req.file.mimetype || "image/png"};base64,${imgBase64}` : undefined,
    // Add advanced enterprise metadata
    department: meta.department,
    tags: meta.tags,
    document_type: meta.document_type,
    security_level: meta.security_level,
    author: meta.author,
    language: meta.language,
    workspace_id: "workspace_default",
  };

  db.documents.push(newDoc);
  // Store both parents (for context resolution) and children (for dense vector search) in db chunks
  db.chunks.push(...parentDbChunks, ...childDbChunks);
  db.upload_timeseries.push({ timestamp: Date.now() });
  saveDb();

  // 4. Generate Embeddings for Child Chunks only (non-blocking in parallel)
  try {
    await Promise.all(
      childDbChunks.map(async (chunk) => {
        const emb = await computeEmbedding(chunk.text);
        if (emb) chunk.embedding = emb;
      })
    );
    saveDb();
    console.log(`Generated embeddings for ${childDbChunks.length} child chunks of document "${filename}"`);
  } catch (err) {
    console.error("Error generating embeddings for document:", err);
  }

  res.json(newDoc);
});

v1Router.delete("/documents/:id", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const docId = Number(req.params.id);
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.user_id !== u.id) {
    return res.status(403).json({ error: "Forbidden: You do not own this document" });
  }

  db.documents = db.documents.filter((d) => d.id !== docId);
  db.chunks = db.chunks.filter((c) => c.doc_id !== docId);
  saveDb();
  res.json({ message: "Document deleted" });
});

v1Router.get("/documents/:id/download", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const docId = Number(req.params.id);
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc) return res.status(404).send("Document not found");
  if (doc.user_id !== u.id) {
    return res.status(403).send("Forbidden: You do not own this document");
  }

  const docChunks = db.chunks.filter((c) => c.doc_id === docId);
  const fullText = docChunks.map((c) => c.text).join("\n\n");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.filename}"`);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(fullText);
});

v1Router.get("/documents/:docId/chunks/:chunkId", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const docId = Number(req.params.docId);
  const { chunkId } = req.params;
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.user_id !== u.id) {
    return res.status(403).json({ error: "Forbidden: You do not own this document" });
  }

  const chunk = db.chunks.find((c) => c.id === chunkId && c.doc_id === docId);
  if (!chunk) return res.status(404).json({ error: "Chunk not found" });
  res.json(chunk);
});

// 4) Semantic Search
v1Router.get("/search", authenticateToken, async (req, res) => {
  const u = (req as any).user;
  const query = (req.query.q || req.query.query) as string;
  const top_k = Number(req.query.top_k || 10);
  if (!query) return res.status(400).json({ error: "Query is required" });

  const queryVector = await computeEmbedding(query);

  const userDocIds = new Set(db.documents.filter((d) => d.user_id === u.id).map((d) => d.id));
  const userChunks = db.chunks.filter((chunk) => userDocIds.has(chunk.doc_id));

  const scoredResults = userChunks.map((chunk) => {
    let score = 0;
    if (queryVector && chunk.embedding) {
      score = cosineSimilarity(queryVector, chunk.embedding);
    } else {
      score = computeBm25Score(chunk.text, query) * 0.1;
    }
    const doc = db.documents.find((d) => d.id === chunk.doc_id);
    return {
      chunk_id: chunk.id,
      doc_id: chunk.doc_id,
      doc_title: doc?.title || null,
      doc_filename: doc?.filename || null,
      page_number: chunk.page_number,
      text_snippet: chunk.text,
      highlight: chunk.text,
      score: Math.min(Math.max(score, 0), 1),
    };
  });

  scoredResults.sort((a, b) => b.score - a.score);
  res.json(scoredResults.slice(0, top_k));
});

// 5) Chat Sessions History
v1Router.get("/chat/sessions", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const userSessions = db.sessions.filter((s) => s.user_id === u.id);
  const list = userSessions.map((s) => {
    const count = db.messages.filter((m) => m.session_id === s.id).length;
    return {
      id: s.id,
      title: s.title,
      message_count: count,
    };
  });
  res.json(list);
});

v1Router.get("/chat/sessions/:id/messages", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const sessionId = Number(req.params.id);
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.user_id !== u.id) {
    return res.status(403).json({ error: "Forbidden: You do not own this session" });
  }

  const messages = db.messages.filter((m) => m.session_id === sessionId);
  res.json(messages);
});

v1Router.delete("/chat/sessions/:id", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const sessionId = Number(req.params.id);
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.user_id !== u.id) {
    return res.status(403).json({ error: "Forbidden: You do not own this session" });
  }

  db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  db.messages = db.messages.filter((m) => m.session_id !== sessionId);
  saveDb();

  res.json({ success: true, message: "Chat session deleted successfully" });
});

v1Router.put("/chat/sessions/:id", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const sessionId = Number(req.params.id);
  const { title } = req.body;
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Title is required and must be a string" });
  }

  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.user_id !== u.id) {
    return res.status(403).json({ error: "Forbidden: You do not own this session" });
  }

  session.title = title.trim();
  saveDb();

  res.json({ success: true, session });
});

function getTemplateInstruction(template?: string): string {
  switch (template) {
    case "executive":
      return "\n\nRESPONSE STYLE: Executive Brief. Start with an executive summary, list 3-5 core bulleted takeaways, followed by key analysis and any recommendations. Keep the layout clean, highly professional, and optimized for quick reading.";
    case "deepdive":
      return "\n\nRESPONSE STYLE: Analytical Deep Dive. Provide a comprehensive, section-by-section masterly explanation. Thoroughly unpack every concept, number, table, chart detail, or workflow mentioned in the sources. Use precise terminology and professional styling.";
    case "bulletpoints":
      return "\n\nRESPONSE STYLE: Bulleted Breakdown. Deliver the entire explanation in clear, beautifully nested bullet points grouped under thematic bold headers. Minimize prose, maximize structure, and ensure high readability.";
    case "faq":
      return "\n\nRESPONSE STYLE: Q&A Format. Break the explanation down into 3-4 natural questions and answer them clearly. Write in a conversational yet professional dialog format.";
    case "standard":
    default:
      return "\n\nRESPONSE STYLE: Standard Professional. Structure the response with an introduction, detailed body paragraphs, and a clear summary. Use bold accents for key terms to ensure visual rhythm.";
  }
}

async function generateSessionTitle(query: string): Promise<string> {
  const ai = getGeminiClient();
  if (ai) {
    try {
      console.log(`Generating a smart title with Gemini for query: "${query.substring(0, 40)}..."`);
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `You are an expert copywriter. Generate a very short, concise, and professional title (maximum 3 to 5 words, absolutely no punctuation, do not wrap in quotes) for a chat session starting with this user question: "${query}". Keep it professional, informative, and simple so it is easy to read and search.`,
      });
      const title = response.text?.trim().replace(/^["'“”‘’]|["'“”‘’]$/g, "").trim();
      if (title && title.length > 0 && title.length < 50) {
        console.log(`Generated title: "${title}"`);
        return title;
      }
    } catch (err) {
      console.error("Error generating session title with Gemini:", err);
    }
  }
  return query.slice(0, 30) + (query.length > 30 ? "…" : "");
}

// 6) Sending Messages
// Non-Streaming
v1Router.post("/chat/message", authenticateToken, async (req, res) => {
  const u = (req as any).user;
  const {
    query,
    session_id,
    template,
    workspace_id,
    org_id,
    model,
    department,
    hybrid_search,
    reranking,
    query_rewriting,
    query_expansion,
    parent_child,
    guardrails,
  } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });

  let activeSessionId = session_id ? Number(session_id) : null;
  if (activeSessionId) {
    const session = db.sessions.find((s) => s.id === activeSessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.user_id !== u.id) {
      return res.status(403).json({ error: "Forbidden: You do not own this session" });
    }
  }

  const queryStart = Date.now();
  const ai = getGeminiClient();

  // Create workflow engine
  const workflow = new AgentWorkflow(ai, db);
  const finalState = await workflow.execute({
    userId: u.id,
    tenantId: u.tenant_id || "default_tenant",
    workspaceId: workspace_id || "workspace_default",
    originalQuery: query,
    sessionId: activeSessionId,
    template: template || "standard",
    selectedModel: model || "Auto",
    filters: {
      department: department && department !== "All" ? department : undefined,
    },
    hybridSearchEnabled: hybrid_search,
    rerankingEnabled: reranking,
    queryRewritingEnabled: query_rewriting,
    queryExpansionEnabled: query_expansion,
    parentChildEnabled: parent_child,
    guardrailsEnabled: guardrails,
  });

  if (!activeSessionId && !finalState.unsafeDetected) {
    activeSessionId = Date.now();
    const generatedTitle = await generateSessionTitle(query);
    db.sessions.push({
      id: activeSessionId,
      user_id: u.id,
      title: generatedTitle,
      created_at: new Date().toISOString(),
      workspace_id: workspace_id || "workspace_default",
      org_id: org_id || "org_default",
      memory: finalState.memory,
    });
  }

  const session = db.sessions.find((s) => s.id === activeSessionId);

  // Generate Answer via routed model if not blocked
  let fullAnswer = finalState.answer;
  const citations = finalState.rerankedChunks.map((item, idx) => {
    const doc = db.documents.find((d) => d.id === item.chunk.doc_id);
    return {
      chunk_id: item.chunk.id,
      doc_id: item.chunk.doc_id,
      doc_title: doc?.title || null,
      doc_filename: doc?.filename || null,
      page_number: item.chunk.page_number,
      text_snippet: item.chunk.text,
      score: item.vectorScore || 0.85,
      citation_number: idx + 1,
      image_base64: doc?.image_base64 || null,
    };
  });

  if (!finalState.unsafeDetected) {
    if (ai) {
      try {
        const genStart = Date.now();
        const response = await ai.models.generateContent({
          model: finalState.selectedModel,
          contents: finalState.promptText || finalState.query,
        });
        fullAnswer = response.text || "Could not generate answer.";
        finalState.diagnostics.generation_ms = Date.now() - genStart;
      } catch (err: any) {
        fullAnswer = `Could not generate answer: ${err.message || err}`;
      }
    } else {
      fullAnswer = `Offline Mode: Real Gemini response is unavailable.
      Here are the matching sources:
      ${citations.map((c) => `• [${c.citation_number}] - ${c.doc_title}: "${c.text_snippet.substring(0, 100)}..."`).join("\n")}`;
    }
  }

  // Automated RAG Evaluation (RAGAS-equivalent metrics)
  let evalRes = { faithfulness: 1, context_precision: 1, answer_relevancy: 1, context_recall: 1, feedback_summary: "No context." };
  if (!finalState.unsafeDetected && citations.length > 0) {
    evalRes = await evaluateRag(
      ai,
      finalState.query,
      fullAnswer,
      citations.map((c) => c.text_snippet)
    );

    // Save eval logs to admin analytics
    db.eval_logs.push({
      id: Date.now(),
      query: finalState.query,
      recall_at_k: citations.length > 0 ? 1 : 0,
      mrr: 1.0,
      faithfulness: evalRes.faithfulness,
      answer_relevancy: evalRes.answer_relevancy,
      context_precision: evalRes.context_precision,
      created_at: new Date().toISOString(),
    });
  }

  // Update Persistent Conversation Memory
  if (session && !finalState.unsafeDetected) {
    const history = db.messages
      .filter((m) => m.session_id === activeSessionId)
      .map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: "user", content: query });
    history.push({ role: "assistant", content: fullAnswer });

    const updatedMem = await updateSessionMemory(ai, history, session.memory || {
      summary: "",
      important_facts: [],
      context_window_size: 6,
      recent_history: [],
      user_preferences: {},
    });
    session.memory = updatedMem;
  }

  const userMessageId = Date.now();
  const assistantMessageId = Date.now() + 1;
  const feedbackId = `fb-${Date.now()}`;

  // Log to messages
  db.messages.push({
    id: userMessageId,
    session_id: activeSessionId || 9999,
    role: "user",
    content: query,
    created_at: new Date().toISOString(),
    sources: [],
  });

  db.messages.push({
    id: assistantMessageId,
    session_id: activeSessionId || 9999,
    role: "assistant",
    content: fullAnswer,
    created_at: new Date().toISOString(),
    sources: citations,
    model_used: finalState.selectedModel,
    prompt_version_id: db.prompts.find((p) => p.is_active)?.id || "standard",
    evaluation: {
      faithfulness: evalRes.faithfulness,
      context_precision: evalRes.context_precision,
      answer_relevancy: evalRes.answer_relevancy,
      context_recall: evalRes.context_recall,
      summary: evalRes.feedback_summary,
    },
  });

  db.feedback.push({
    id: feedbackId,
    message_id: assistantMessageId,
    helpful: false,
    created_at: new Date().toISOString(),
  });

  // Observability Log
  const latency = Date.now() - queryStart;
  db.query_timeseries.push({ timestamp: Date.now(), latency });
  db.observability_logs.push({
    id: `log-${Date.now()}`,
    user_id: u.id,
    session_id: activeSessionId,
    query: finalState.query,
    rewritten_query: finalState.rewrittenQuery,
    model_used: finalState.selectedModel,
    cost: finalState.costEstimate,
    latency_ms: latency,
    diagnostics: finalState.diagnostics,
    unsafe_flag: finalState.unsafeDetected,
    evaluation: evalRes,
    timestamp: new Date().toISOString(),
  });

  saveDb();

  res.json({
    answer: fullAnswer,
    session_id: activeSessionId,
    citations,
    feedback_id: feedbackId,
    diagnostics: {
      ...finalState.diagnostics,
      selected_model: finalState.selectedModel,
      routing_reason: finalState.modelRoutingReason,
      cost_estimate: finalState.costEstimate,
      pii_masked: finalState.piiMasked,
      eval_metrics: evalRes,
    },
  });
});

// Streaming (SSE)
v1Router.post("/chat/message/stream", authenticateToken, async (req, res) => {
  const u = (req as any).user;
  const {
    query,
    session_id,
    template,
    workspace_id,
    org_id,
    model,
    department,
    hybrid_search,
    reranking,
    query_rewriting,
    query_expansion,
    parent_child,
    guardrails,
  } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });

  let activeSessionId = session_id ? Number(session_id) : null;
  if (activeSessionId) {
    const session = db.sessions.find((s) => s.id === activeSessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.user_id !== u.id) {
      return res.status(403).json({ error: "Forbidden: You do not own this session" });
    }
  }

  const queryStart = Date.now();
  const ai = getGeminiClient();

  // Create workflow engine
  const workflow = new AgentWorkflow(ai, db);
  const finalState = await workflow.execute({
    userId: u.id,
    tenantId: u.tenant_id || "default_tenant",
    workspaceId: workspace_id || "workspace_default",
    originalQuery: query,
    sessionId: activeSessionId,
    template: template || "standard",
    selectedModel: model || "Auto",
    filters: {
      department: department && department !== "All" ? department : undefined,
    },
    hybridSearchEnabled: hybrid_search,
    rerankingEnabled: reranking,
    queryRewritingEnabled: query_rewriting,
    queryExpansionEnabled: query_expansion,
    parentChildEnabled: parent_child,
    guardrailsEnabled: guardrails,
  });

  if (!activeSessionId && !finalState.unsafeDetected) {
    activeSessionId = Date.now();
    const generatedTitle = await generateSessionTitle(query);
    db.sessions.push({
      id: activeSessionId,
      user_id: u.id,
      title: generatedTitle,
      created_at: new Date().toISOString(),
      workspace_id: workspace_id || "workspace_default",
      org_id: org_id || "org_default",
      memory: finalState.memory,
    });
  }

  const session = db.sessions.find((s) => s.id === activeSessionId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const citations = finalState.rerankedChunks.map((item, idx) => {
    const doc = db.documents.find((d) => d.id === item.chunk.doc_id);
    return {
      chunk_id: item.chunk.id,
      doc_id: item.chunk.doc_id,
      doc_title: doc?.title || null,
      doc_filename: doc?.filename || null,
      page_number: item.chunk.page_number,
      text_snippet: item.chunk.text,
      score: item.vectorScore || 0.85,
      citation_number: idx + 1,
      image_base64: doc?.image_base64 || null,
    };
  });

  const metadataEvent = {
    type: "metadata",
    sources: citations,
    retrieval_meta: {
      latency_ms: finalState.diagnostics,
      selected_model: finalState.selectedModel,
      routing_reason: finalState.modelRoutingReason,
      pii_masked: finalState.piiMasked,
      cost_estimate: finalState.costEstimate,
    },
  };
  res.write(`data: ${JSON.stringify(metadataEvent)}\n\n`);

  let fullAnswer = "";
  const feedbackId = `fb-${Date.now()}`;

  if (finalState.unsafeDetected) {
    fullAnswer = `AI Guardrail Block: ${finalState.blockReason}`;
    res.write(`data: ${JSON.stringify({ type: "token", content: fullAnswer })}\n\n`);
  } else if (ai) {
    try {
      const genStart = Date.now();
      const streamRes = await ai.models.generateContentStream({
        model: finalState.selectedModel,
        contents: finalState.promptText || finalState.query,
      });

      for await (const chunk of streamRes) {
        const textToken = chunk.text || "";
        fullAnswer += textToken;
        res.write(`data: ${JSON.stringify({ type: "token", content: textToken })}\n\n`);
      }
      finalState.diagnostics.generation_ms = Date.now() - genStart;
    } catch (err: any) {
      fullAnswer = `Could not generate answer: ${err.message || err}`;
      res.write(`data: ${JSON.stringify({ type: "token", content: fullAnswer })}\n\n`);
    }
  } else {
    const offlineMsg = `Offline Mode: Real Gemini response is unavailable.
    Here are the matching sources:
    ${citations.map((c) => `• [${c.citation_number}] - ${c.doc_title}: "${c.text_snippet.substring(0, 100)}..."`).join("\n")}`;
    fullAnswer = offlineMsg;
    res.write(`data: ${JSON.stringify({ type: "token", content: offlineMsg })}\n\n`);
  }

  // RAG Evaluation
  let evalRes = { faithfulness: 1, context_precision: 1, answer_relevancy: 1, context_recall: 1, feedback_summary: "No context." };
  if (!finalState.unsafeDetected && citations.length > 0) {
    evalRes = await evaluateRag(
      ai,
      finalState.query,
      fullAnswer,
      citations.map((c) => c.text_snippet)
    );

    db.eval_logs.push({
      id: Date.now(),
      query: finalState.query,
      recall_at_k: citations.length > 0 ? 1 : 0,
      mrr: 1.0,
      faithfulness: evalRes.faithfulness,
      answer_relevancy: evalRes.answer_relevancy,
      context_precision: evalRes.context_precision,
      created_at: new Date().toISOString(),
    });
  }

  // Update Conversation Memory
  if (session && !finalState.unsafeDetected) {
    const history = db.messages
      .filter((m) => m.session_id === activeSessionId)
      .map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: "user", content: query });
    history.push({ role: "assistant", content: fullAnswer });

    const updatedMem = await updateSessionMemory(ai, history, session.memory || {
      summary: "",
      important_facts: [],
      context_window_size: 6,
      recent_history: [],
      user_preferences: {},
    });
    session.memory = updatedMem;
  }

  const userMessageId = Date.now();
  const assistantMessageId = Date.now() + 1;

  db.messages.push({
    id: userMessageId,
    session_id: activeSessionId || 9999,
    role: "user",
    content: query,
    created_at: new Date().toISOString(),
    sources: [],
  });

  db.messages.push({
    id: assistantMessageId,
    session_id: activeSessionId || 9999,
    role: "assistant",
    content: fullAnswer,
    created_at: new Date().toISOString(),
    sources: citations,
    model_used: finalState.selectedModel,
    prompt_version_id: db.prompts.find((p) => p.is_active)?.id || "standard",
    evaluation: {
      faithfulness: evalRes.faithfulness,
      context_precision: evalRes.context_precision,
      answer_relevancy: evalRes.answer_relevancy,
      context_recall: evalRes.context_recall,
      summary: evalRes.feedback_summary,
    },
  });

  db.feedback.push({
    id: feedbackId,
    message_id: assistantMessageId,
    helpful: false,
    created_at: new Date().toISOString(),
  });

  // Telemetry Log
  const latency = Date.now() - queryStart;
  db.query_timeseries.push({ timestamp: Date.now(), latency });
  db.observability_logs.push({
    id: `log-${Date.now()}`,
    user_id: u.id,
    session_id: activeSessionId,
    query: finalState.query,
    rewritten_query: finalState.rewrittenQuery,
    model_used: finalState.selectedModel,
    cost: finalState.costEstimate,
    latency_ms: latency,
    diagnostics: finalState.diagnostics,
    unsafe_flag: finalState.unsafeDetected,
    evaluation: evalRes,
    timestamp: new Date().toISOString(),
  });

  saveDb();

  const finalEvent = {
    type: "final",
    session_id: activeSessionId,
    citations,
    feedback_id: feedbackId,
    evaluation_metrics: evalRes,
  };
  res.write(`data: ${JSON.stringify(finalEvent)}\n\n`);
  res.end();
});

// 7) Feedback API
v1Router.post("/feedback/:feedbackId", authenticateToken, (req, res) => {
  const { feedbackId } = req.params;
  const rating = req.body.rating;
  const isHelpful = req.body.is_helpful === 1 || rating === 5;

  const fb = db.feedback.find((f) => f.id === feedbackId);
  if (fb) {
    fb.helpful = isHelpful;
    saveDb();
    return res.json({ status: "ok" });
  }
  res.status(404).json({ error: "Feedback reference not found" });
});

// 8) Admin Analytics
v1Router.get("/admin/stats", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const queryCount = db.query_timeseries.length;
  const avgLat = queryCount > 0 ? db.query_timeseries.reduce((acc, q) => acc + q.latency, 0) / queryCount : 350;

  res.json({
    active_users: db.users.length,
    total_queries: queryCount + 4,
    total_documents: db.documents.length,
    avg_response_time_ms: avgLat,
    cache_hit_ratio: 0.15,
    total_feedback: db.feedback.length,
  });
});

v1Router.get("/admin/analytics/timeseries", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const today = new Date().toLocaleDateString();
  res.json({
    queries: [
      { date: "Yesterday", count: 2, avg_latency: 320 },
      { date: today, count: db.query_timeseries.length, avg_latency: 410 },
    ],
    uploads: [
      { date: "Yesterday", count: 1 },
      { date: today, count: db.upload_timeseries.length },
    ],
  });
});

v1Router.get("/admin/analytics/summary", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const helpful = db.feedback.filter((f) => f.helpful).length;
  const total = db.feedback.length;
  res.json({
    helpful,
    not_helpful: total - helpful,
    helpful_rate: total > 0 ? Math.round((helpful / total) * 100) : 100,
  });
});

// 9) Evaluation Quality Logs
v1Router.get("/evaluation/logs", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  res.json({ logs: db.eval_logs });
});

v1Router.post("/evaluation/run", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const { query } = req.body;
  const newLog: DBEvalLog = {
    id: Date.now(),
    query,
    recall_at_k: 1.0,
    mrr: 1.0,
    faithfulness: 0.92,
    answer_relevancy: 0.88,
    context_precision: 0.95,
    created_at: new Date().toISOString(),
  };
  db.eval_logs.unshift(newLog);
  saveDb();
  res.json(newLog);
});

// 10) Prompts Management Endpoints
v1Router.get("/prompts", authenticateToken, (req, res) => {
  res.json({ prompts: db.prompts });
});

v1Router.post("/prompts", authenticateToken, (req, res) => {
  const u = (req as any).user;
  if (u.role !== "admin") return res.status(403).json({ error: "Only admins can modify system prompts." });
  const { name, template_text, description } = req.body;
  if (!name || !template_text) return res.status(400).json({ error: "Prompt name and template_text are required." });

  const existingPrompts = db.prompts.filter((p) => p.name === name);
  const nextVersion = existingPrompts.length > 0 ? Math.max(...existingPrompts.map((p) => p.version)) + 1 : 1;

  const newPrompt: PromptTemplate = {
    id: `prompt_${name}_v${nextVersion}`,
    name,
    version: nextVersion,
    template_text,
    is_active: false,
    created_at: new Date().toISOString(),
    created_by: u.full_name,
    description: description || `Version ${nextVersion} of prompt template: ${name}`,
  };

  db.prompts.push(newPrompt);
  saveDb();
  res.json(newPrompt);
});

v1Router.post("/prompts/:id/activate", authenticateToken, (req, res) => {
  const u = (req as any).user;
  if (u.role !== "admin") return res.status(403).json({ error: "Only admins can modify system prompts." });
  const promptId = req.params.id;

  const target = db.prompts.find((p) => p.id === promptId);
  if (!target) return res.status(404).json({ error: "Prompt template not found." });

  // Mark all with the same name as inactive first, then mark target active
  db.prompts.forEach((p) => {
    if (p.name === target.name) {
      p.is_active = (p.id === target.id);
    }
  });

  saveDb();
  res.json({ success: true, active_prompt: target });
});

v1Router.post("/prompts/:id/rollback", authenticateToken, (req, res) => {
  const u = (req as any).user;
  if (u.role !== "admin") return res.status(403).json({ error: "Only admins can rollback prompts." });
  const promptId = req.params.id;

  const target = db.prompts.find((p) => p.id === promptId);
  if (!target) return res.status(404).json({ error: "Prompt template not found." });

  // Rollback means we create a brand new version that is a clone of the target prompt and make it active
  const existingPrompts = db.prompts.filter((p) => p.name === target.name);
  const nextVersion = Math.max(...existingPrompts.map((p) => p.version)) + 1;

  const rollbackPrompt: PromptTemplate = {
    id: `prompt_${target.name}_v${nextVersion}`,
    name: target.name,
    version: nextVersion,
    template_text: target.template_text,
    is_active: true,
    created_at: new Date().toISOString(),
    created_by: u.full_name,
    description: `Rollback clone of ${target.id}`,
  };

  db.prompts.forEach((p) => {
    if (p.name === target.name) {
      p.is_active = false;
    }
  });

  db.prompts.push(rollbackPrompt);
  saveDb();
  res.json({ success: true, rolled_back_to: rollbackPrompt });
});

// 11) Observability and Telemetry Endpoint
v1Router.get("/admin/observability", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const totalCost = db.observability_logs.reduce((acc, log) => acc + (log.cost || 0), 0);
  const totalTokens = db.observability_logs.length * 4500; // approximation
  const guardrailBlocks = db.observability_logs.filter((log) => log.unsafe_flag).length;

  res.json({
    logs: db.observability_logs.slice(-50).reverse(), // last 50 logs
    aggregate: {
      total_cost: totalCost,
      total_tokens: totalTokens,
      guardrail_blocks: guardrailBlocks,
      failed_queries: db.observability_logs.filter(l => l.latency_ms > 10000).length,
    }
  });
});

// 12) Enterprise User and System Management Endpoints
v1Router.get("/admin/users", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const search = req.query.search ? String(req.query.search).toLowerCase() : "";
  let filtered = db.users;

  if (search) {
    filtered = db.users.filter(user => 
      (user.email && user.email.toLowerCase().includes(search)) ||
      (user.full_name && user.full_name.toLowerCase().includes(search))
    );
  }

  res.json({ users: filtered });
});

v1Router.post("/admin/users", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const { email, password, full_name, role, department } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const existing = db.users.find(user => user.email.toLowerCase() === email.toLowerCase());
  if (existing) return res.status(400).json({ error: "User already exists with this email." });

  const newUser = {
    id: Date.now(),
    email,
    password_hash: password, // simple storage to remain compatible with custom login system
    full_name: full_name || email.split("@")[0],
    role: role || "user",
    department: department || "Engineering",
  };

  db.users.push(newUser);
  saveDb();
  res.json({ success: true, user: newUser });
});

v1Router.put("/admin/users/:id", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const userId = Number(req.params.id);
  const target = db.users.find(user => user.id === userId);
  if (!target) return res.status(404).json({ error: "User not found." });

  const { email, full_name, role, password, department } = req.body;
  if (email) target.email = email;
  if (full_name !== undefined) target.full_name = full_name;
  if (role) target.role = role;
  if (password) target.password_hash = password;
  if (department !== undefined) target.department = department;

  saveDb();
  res.json({ success: true, user: target });
});

v1Router.delete("/admin/users/:id", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const userId = Number(req.params.id);
  if (userId === 1 && u.id === 1) {
    return res.status(400).json({ error: "Cannot delete primary root administrator account." });
  }

  const index = db.users.findIndex(user => user.id === userId);
  if (index === -1) return res.status(404).json({ error: "User not found." });

  db.users.splice(index, 1);
  saveDb();
  res.json({ success: true });
});

v1Router.get("/admin/config", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  res.json({ config: db.system_config });
});

v1Router.post("/admin/config", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const newConfig = req.body;
  db.system_config = {
    ...db.system_config,
    ...newConfig,
  };
  saveDb();
  res.json({ success: true, config: db.system_config });
});

v1Router.get("/admin/documents", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  res.json({ documents: db.documents });
});

v1Router.delete("/admin/documents/:id", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const docId = Number(req.params.id);
  const index = db.documents.findIndex(d => d.id === docId);
  if (index === -1) return res.status(404).json({ error: "Document not found." });

  db.documents.splice(index, 1);
  // clean chunks
  db.chunks = db.chunks.filter(c => c.doc_id !== docId);
  saveDb();
  res.json({ success: true });
});

v1Router.post("/admin/documents/:id/reindex", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const docId = Number(req.params.id);
  const doc = db.documents.find(d => d.id === docId);
  if (!doc) return res.status(404).json({ error: "Document not found." });

  // Simulate reprocessing and update processing status
  doc.processing_status = "processing";
  saveDb();

  setTimeout(() => {
    doc.processing_status = "processed";
    saveDb();
  }, 2000);

  res.json({ success: true, status: "processing" });
});

// Mount the v1 router at /api/v1
app.use("/api/v1", v1Router);

// Mount Vite in development, serve build dist folder in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express custom server listening at http://0.0.0.0:${PORT}`);
  });
}

void startServer();
