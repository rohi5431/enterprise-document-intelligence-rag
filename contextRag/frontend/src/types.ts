export type User = {
  id: number;
  email: string;
  full_name: string | null;
  role?: "admin" | "user";
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type Citation = {
  citation_number: number;
  chunk_id: string;
  doc_id: number;
  doc_title: string | null;
  doc_filename: string | null;
  filename?: string | null;
  page_number: number | null;
  text_snippet: string;
  score: number;
  rerank_score: number | null;
};

export type RetrievalDiagnostics = {
  embedding_ms: number;
  vector_ms: number;
  bm25_ms: number;
  fusion_ms: number;
  rerank_ms: number;
  total_ms: number;
  vector_candidates: number;
  bm25_candidates: number;
  total_candidates: number;
  expanded_queries: string[];
  cache_hit: boolean;
};

export type ChatMessage = {
  id?: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  citations?: Citation[];
  feedback_id?: string;
  diagnostics?: RetrievalDiagnostics;
  isStreaming?: boolean;
};

export type ChatResponse = {
  answer: string;
  query: string;
  session_id: number;
  message_id: number;
  feedback_id?: string;
  confidence: number;
  citations: Citation[];
  num_sources: number;
  retrieval_latency_ms: number;
  llm_latency_ms: number;
  total_latency_ms: number;
  cache_hit?: boolean;
  diagnostics?: RetrievalDiagnostics;
};

export type SessionSummary = {
  id: number;
  title: string | null;
  summary: string | null;
  message_count: number;
  is_active: boolean;
  created_at: string;
  last_message_at: string | null;
};

export type MessageResponse = {
  id: number;
  session_id: number;
  role: "user" | "assistant" | "system";
  content: string;
  sources: Citation[];
  created_at: string;
};

export type DocumentSummary = {
  id: number;
  title: string;
  filename: string;
  file_type: string | null;
  file_size: number;
  processing_status: string;
  chunks_count: number;
  owner_id: number | null;
  tags: string[];
  created_at: string;
  processed_at: string | null;
};

export type SemanticSearchResult = {
  chunk_id: string;
  doc_id: number;
  doc_title: string | null;
  doc_filename: string | null;
  page_number: number | null;
  text: string;
  score: number;
  highlight: string;
};

export type UserPreferences = {
  llm_provider: string;
  llm_model: string | null;
  query_expansion_enabled: boolean;
  show_retrieval_diagnostics: boolean;
  available_providers: string[];
  available_models: Record<string, string[]>;
};

export type PlatformStats = {
  total_users: number;
  active_users: number;
  total_documents: number;
  processed_documents: number;
  total_queries: number;
  avg_response_time_ms: number;
  cache_hit_ratio: number;
  total_feedback: number;
  avg_rating: number;
  failed_requests: number;
};

export type ChunkPreview = {
  chunk_id: string;
  doc_id: number;
  text: string;
  page_number: number | null;
  sequence_number: number | null;
};

export type CitationPreviewTarget = {
  docId: number;
  docTitle: string | null;
  docFilename: string | null;
  pageNumber: number | null;
  chunkId: string;
  textSnippet: string;
};
