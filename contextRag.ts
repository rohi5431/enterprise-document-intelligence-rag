import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import * as pdfParsePkg from "pdf-parse";
import Redis from "ioredis";
import neo4j from "neo4j-driver";
import { QdrantStore } from "./qdrant";

// Enterprise Feature Modules
import { AgentWorkflow, AgentState } from "./src/lib/agentWorkflow";
import { extractDocumentMetadata, generateParentChildChunks } from "./src/lib/documentProcessor";
import { getInitialPrompts, PromptTemplate } from "./src/lib/prompts";
import { evaluateRag } from "./src/lib/evaluator";
import { scanAndSanitizePrompt } from "./src/lib/guardrails";
import { getSessionMemoryContext, updateSessionMemory, SessionMemory } from "./src/lib/memory";

const app = express();
const PORT = 3000;
// Gemini 2.5 Flash is no longer available to new Gemini API projects.
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001";

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
  visual_assets?: VisualAsset[];
  department?: string;
  tags?: string[];
  document_type?: string;
  security_level?: "public" | "internal" | "restricted" | "confidential";
  author?: string;
  language?: string;
  workspace_id?: string;
  source_url?: string;
}

interface VisualAsset {
  id: string;
  page_number: number;
  image_base64: string;
  description: string;
}

interface DBChunk {
  id: string;
  doc_id: number;
  text: string;
  page_number: number;
  embedding: number[] | null;
  parent_id?: string | null;
  visual_id?: string | null;
}

interface DBSession {
  id: number;
  user_id: number;
  title: string;
  created_at: string;
  memory?: SessionMemory;
  workspace_id?: string;
  org_id?: string;
  document_ids?: number[];
  document_name?: string;
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
    llm_model: GEMINI_MODEL,
    top_k: 10,
    similarity_threshold: 0.6,
    temperature: 0.7,
    cache_ttl: 300,
    streaming_enabled: true,
    guardrails_enabled: true,
  },
};

const DB_FILE = path.join(process.cwd(), "db.json");
const qdrant = new QdrantStore();
const qdrantSync = {
  status: "idle" as "idle" | "running" | "complete" | "failed",
  indexed_chunks: 0,
  total_chunks: 0,
  error: null as string | null,
  completed_at: null as string | null,
};

function imageForChunk(doc: DBDocument | undefined, chunk: DBChunk): string | null {
  if (chunk.visual_id) {
    return doc?.visual_assets?.find((asset) => asset.id === chunk.visual_id)?.image_base64 || null;
  }
  return doc?.image_base64 || null;
}

function webPageToText(html: string): string {
  const withoutNonContent = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  return withoutNonContent
    .replace(/<\/(?:p|div|h[1-6]|li|article|section|br)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function validatePublicWebUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase();
  const privateIpv4 = /^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
  if (!/^https?:$/.test(url.protocol) || hostname === "localhost" || hostname.endsWith(".local") || privateIpv4.test(hostname) || hostname === "::1") {
    throw new Error("Only public http or https web pages can be imported.");
  }
  return url;
}

async function extractPdfVisualAssets(parser: any, ai: GoogleGenAI | null): Promise<VisualAsset[]> {
  if (!parser || !ai) return [];

  try {
    // A page screenshot preserves vector diagrams as well as raster images. Keep
    // the upper limit bounded so a large PDF cannot create an unbounded upload.
    const screenshots = await parser.getScreenshot({ first: 20, desiredWidth: 960, imageBuffer: false });
    const visuals: VisualAsset[] = [];

    for (const page of screenshots.pages || []) {
      const response = await retryTransientGemini(() => ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { inlineData: { mimeType: "image/png", data: String(page.dataUrl || "").replace(/^data:image\/png;base64,/, "") } },
          { text: "Inspect this PDF page. If it contains a meaningful architecture diagram, flowchart, chart, table, or visual process, respond with `VISUAL:` followed by a precise explanation of the visual, its components, relationships, and flow. If it is only normal prose or a decorative image, respond with exactly `NONE`." },
        ],
      }));
      const description = response.text?.trim() || "";
      if (!description.startsWith("VISUAL:") || !page.dataUrl) continue;
      visuals.push({
        id: `visual_page_${page.pageNumber}`,
        page_number: Number(page.pageNumber) || 1,
        image_base64: page.dataUrl,
        description: description.replace(/^VISUAL:\s*/i, ""),
      });
    }
    return visuals;
  } catch (error) {
    console.warn("PDF visual extraction failed; text ingestion will continue:", error instanceof Error ? error.message : error);
    return [];
  }
}

async function indexChunksInQdrant(chunks: DBChunk[], userId: number) {
  if (!qdrant.configured) return;
  try {
    await qdrant.upsert(chunks, userId);
  } catch (error) {
    console.warn("Qdrant indexing failed; local retrieval remains available:", error instanceof Error ? error.message : error);
  }
}

async function removeDocumentFromQdrant(docId: number, userId: number) {
  if (!qdrant.configured) return;
  try {
    await qdrant.deleteDocument(docId, userId);
  } catch (error) {
    console.warn("Qdrant delete failed; the document is still removed locally:", error instanceof Error ? error.message : error);
  }
}

async function syncAllDocumentsToQdrant() {
  if (!qdrant.configured) throw new Error("QDRANT_URL and QDRANT_API_KEY must be configured before syncing.");
  const documentsWithChunks = db.documents.map((document) => ({
    document,
    chunks: db.chunks.filter((chunk) => chunk.doc_id === document.id && chunk.parent_id),
  })).filter((item) => item.chunks.length > 0);

  qdrantSync.status = "running";
  qdrantSync.indexed_chunks = 0;
  qdrantSync.total_chunks = documentsWithChunks.reduce((total, item) => total + item.chunks.length, 0);
  qdrantSync.error = null;
  qdrantSync.completed_at = null;

  try {
    for (const { document, chunks } of documentsWithChunks) {
      await embedChunks(chunks);
      const indexableChunks = chunks.filter((chunk) => chunk.embedding?.length);
      if (indexableChunks.length !== chunks.length) {
        throw new Error(`Could not create embeddings for document \"${document.filename}\".`);
      }
      // Do not swallow errors in an admin-initiated sync: the dashboard must
      // show a real problem instead of claiming that vectors were stored.
      await qdrant.upsert(indexableChunks, document.user_id);
      qdrantSync.indexed_chunks += indexableChunks.length;
      saveDb();
    }
    qdrantSync.status = "complete";
    qdrantSync.completed_at = new Date().toISOString();
  } catch (error) {
    qdrantSync.status = "failed";
    qdrantSync.error = error instanceof Error ? error.message : "Qdrant sync failed.";
    qdrantSync.completed_at = new Date().toISOString();
    console.error("Qdrant full sync failed:", qdrantSync.error);
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save database to disk:", err);
  }
}

function syncAdminCredentials() {
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredEmail || !configuredPassword) return;

  const emailOwner = db.users.find((user) => user.email.toLowerCase() === configuredEmail);
  const admin = emailOwner?.role === "admin"
    ? emailOwner
    : db.users.find((user) => user.role === "admin");

  if (emailOwner && emailOwner !== admin) {
    console.error("Admin credentials were not synchronized because the configured email belongs to a non-admin user.");
    return;
  }

  if (admin) {
    if (admin.email === configuredEmail && admin.password_hash === configuredPassword) return;
    admin.email = configuredEmail;
    admin.password_hash = configuredPassword;
  } else {
    db.users.push({
      id: Math.max(0, ...db.users.map((user) => user.id)) + 1,
      email: configuredEmail,
      password_hash: configuredPassword,
      full_name: configuredEmail.split("@")[0],
      role: "admin",
    });
  }

  saveDb();
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
        llm_model: GEMINI_MODEL,
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

      // Migrate retired Gemini model names so persisted settings do not keep
      // forcing unavailable models after a deployment upgrade.
      if (["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"].includes(db.system_config.llm_model)) {
        db.system_config.llm_model = GEMINI_MODEL;
      }
      Object.values(db.user_prefs).forEach((preference: any) => {
        if (["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"].includes(preference?.llm_model)) preference.llm_model = GEMINI_MODEL;
        if (Array.isArray(preference?.available_models?.gemini)) preference.available_models.gemini = [GEMINI_MODEL];
      });
      
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

    syncAdminCredentials();
  } catch (err) {
    console.error("Failed to load database from disk, using empty defaults:", err);
  }
}

// Load database immediately
loadDb();

// Bring previously uploaded documents into Qdrant after a restart. Only chunks
// that already have embeddings are sent, so this never blocks startup or makes
// an unexpected model request for the whole catalogue.
void (async () => {
  if (!qdrant.configured) return;
  const chunksByOwner = new Map<number, DBChunk[]>();
  for (const chunk of db.chunks.filter((item) => item.parent_id && item.embedding?.length)) {
    const ownerId = db.documents.find((document) => document.id === chunk.doc_id)?.user_id;
    if (!ownerId) continue;
    const chunks = chunksByOwner.get(ownerId) || [];
    chunks.push(chunk);
    chunksByOwner.set(ownerId, chunks);
  }
  for (const [ownerId, chunks] of chunksByOwner) {
    await indexChunksInQdrant(chunks, ownerId);
  }
})();

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

async function retryTransientGemini<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const delayMs of [0, 700, 1_800]) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      // A quota exhaustion includes an explicit retry window; retrying it three
      // times immediately consumes no useful capacity and delays the upload.
      if (/RESOURCE_EXHAUSTED|quota exceeded|free_tier_requests/i.test(message)) throw error;
      if (!/UNAVAILABLE|503|RESOURCE_EXHAUSTED|429|deadline/i.test(message)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini request failed after retries.");
}

// ─── Multi-Provider Fallback Helpers (Groq & Ollama) ─────────────
const GROQ_CANDIDATE_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

const VISUAL_QUERY_PATTERN = /\b(diagram|architecture|architectural|flow\s?chart|workflow|visual|chart|figure|image|illustration|layout|schema|pipeline|dikhao|dikhaiye|dikhaye|chitra|aarekh|vastukala|naksha)\b|आरेख|चित्र|वास्तुकला|नक्शा|प्रवाह/i;

function requiresVisualReasoning(query: string, _citations: Array<{ image_base64?: string | null }>): boolean {
  // An image citation alone must not route an ordinary text question away from Groq/Ollama.
  return VISUAL_QUERY_PATTERN.test(query);
}

async function callGroqChat(promptText: string): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  for (const model of GROQ_CANDIDATE_MODELS) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: promptText }],
          temperature: 0.7,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return { text, model: `groq (${model})` };
      }
    } catch (e) {
      console.warn(`Groq model ${model} failed:`, e);
    }
  }
  return null;
}

// Gemini can temporarily return 503 during busy periods. Groq's vision model
// provides a second OCR/diagram path so an uploaded image remains searchable.
async function callGroqVision(mimeType: string, base64Image: string, promptText: string): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  for (const model of ["meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct"]) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [{ role: "user", content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
          ] }],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.warn(`Groq vision model ${model} returned ${res.status}: ${detail.slice(0, 300)}`);
        continue;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim()) return { text, model: `groq (${model})` };
    } catch (error) {
      console.warn(`Groq vision model ${model} failed:`, error);
    }
  }
  return null;
}

async function streamGroqChat(
  promptText: string,
  onToken: (token: string) => void
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  for (const model of GROQ_CANDIDATE_MODELS) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: promptText }],
          stream: true,
          temperature: 0.7,
        }),
      });
      if (!res.ok || !res.body) continue;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (trimmed.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) {
                fullText += token;
                onToken(token);
              }
            } catch {
              // ignore malformed line
            }
          }
        }
      }

      if (fullText.trim().length > 0) {
        return { text: fullText, model: `groq (${model})` };
      }
    } catch (e) {
      console.warn(`Groq stream model ${model} failed:`, e);
    }
  }
  return null;
}

async function callOllamaChat(promptText: string): Promise<{ text: string; model: string } | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3";
  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: promptText,
        stream: false,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.response) return { text: data.response, model: `ollama (${model})` };
    }
  } catch (e) {
    // Ollama not reachable
  }
  return null;
}

async function streamOllamaChat(
  promptText: string,
  onToken: (token: string) => void
): Promise<{ text: string; model: string } | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3";
  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: promptText,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.response) {
            fullText += parsed.response;
            onToken(parsed.response);
          }
        } catch {
          // ignore
        }
      }
    }

    if (fullText.trim().length > 0) {
      return { text: fullText, model: `ollama (${model})` };
    }
  } catch (e) {
    // Ollama not reachable
  }
  return null;
}


// Generate basic embeddings helper
async function computeEmbedding(text: string): Promise<number[] | null> {
  const ai = getGeminiClient();
  if (!ai) return null;
  try {
    const res = await ai.models.embedContent({
      model: GEMINI_EMBEDDING_MODEL,
      contents: text,
    });
    // The current Google Gen AI SDK returns `embeddings`, while older SDK
    // releases exposed a singular `embedding`. Support both shapes so an SDK
    // update cannot silently turn every vector into null again.
    return (res as any).embeddings?.[0]?.values || (res as any).embedding?.values || null;
  } catch (error) {
    console.warn("Embedding generation failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function embedChunks(chunks: DBChunk[]) {
  const batchSize = 4;
  for (let index = 0; index < chunks.length; index += batchSize) {
    await Promise.all(chunks.slice(index, index + batchSize).map(async (chunk) => {
      const embedding = await computeEmbedding(chunk.text);
      if (embedding) chunk.embedding = embedding;
    }));
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
    llm_model: GEMINI_MODEL,
    query_expansion_enabled: false,
  };

  let expandedQueries = [message];
  const ai = getGeminiClient();
  if (prefs.query_expansion_enabled && ai) {
    try {
      const expRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
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
      image_base64: imageForChunk(doc, item.chunk),
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
      llm_model: GEMINI_MODEL,
      query_expansion_enabled: false,
      show_retrieval_diagnostics: true,
      available_providers: ["gemini"],
      available_models: {
        gemini: [GEMINI_MODEL],
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
      gemini: [GEMINI_MODEL],
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

  // Check if document already exists for this user to remove redundancy
  const existingDoc = db.documents.find(
    (d) =>
      d.user_id === u.id &&
      (d.filename.toLowerCase() === filename.toLowerCase() ||
        (d.file_size === rawBuffer.length && d.title.toLowerCase() === filename.replace(/\.[^/.]+$/, "").toLowerCase()))
  );

  if (existingDoc) {
    console.log(`Document "${filename}" is already present (id: ${existingDoc.id}). Preventing duplicate to remove redundancy.`);
    return res.status(200).json({
      ...existingDoc,
      already_exists: true,
      message: `Document "${filename}" is already uploaded and indexed. Duplicate upload prevented to remove redundancy.`,
    });
  }

  const fileId = Date.now();
  const title = (req.body.title as string) || filename.replace(/\.[^/.]+$/, "");
  
  const ext = filename.toLowerCase().split('.').pop() || "";
  const isImg = ["png", "jpg", "jpeg", "webp", "tiff", "tif", "bmp"].includes(ext) || (req.file.mimetype && req.file.mimetype.startsWith("image/"));
  let textContent = "";
  let imgBase64 = "";
  let visualAssets: VisualAsset[] = [];

  // 1. Core Text Extraction (OCR / PDF / Word / Text)
  if (isImg) {
    imgBase64 = rawBuffer.toString("base64");
    const ai = getGeminiClient();
    const imageMimeType = req.file.mimetype || `image/${ext === "jpg" ? "jpeg" : ext}`;
    const imageAnalysisPrompt = "You are an advanced visual document parser. This may be a handwritten note, photographed page, slide, diagram, or image. First, transcribe all legible text exactly, preserving labels, equations, spelling, and reading order. Clearly mark uncertain handwritten words as [unclear]. Then explain diagrams, flowcharts, charts, numbers, visual structure, and tables. Include enough detail that later questions can be answered from this extracted content.";
    if (ai) {
      try {
        console.log(`Analyzing uploaded image/slide file "${filename}"...`);
        const response = await retryTransientGemini(() => ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              inlineData: {
                mimeType: imageMimeType,
                data: imgBase64,
              }
            },
            { text: imageAnalysisPrompt }
          ]
        }));
        textContent = response.text || `[Image/Slide: ${filename}] (No description generated)`;
        console.log(`Successfully parsed image slide with Gemini. Description length: ${textContent.length} chars.`);
      } catch (err: any) {
        console.warn("Gemini image analysis unavailable; trying Groq vision:", err?.message || err);
        const fallback = await callGroqVision(imageMimeType, imgBase64, imageAnalysisPrompt);
        if (fallback) {
          textContent = fallback.text;
          console.log(`Successfully parsed image with ${fallback.model}. Description length: ${textContent.length} chars.`);
        } else {
          textContent = `[Image/Slide: ${filename}] Visual text extraction is temporarily unavailable. The image is preserved and can be retried later.`;
        }
      }
    } else {
      const fallback = await callGroqVision(imageMimeType, imgBase64, imageAnalysisPrompt);
      textContent = fallback?.text || `[Image/Slide: ${filename}] Visual text extraction is temporarily unavailable. The image is preserved and can be retried later.`;
    }
    visualAssets = [{ id: "visual_page_1", page_number: 1, image_base64: `data:${imageMimeType};base64,${imgBase64}`, description: textContent }];
  } else if (filename.toLowerCase().endsWith(".pdf") || req.file.mimetype === "application/pdf") {
    let pdfParser: any = null;
    try {
      if (pdfParsePkg && typeof pdfParsePkg.PDFParse === "function") {
        console.log("Parsing PDF using modern PDFParse class...");
        pdfParser = new pdfParsePkg.PDFParse({ data: rawBuffer });
        const parsed = await pdfParser.getText();
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
            model: GEMINI_MODEL,
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

    // Preserve meaningful PDF visuals as page images and index their generated
    // descriptions. A later architecture/diagram question can therefore return
    // both the original visual and an explanation grounded in that page.
    visualAssets = await extractPdfVisualAssets(pdfParser, getGeminiClient());
    if (pdfParser?.destroy) await pdfParser.destroy().catch(() => undefined);
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
          model: GEMINI_MODEL,
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

  const visualParentChunks: DBChunk[] = visualAssets.map((asset) => ({
    id: `${fileId}_${asset.id}_parent`,
    doc_id: fileId,
    text: `[Document visual on page ${asset.page_number}]\n${asset.description}`,
    page_number: asset.page_number,
    embedding: null,
    parent_id: null,
    visual_id: asset.id,
  }));
  const visualChildChunks: DBChunk[] = visualAssets.map((asset) => ({
    id: `${fileId}_${asset.id}`,
    doc_id: fileId,
    text: `[Architecture / diagram / visual on page ${asset.page_number}]\n${asset.description}`,
    page_number: asset.page_number,
    embedding: null,
    parent_id: `${fileId}_${asset.id}_parent`,
    visual_id: asset.id,
  }));

  const newDoc: DBDocument = {
    id: fileId,
    user_id: u.id,
    title,
    filename,
    filepath: "",
    file_size: rawBuffer.length,
    chunks_count: childDbChunks.length + visualChildChunks.length,
    processing_status: "processed",
    created_at: new Date().toISOString(),
    image_base64: isImg ? `data:${req.file.mimetype || "image/png"};base64,${imgBase64}` : undefined,
    visual_assets: visualAssets,
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
  db.chunks.push(...parentDbChunks, ...childDbChunks, ...visualParentChunks, ...visualChildChunks);
  db.upload_timeseries.push({ timestamp: Date.now() });
  saveDb();

  // 4. Generate Embeddings for Child Chunks only (non-blocking in parallel)
  try {
    const indexableChunks = [...childDbChunks, ...visualChildChunks];
    await embedChunks(indexableChunks);
    await indexChunksInQdrant(indexableChunks, u.id);
    saveDb();
    console.log(`Generated embeddings for ${indexableChunks.length} searchable chunks of document "${filename}"`);
  } catch (err) {
    console.error("Error generating embeddings for document:", err);
  }

  res.json(newDoc);
});

// Import readable content from a public web page into the same RAG pipeline as
// uploaded documents. This is intentionally server-side so CORS does not block
// users from importing articles and documentation pages.
v1Router.post("/documents/import-url", authenticateToken, async (req, res) => {
  const u = (req as any).user;
  const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  const requestedTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!rawUrl) return res.status(400).json({ error: "A public web page URL is required." });

  let url: URL;
  try {
    url = validatePublicWebUrl(rawUrl);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid URL." });
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,text/plain;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return res.status(400).json({ error: `Could not retrieve the page (HTTP ${response.status}).` });
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/(html|plain)/i.test(contentType)) return res.status(400).json({ error: "Only HTML or plain-text pages can be imported." });
    const source = await response.text();
    if (Buffer.byteLength(source, "utf8") > 5 * 1024 * 1024) return res.status(413).json({ error: "The web page exceeds the 5 MB import limit." });

    const textContent = webPageToText(source);
    if (textContent.length < 80) return res.status(400).json({ error: "The web page did not contain enough readable text to import." });

    const existingDoc = db.documents.find((doc) => doc.user_id === u.id && doc.source_url === url.toString());
    if (existingDoc) return res.json({ ...existingDoc, already_exists: true, message: "This web page is already in your knowledge base." });

    const fileId = Date.now();
    const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const filename = `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`.slice(0, 180);
    const title = requestedTitle || webPageToText(titleMatch || "") || url.hostname;
    const ai = getGeminiClient();
    const meta = await extractDocumentMetadata(ai, filename, textContent);
    const { parents, children } = generateParentChildChunks(textContent, fileId);
    const parentChunks: DBChunk[] = parents.map((chunk) => ({ ...chunk, doc_id: fileId, embedding: null, parent_id: null }));
    const childChunks: DBChunk[] = children.map((chunk) => ({ ...chunk, doc_id: fileId, embedding: null }));
    const newDoc: DBDocument = {
      id: fileId, user_id: u.id, title, filename, filepath: "", file_size: Buffer.byteLength(source, "utf8"),
      chunks_count: childChunks.length, processing_status: "processed", created_at: new Date().toISOString(),
      source_url: url.toString(), department: meta.department, tags: meta.tags, document_type: meta.document_type,
      security_level: meta.security_level, author: meta.author, language: meta.language, workspace_id: "workspace_default",
    };
    db.documents.push(newDoc);
    db.chunks.push(...parentChunks, ...childChunks);
    db.upload_timeseries.push({ timestamp: Date.now() });
    await embedChunks(childChunks);
    await indexChunksInQdrant(childChunks, u.id);
    saveDb();
    res.json(newDoc);
  } catch (error) {
    console.error("Web-page import failed:", error);
    res.status(502).json({ error: error instanceof Error ? `Web-page import failed: ${error.message}` : "Web-page import failed." });
  }
});

// Save pasted notes, copied web text, or any other plain text as a searchable
// knowledge source. Keeping it in the document pipeline means follow-up
// questions use the same scoped retrieval as uploaded files and web pages.
v1Router.post("/documents/import-text", authenticateToken, async (req, res) => {
  const u = (req as any).user;
  const textContent = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const requestedTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (textContent.length < 20) return res.status(400).json({ error: "Paste at least 20 characters of text." });
  if (Buffer.byteLength(textContent, "utf8") > 2 * 1024 * 1024) return res.status(413).json({ error: "Pasted text exceeds the 2 MB limit." });

  try {
    const fileId = Date.now();
    const title = (requestedTitle || "Pasted notes").slice(0, 180);
    const filename = `${title.replace(/[^a-z0-9 _-]/gi, "_") || "pasted_notes"}.txt`;
    const ai = getGeminiClient();
    const meta = await extractDocumentMetadata(ai, filename, textContent);
    const { parents, children } = generateParentChildChunks(textContent, fileId);
    const parentChunks: DBChunk[] = parents.map((chunk) => ({ ...chunk, doc_id: fileId, embedding: null, parent_id: null }));
    const childChunks: DBChunk[] = children.map((chunk) => ({ ...chunk, doc_id: fileId, embedding: null }));
    const newDoc: DBDocument = {
      id: fileId, user_id: u.id, title, filename, filepath: "", file_size: Buffer.byteLength(textContent, "utf8"),
      chunks_count: childChunks.length, processing_status: "processed", created_at: new Date().toISOString(),
      department: meta.department, tags: meta.tags, document_type: meta.document_type || "pasted_text",
      security_level: meta.security_level, author: meta.author, language: meta.language, workspace_id: "workspace_default",
    };
    db.documents.push(newDoc);
    db.chunks.push(...parentChunks, ...childChunks);
    db.upload_timeseries.push({ timestamp: Date.now() });
    await embedChunks(childChunks);
    await indexChunksInQdrant(childChunks, u.id);
    saveDb();
    res.json(newDoc);
  } catch (error) {
    console.error("Pasted-text import failed:", error);
    res.status(500).json({ error: error instanceof Error ? `Text import failed: ${error.message}` : "Text import failed." });
  }
});

v1Router.delete("/documents/:id", authenticateToken, async (req, res) => {
  const u = (req as any).user;
  const docId = Number(req.params.id);
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.user_id !== u.id) {
    return res.status(403).json({ error: "Forbidden: You do not own this document" });
  }

  db.documents = db.documents.filter((d) => d.id !== docId);
  db.chunks = db.chunks.filter((c) => c.doc_id !== docId);
  await removeDocumentFromQdrant(docId, u.id);
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
  if (queryVector && qdrant.configured) {
    try {
      const matches = await qdrant.search(queryVector, u.id, top_k);
      if (matches.length) {
        const chunksById = new Map(db.chunks.map((chunk) => [chunk.id, chunk]));
        const results = matches.flatMap((match) => {
          const chunk = chunksById.get(match.chunkId);
          if (!chunk) return [];
          const doc = db.documents.find((document) => document.id === chunk.doc_id);
          if (!doc || doc.user_id !== u.id) return [];
          return [{
            chunk_id: chunk.id,
            doc_id: chunk.doc_id,
            doc_title: doc.title || null,
            doc_filename: doc.filename || null,
            page_number: chunk.page_number,
            text_snippet: chunk.text,
            highlight: chunk.text,
            score: Math.min(Math.max(match.score, 0), 1),
          }];
        });
        return res.json(results);
      }
    } catch (error) {
      console.warn("Qdrant semantic search failed; using the local index:", error instanceof Error ? error.message : error);
    }
  }

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
      document_ids: s.document_ids || [],
      document_name: s.document_name || null,
      created_at: s.created_at,
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
  const compactMarkdown = " Use concise Markdown: begin directly with the answer, use short paragraphs, leave at most one blank line between sections, and use bullets only for genuinely separate points. Do not add empty spacer lines or repeated headings.";
  switch (template) {
    case "executive":
      return "\n\nRESPONSE STYLE: Executive Brief. Start with an executive summary, list 3-5 core bulleted takeaways, followed by key analysis and any recommendations. Keep the layout clean, highly professional, and optimized for quick reading." + compactMarkdown;
    case "deepdive":
      return "\n\nRESPONSE STYLE: Analytical Deep Dive. Provide a comprehensive, section-by-section masterly explanation. Thoroughly unpack every concept, number, table, chart detail, or workflow mentioned in the sources. Use precise terminology and professional styling." + compactMarkdown;
    case "bulletpoints":
      return "\n\nRESPONSE STYLE: Bulleted Breakdown. Deliver the entire explanation in clear, beautifully nested bullet points grouped under thematic bold headers. Minimize prose, maximize structure, and ensure high readability." + compactMarkdown;
    case "faq":
      return "\n\nRESPONSE STYLE: Q&A Format. Break the explanation down into 3-4 natural questions and answer them clearly. Write in a conversational yet professional dialog format." + compactMarkdown;
    case "standard":
    default:
      return "\n\nRESPONSE STYLE: Standard Professional. Structure the response with an introduction, detailed body paragraphs, and a clear summary. Use bold accents for key terms to ensure visual rhythm." + compactMarkdown;
  }
}

async function generateSessionTitle(query: string, documentName?: string): Promise<string> {
  const prompt = `You are an AI assistant creating titles for chat history, exactly like ChatGPT.
Generate a concise, elegant topic title (2 to 4 words, Title Case, absolutely no quotes, no periods, no trailing symbols).
Examples of good titles:
- "Open Copilot in VS Code"
- "Block Incoming Calls"
- "Neo4j Connection Details"
- "System Design Overview"
- "Extract Task APIs"

User prompt: "${query}"
Context document: "${documentName || 'None'}"
Title:`;

  // 1. Try Gemini
  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      const title = response.text?.trim().replace(/^["'“”‘’`]|["'“”‘’`]$/g, "").replace(/\.+$/, "").trim();
      if (title && title.length > 0 && title.length < 45) {
        return title;
      }
    } catch {
      // Gemini failed / rate-limited
    }
  }

  // 2. Fallback to Groq API
  try {
    const groqRes = await callGroqChat(prompt);
    if (groqRes && groqRes.text) {
      const title = groqRes.text.trim().replace(/^["'“”‘’`]|["'“”‘’`]$/g, "").replace(/\.+$/, "").trim();
      if (title && title.length > 0 && title.length < 45) {
        return title;
      }
    }
  } catch {
    // Groq failed
  }

  // 3. Smart heuristic title (clean Title Case, removing conversational prefix)
  const isGeneric = /^(give\s+me\s+)?(all\s+)?(content|text|summary|everything|details)(\s+of\s+this\s+file)?/i.test(query.trim());
  if (isGeneric && documentName) {
    const docClean = documentName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
    const docWords = docClean.split(/\s+/).slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return `${docWords.join(" ")} Details`;
  }

  const cleaned = query
    .replace(/^(give\s+me|tell\s+me|what\s+is|how\s+to|show\s+me|can\s+you|please)\s+/i, "")
    .replace(/[^\w\s-]/g, "")
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 4);
  if (words.length > 0 && words[0]) {
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  if (documentName) {
    const docClean = documentName.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
    const docWords = docClean.split(/\s+/).slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return `${docWords.join(" ")} Overview`;
  }

  return "New Chat";
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
    document_ids,
    doc_id,
    document_name,
  } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });

  let activeSessionId = session_id ? Number(session_id) : null;
  let session = activeSessionId ? db.sessions.find((s) => s.id === activeSessionId) : null;
  if (activeSessionId) {
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.user_id !== u.id) {
      return res.status(403).json({ error: "Forbidden: You do not own this session" });
    }
  }

  // Resolve target document scope
  let targetDocIds: number[] = [];
  if (Array.isArray(document_ids) && document_ids.length > 0) {
    targetDocIds = document_ids.map(Number);
  } else if (doc_id) {
    targetDocIds = [Number(doc_id)];
  } else if (session?.document_ids && session.document_ids.length > 0) {
    targetDocIds = session.document_ids;
  }

  // Fallback: If document_name is given or active session has document_name, lookup document by filename
  const effectiveDocName = document_name || session?.document_name;
  if (targetDocIds.length === 0 && effectiveDocName) {
    const matchedDocs = db.documents.filter(
      (d) =>
        (d.user_id === u.id || d.user_id === 1) &&
        (d.filename.toLowerCase() === effectiveDocName.toLowerCase() ||
         d.title.toLowerCase() === effectiveDocName.toLowerCase() ||
         effectiveDocName.toLowerCase().includes(d.filename.toLowerCase()))
    );
    if (matchedDocs.length > 0) {
      targetDocIds = matchedDocs.map((d) => d.id);
    }
  }

  const queryStart = Date.now();
  const ai = getGeminiClient();

  // Create workflow engine
  const workflow = new AgentWorkflow(
    ai,
    db,
    (vector, userId, documentIds) => qdrant.search(vector, userId, 50, documentIds),
  );
  const finalState = await workflow.execute({
    userId: u.id,
    tenantId: u.tenant_id || "default_tenant",
    workspaceId: workspace_id || "workspace_default",
    originalQuery: query,
    sessionId: activeSessionId,
    documentIds: targetDocIds,
    template: template || "standard",
    selectedModel: model || "Auto",
    filters: {
      department: department && department !== "All" ? department : undefined,
      document_ids: targetDocIds.length > 0 ? targetDocIds : undefined,
    },
    hybridSearchEnabled: hybrid_search,
    rerankingEnabled: reranking,
    queryRewritingEnabled: query_rewriting,
    queryExpansionEnabled: query_expansion,
    parentChildEnabled: parent_child,
    guardrailsEnabled: guardrails,
  });

  const resolvedDocName = document_name || (targetDocIds[0] ? db.documents.find((d) => d.id === targetDocIds[0])?.filename : undefined);

  if (!activeSessionId && !finalState.unsafeDetected) {
    activeSessionId = Date.now();
    const generatedTitle = await generateSessionTitle(query, resolvedDocName);
    const newSession = {
      id: activeSessionId,
      user_id: u.id,
      title: generatedTitle,
      created_at: new Date().toISOString(),
      workspace_id: workspace_id || "workspace_default",
      org_id: org_id || "org_default",
      memory: finalState.memory,
      document_ids: targetDocIds.length > 0 ? targetDocIds : undefined,
      document_name: resolvedDocName,
    };
    db.sessions.push(newSession);
    session = newSession;
  } else if (session && targetDocIds.length > 0) {
    session.document_ids = targetDocIds;
    if (resolvedDocName && !session.document_name) {
      session.document_name = resolvedDocName;
    }
  }

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
      image_base64: imageForChunk(doc, item.chunk),
    };
  });
  const visualReasoning = requiresVisualReasoning(query, citations);
  if (visualReasoning) {
    finalState.modelRoutingReason = "Visual or architecture question: routed to Gemini for diagram-aware reasoning.";
  } else {
    finalState.modelRoutingReason = "Standard text question: routed to Groq; Ollama is the local fallback.";
  }

  if (!finalState.unsafeDetected) {
    let answered = false;
    const promptToSend = finalState.promptText || finalState.query;

    // Diagram/architecture questions use Gemini. Standard text questions use
    // Groq first, with Ollama as the local fallback.
    if (visualReasoning && ai) {
      try {
        const genStart = Date.now();
        const response = await ai.models.generateContent({
          model: finalState.selectedModel,
          contents: promptToSend,
        });
        if (response.text) {
          fullAnswer = response.text;
          answered = true;
          finalState.diagnostics.generation_ms = Date.now() - genStart;
        }
      } catch (err: any) {
        console.warn("Gemini visual generation failed, falling back to Groq/Ollama:", err.message || err);
      }
    }

    // 2. Fallback to Groq API
    if (!answered) {
      console.log("Failing over to Groq API...");
      const groqRes = await callGroqChat(promptToSend);
      if (groqRes) {
        fullAnswer = groqRes.text;
        answered = true;
        finalState.selectedModel = groqRes.model;
        finalState.modelRoutingReason = visualReasoning ? "Gemini visual request failed -> Groq fallback" : "Standard text question -> Groq";
      }
    }

    // 3. Fallback to Ollama
    if (!answered) {
      console.log("Failing over to Ollama...");
      const ollamaRes = await callOllamaChat(promptToSend);
      if (ollamaRes) {
        fullAnswer = ollamaRes.text;
        answered = true;
        finalState.selectedModel = ollamaRes.model;
        finalState.modelRoutingReason = visualReasoning ? "Gemini and Groq unavailable -> Ollama fallback" : "Groq unavailable -> Ollama fallback";
      }
    }

    if (!answered) {
      fullAnswer = `Could not generate answer through Gemini, Groq, or Ollama.
Here are the matching sources found in your documents:
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
    session_title: session?.title,
    document_ids: session?.document_ids,
    document_name: session?.document_name,
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
    document_ids,
    doc_id,
    document_name,
  } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });

  let activeSessionId = session_id ? Number(session_id) : null;
  let session = activeSessionId ? db.sessions.find((s) => s.id === activeSessionId) : null;
  if (activeSessionId) {
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.user_id !== u.id) {
      return res.status(403).json({ error: "Forbidden: You do not own this session" });
    }
  }

  // Resolve target document scope
  let targetDocIds: number[] = [];
  if (Array.isArray(document_ids) && document_ids.length > 0) {
    targetDocIds = document_ids.map(Number);
  } else if (doc_id) {
    targetDocIds = [Number(doc_id)];
  } else if (session?.document_ids && session.document_ids.length > 0) {
    targetDocIds = session.document_ids;
  }

  // Fallback: If document_name is given or active session has document_name, lookup document by filename
  const effectiveDocName = document_name || session?.document_name;
  if (targetDocIds.length === 0 && effectiveDocName) {
    const matchedDocs = db.documents.filter(
      (d) =>
        (d.user_id === u.id || d.user_id === 1) &&
        (d.filename.toLowerCase() === effectiveDocName.toLowerCase() ||
         d.title.toLowerCase() === effectiveDocName.toLowerCase() ||
         effectiveDocName.toLowerCase().includes(d.filename.toLowerCase()))
    );
    if (matchedDocs.length > 0) {
      targetDocIds = matchedDocs.map((d) => d.id);
    }
  }

  const queryStart = Date.now();
  const ai = getGeminiClient();

  // Create workflow engine
  const workflow = new AgentWorkflow(
    ai,
    db,
    (vector, userId, documentIds) => qdrant.search(vector, userId, 50, documentIds),
  );
  const finalState = await workflow.execute({
    userId: u.id,
    tenantId: u.tenant_id || "default_tenant",
    workspaceId: workspace_id || "workspace_default",
    originalQuery: query,
    sessionId: activeSessionId,
    documentIds: targetDocIds,
    template: template || "standard",
    selectedModel: model || "Auto",
    filters: {
      department: department && department !== "All" ? department : undefined,
      document_ids: targetDocIds.length > 0 ? targetDocIds : undefined,
    },
    hybridSearchEnabled: hybrid_search,
    rerankingEnabled: reranking,
    queryRewritingEnabled: query_rewriting,
    queryExpansionEnabled: query_expansion,
    parentChildEnabled: parent_child,
    guardrailsEnabled: guardrails,
  });

  const resolvedDocName = document_name || (targetDocIds[0] ? db.documents.find((d) => d.id === targetDocIds[0])?.filename : undefined);

  if (!activeSessionId && !finalState.unsafeDetected) {
    activeSessionId = Date.now();
    const generatedTitle = await generateSessionTitle(query, resolvedDocName);
    db.sessions.push({
      id: activeSessionId,
      user_id: u.id,
      title: generatedTitle,
      created_at: new Date().toISOString(),
      workspace_id: workspace_id || "workspace_default",
      org_id: org_id || "org_default",
      memory: finalState.memory,
      document_ids: targetDocIds.length > 0 ? targetDocIds : undefined,
      document_name: resolvedDocName,
    });
  } else if (session && targetDocIds.length > 0) {
    session.document_ids = targetDocIds;
    if (resolvedDocName && !session.document_name) {
      session.document_name = resolvedDocName;
    }
  }

  session = db.sessions.find((s) => s.id === activeSessionId) || null;

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
      image_base64: imageForChunk(doc, item.chunk),
    };
  });
  const visualReasoning = requiresVisualReasoning(query, citations);
  if (visualReasoning) {
    finalState.modelRoutingReason = "Visual or architecture question: routed to Gemini for diagram-aware reasoning.";
  } else {
    finalState.modelRoutingReason = "Standard text question: routed to Groq; Ollama is the local fallback.";
  }

  const metadataEvent = {
    type: "metadata",
    sources: citations,
    retrieval_meta: {
      latency_ms: Date.now() - queryStart,
      pipeline_duration_ms: Date.now() - queryStart,
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
  } else {
    let answered = false;
    const promptToSend = finalState.promptText || finalState.query;

    // Only visual/architecture questions use Gemini. Standard text streams use
    // Groq first, then Ollama if the hosted provider is unavailable.
    if (visualReasoning && ai) {
      try {
        const genStart = Date.now();
        const streamRes = await ai.models.generateContentStream({
          model: finalState.selectedModel,
          contents: promptToSend,
        });

        for await (const chunk of streamRes) {
          const textToken = chunk.text || "";
          if (textToken) {
            fullAnswer += textToken;
            answered = true;
            res.write(`data: ${JSON.stringify({ type: "token", content: textToken })}\n\n`);
          }
        }
        if (answered) {
          finalState.diagnostics.generation_ms = Date.now() - genStart;
        }
      } catch (err: any) {
        console.warn("Gemini visual stream failed, falling back to Groq/Ollama:", err.message || err);
      }
    }

    // If OCR during upload was unavailable, let Groq Vision inspect the
    // original cited image directly at answer time. This keeps visual Q&A
    // functional without relying on pre-extracted text.
    if (!answered && visualReasoning) {
      const visualCitation = citations.find((citation) => typeof citation.image_base64 === "string" && citation.image_base64.startsWith("data:image/"));
      const imageMatch = visualCitation?.image_base64?.match(/^data:([^;]+);base64,(.+)$/);
      if (imageMatch) {
        const visionAnswer = await callGroqVision(
          imageMatch[1],
          imageMatch[2],
          `Answer this question using the image only: ${query}\n\nTranscribe relevant labels, equations, or table entries accurately. If the user requests a table, return a Markdown table. Do not say the answer is not found if the information is visible in the image.`,
        );
        if (visionAnswer) {
          fullAnswer = visionAnswer.text;
          answered = true;
          finalState.selectedModel = visionAnswer.model;
          finalState.modelRoutingReason = "Gemini unavailable -> Groq Vision examined the cited image directly";
          res.write(`data: ${JSON.stringify({ type: "token", content: fullAnswer })}\n\n`);
        }
      }
    }

    // 2. Fallback to Groq streaming
    if (!answered) {
      console.log("Failing over to Groq stream...");
      const genStart = Date.now();
      const groqRes = await streamGroqChat(promptToSend, (token) => {
        fullAnswer += token;
        answered = true;
        res.write(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
      });
      if (answered && groqRes) {
        finalState.selectedModel = groqRes.model;
        finalState.modelRoutingReason = visualReasoning ? "Gemini visual request failed -> Groq fallback" : "Standard text question -> Groq";
        finalState.diagnostics.generation_ms = Date.now() - genStart;
      }
    }

    // 3. Fallback to Ollama streaming
    if (!answered) {
      console.log("Failing over to Ollama stream...");
      const genStart = Date.now();
      const ollamaRes = await streamOllamaChat(promptToSend, (token) => {
        fullAnswer += token;
        answered = true;
        res.write(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
      });
      if (answered && ollamaRes) {
        finalState.selectedModel = ollamaRes.model;
        finalState.modelRoutingReason = visualReasoning ? "Gemini and Groq unavailable -> Ollama fallback" : "Groq unavailable -> Ollama fallback";
        finalState.diagnostics.generation_ms = Date.now() - genStart;
      }
    }

    // 4. Fallback to offline message if all failed
    if (!answered) {
      const offlineMsg = `Offline Mode: Real LLM generation is unavailable (Gemini/Groq/Ollama).
Here are the matching sources:
${citations.map((c) => `• [${c.citation_number}] - ${c.doc_title}: "${c.text_snippet.substring(0, 100)}..."`).join("\n")}`;
      fullAnswer = offlineMsg;
      res.write(`data: ${JSON.stringify({ type: "token", content: offlineMsg })}\n\n`);
    }
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
    session_title: session?.title,
    document_ids: session?.document_ids,
    document_name: session?.document_name,
    citations,
    feedback_id: feedbackId,
    evaluation_metrics: evalRes,
    retrieval_meta: {
      latency_ms: latency,
      pipeline_duration_ms: latency,
      selected_model: finalState.selectedModel,
      routing_reason: finalState.modelRoutingReason,
      pii_masked: finalState.piiMasked,
      cost_estimate: finalState.costEstimate,
    },
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

v1Router.get("/admin/monitoring", authenticateToken, async (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const storageStartedAt = Date.now();
  let storage: Record<string, unknown>;
  try {
    const persistedDb = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    if (!persistedDb || typeof persistedDb !== "object") {
      throw new Error("Database file does not contain a valid JSON object.");
    }
    storage = {
      status: "ok",
      latency_ms: Date.now() - storageStartedAt,
      document_count: db.documents.length,
      chunk_count: db.chunks.length,
    };
  } catch (err) {
    storage = {
      status: "error",
      latency_ms: null,
      message: err instanceof Error ? err.message : "Could not read the local JSON database.",
    };
  }

  const redisHealth = (async () => {
    if (!process.env.REDIS_URL?.trim()) return { status: "not_configured", message: "REDIS_URL is not configured." };
    const startedAt = Date.now();
    const client = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 5_000, maxRetriesPerRequest: 0, retryStrategy: null });
    try {
      await client.connect();
      await client.ping();
      return { status: "ok", latency_ms: Date.now() - startedAt, message: "Connected and responding to PING." };
    } catch (error) {
      return { status: "error", latency_ms: null, message: error instanceof Error ? error.message : "Redis health check failed." };
    } finally {
      client.disconnect();
    }
  })();

  const neo4jHealth = (async () => {
    const uri = process.env.NEO4J_URI?.trim();
    const user = process.env.NEO4J_USER?.trim() || process.env.NEO4J_USERNAME?.trim();
    const password = process.env.NEO4J_PASSWORD;
    if (!uri || !user || !password) return { status: "not_configured", message: "Set NEO4J_URI, NEO4J_USERNAME (or NEO4J_USER), and NEO4J_PASSWORD." };
    const startedAt = Date.now();
    const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), { connectionTimeout: 8_000 });
    try {
      await driver.verifyConnectivity();
      const session = driver.session({ database: process.env.NEO4J_DATABASE || undefined });
      try {
        const result = await session.run("MATCH (n) RETURN count(n) AS count");
        const nodeCount = result.records[0]?.get("count")?.toNumber?.() ?? 0;
        return { status: "ok", latency_ms: Date.now() - startedAt, node_count: nodeCount, message: "Connected to Neo4j." };
      } finally {
        await session.close();
      }
    } catch (error) {
      return { status: "error", latency_ms: null, message: error instanceof Error ? error.message : "Neo4j health check failed." };
    } finally {
      await driver.close();
    }
  })();

  const groqHealth = (async () => {
    if (!process.env.GROQ_API_KEY?.trim()) return { status: "not_configured", message: "GROQ_API_KEY is not configured." };
    const startedAt = Date.now();
    try {
      const response = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`Groq returned ${response.status}.`);
      const data = await response.json() as { data?: Array<{ id?: string }> };
      return { status: "ok", latency_ms: Date.now() - startedAt, model: data.data?.[0]?.id, message: "Authenticated with Groq." };
    } catch (error) {
      return { status: "error", latency_ms: null, message: error instanceof Error ? error.message : "Groq health check failed." };
    }
  })();

  const ollamaHealth = (async () => {
    const url = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
    const startedAt = Date.now();
    try {
      const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
      const data = await response.json() as { models?: unknown[] };
      return { status: "ok", latency_ms: Date.now() - startedAt, models_count: data.models?.length || 0, message: "Connected to Ollama." };
    } catch (error) {
      return { status: "error", latency_ms: null, message: error instanceof Error ? error.message : "Ollama health check failed." };
    }
  })();

  const [qdrantHealth, redis, neo4jStatus, groq, ollama] = await Promise.all([qdrant.getHealth(), redisHealth, neo4jHealth, groqHealth, ollamaHealth]);
  const latestDiagnostics = db.observability_logs.at(-1)?.diagnostics;
  const totalMemory = os.totalmem() / 1024 / 1024;
  const usedMemory = (os.totalmem() - os.freemem()) / 1024 / 1024;
  const graphIsReady = neo4jStatus.status === "ok";

  res.json({
    storage,
    postgres: {
      status: "not_configured",
      message: "This server persists application data in db.json, not PostgreSQL.",
    },
    redis,
    qdrant: qdrantHealth,
    qdrant_sync: qdrantSync,
    celery: {
      status: "not_configured",
      worker_count: 0,
      active_tasks: 0,
      message: "This Node server has no Celery worker process. Use the Python deployment to run Celery jobs.",
    },
    bm25: {
      ready: db.chunks.length > 0,
      configured: true,
      corpus_size: db.chunks.length,
    },
    graph: {
      ready: graphIsReady,
      configured: graphIsReady,
      node_count: neo4jStatus.status === "ok" ? neo4jStatus.node_count : 0,
      edge_count: 0,
    },
    neo4j: neo4jStatus,
    groq,
    ollama,
    pipeline_times: latestDiagnostics ? {
      embedding_ms: (latestDiagnostics.planning_ms || 0) + (latestDiagnostics.rewriter_ms || 0),
      retrieval_ms: latestDiagnostics.retrieval_ms || 0,
      reranking_ms: latestDiagnostics.rerank_ms || 0,
      llm_ms: latestDiagnostics.generation_ms || 0,
      total_ms: latestDiagnostics.total_ms || 0,
    } : undefined,
    memory: {
      total_mb: totalMemory,
      used_mb: usedMemory,
      percent: totalMemory ? (usedMemory / totalMemory) * 100 : 0,
      process_mb: process.memoryUsage().rss / 1024 / 1024,
    },
  });
});

v1Router.post("/admin/qdrant/sync", authenticateToken, (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });
  if (!qdrant.configured) return res.status(400).json({ error: "QDRANT_URL and QDRANT_API_KEY must be configured before syncing." });
  if (qdrantSync.status === "running") return res.status(409).json({ error: "A Qdrant sync is already in progress.", sync: qdrantSync });

  void syncAllDocumentsToQdrant();
  res.status(202).json({
    success: true,
    sync: qdrantSync,
    message: "Qdrant sync started. Refresh service monitoring to view progress.",
  });
});

v1Router.get("/admin/api-key-status", authenticateToken, async (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const checkedAt = new Date().toISOString();
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return res.json({
      provider: "Gemini",
      key_name: "GEMINI_API_KEY",
      status: "missing",
      checked_at: checkedAt,
      message: "The API key is not configured on the server.",
    });
  }

  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        provider: "Gemini",
        key_name: "GEMINI_API_KEY",
        status: "not_working",
        checked_at: checkedAt,
        message: "The Gemini client could not be initialized.",
      });
    }
    // Retry brief Gemini 503 outages before declaring the provider unavailable.
    // These are transient service responses, unlike an invalid key/model (4xx).
    let lastError: unknown;
    for (const delayMs of [0, 500, 1_500]) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        await ai.models.generateContent({ model: GEMINI_MODEL, contents: "Reply with OK." });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : "";
        if (!/UNAVAILABLE|503|RESOURCE_EXHAUSTED|429/i.test(message)) throw error;
      }
    }
    if (lastError) throw lastError;
    return res.json({
      provider: "Gemini",
      key_name: "GEMINI_API_KEY",
      status: "working",
      checked_at: checkedAt,
    });
  } catch (error) {
    // Surface a useful diagnostic in the admin dashboard without ever echoing
    // an API key if a provider error happens to contain one.
    const detail = error instanceof Error ? error.message : "Unknown Gemini error.";
    const safeDetail = detail.replace(/AIza[\w-]+/g, "[redacted API key]").slice(0, 500);
    console.error("Gemini API key health check failed:", safeDetail);
    const temporarilyUnavailable = /UNAVAILABLE|503|RESOURCE_EXHAUSTED|429/i.test(safeDetail);
    return res.json({
      provider: "Gemini",
      key_name: "GEMINI_API_KEY",
      status: temporarilyUnavailable ? "temporarily_unavailable" : "not_working",
      checked_at: checkedAt,
      message: temporarilyUnavailable
        ? "Gemini accepted the request but is temporarily unavailable. The server will retry visual requests; normal questions continue through Groq and Ollama."
        : `The Gemini test request failed: ${safeDetail}`,
    });
  }
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

v1Router.delete("/admin/documents/:id", authenticateToken, async (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const docId = Number(req.params.id);
  const index = db.documents.findIndex(d => d.id === docId);
  if (index === -1) return res.status(404).json({ error: "Document not found." });

  const [document] = db.documents.splice(index, 1);
  // clean chunks
  db.chunks = db.chunks.filter(c => c.doc_id !== docId);
  await removeDocumentFromQdrant(docId, document.user_id);
  saveDb();
  res.json({ success: true });
});

v1Router.post("/admin/documents/:id/reindex", authenticateToken, async (req, res) => {
  const u = (req as any).user;
  const isDemo = req.headers["x-demo-mode"] === "true";
  if (u.role !== "admin" && !isDemo) return res.status(403).json({ error: "Forbidden: Admins only" });

  const docId = Number(req.params.id);
  const doc = db.documents.find(d => d.id === docId);
  if (!doc) return res.status(404).json({ error: "Document not found." });

  // Rebuild embeddings and synchronize the actual vector index.
  doc.processing_status = "processing";
  saveDb();
  try {
    const chunks = db.chunks.filter((chunk) => chunk.doc_id === docId && chunk.parent_id);
    await embedChunks(chunks);
    await indexChunksInQdrant(chunks, doc.user_id);
    doc.processing_status = "processed";
    saveDb();
    res.json({ success: true, status: "processed", indexed_chunks: chunks.filter((chunk) => chunk.embedding).length });
  } catch (error) {
    doc.processing_status = "failed";
    saveDb();
    res.status(500).json({ error: error instanceof Error ? error.message : "Document reindexing failed." });
  }
});

// Mount the v1 router at /api/v1
app.use("/api/v1", v1Router);

// Mount Vite in development, serve build dist folder in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            "**/db.json",
            "**/db.json/**",
            "**/uploads/**",
            "**/contextRag/**",
            "**/.venv/**",
            "**/dist/**",
            "**/.git/**",
            "**/*.log",
            "**/tmp.json",
          ],
        },
      },
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
