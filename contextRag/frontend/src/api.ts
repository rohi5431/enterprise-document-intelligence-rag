import type {
  ChatResponse,
  ChunkPreview,
  DocumentSummary,
  PlatformStats,
  SemanticSearchResult,
  SessionSummary,
  TokenResponse,
  User,
  UserPreferences,
  MessageResponse,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (init.body && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const err = await res.json();
      if (typeof err.detail === "string") detail = err.detail;
      else if (Array.isArray(err.detail)) detail = err.detail.map((d: { msg: string }) => d.msg).join(", ");
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function apiLogin(email: string, password: string): Promise<TokenResponse> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function apiRegister(email: string, password: string, full_name: string): Promise<User> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name }),
  });
}

export async function apiGetMe(token: string): Promise<User> {
  return request("/auth/me", { headers: authHeaders(token) });
}

export async function apiFetchSessions(token: string): Promise<SessionSummary[]> {
  return request("/chat/sessions", { headers: authHeaders(token) });
}

export async function apiFetchSessionMessages(token: string, sessionId: number): Promise<MessageResponse[]> {
  return request(`/chat/sessions/${sessionId}/messages`, { headers: authHeaders(token) });
}

export async function apiSendMessage(
  token: string,
  query: string,
  sessionId?: number,
  options?: { showDiagnostics?: boolean; expandQuery?: boolean }
): Promise<ChatResponse> {
  return request("/chat/message", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      query,
      session_id: sessionId,
      top_k: 10,
      final_top_k: 5,
      show_diagnostics: options?.showDiagnostics ?? false,
      expand_query: options?.expandQuery,
    }),
  });
}

export async function apiStreamMessage(
  token: string,
  query: string,
  sessionId: number | undefined,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/chat/message/stream`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ query, session_id: sessionId, top_k: 10, final_top_k: 3 }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("Streaming failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch { /* skip malformed */ }
      }
    }
  }
}

export async function apiSubmitFeedback(
  token: string,
  feedbackId: string,
  isHelpful: boolean
): Promise<void> {
  await request(`/feedback/${feedbackId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ rating: isHelpful ? 5 : 1, is_helpful: isHelpful ? 1 : 0 }),
  });
}

export async function apiFetchDocuments(
  token: string,
  search?: string
): Promise<{ documents: DocumentSummary[]; total: number }> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  return request(`/documents/?${params}`, { headers: authHeaders(token) });
}

export async function apiDeleteDocument(token: string, docId: number): Promise<void> {
  await request(`/documents/${docId}`, { method: "DELETE", headers: authHeaders(token) });
}

export function apiDocumentDownloadUrl(docId: number): string {
  return `${API_BASE_URL}/documents/${docId}/download`;
}

export async function apiFetchChunk(
  token: string,
  docId: number,
  chunkId: string
): Promise<ChunkPreview> {
  return request(`/documents/${docId}/chunks/${chunkId}`, { headers: authHeaders(token) });
}

export async function apiUploadDocument(
  token: string,
  file: File,
  title?: string
): Promise<DocumentSummary> {
  const form = new FormData();
  form.append("file", file);
  if (title) form.append("title", title);
  return request("/documents/upload", {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
}

export async function apiSemanticSearch(
  token: string,
  query: string,
  topK = 10
): Promise<SemanticSearchResult[]> {
  const params = new URLSearchParams({ q: query, top_k: String(topK) });
  return request(`/search/?${params}`, { headers: authHeaders(token) });
}

export async function apiGetPreferences(token: string): Promise<UserPreferences> {
  return request("/settings/preferences", { headers: authHeaders(token) });
}

export async function apiUpdatePreferences(
  token: string,
  prefs: Partial<UserPreferences>
): Promise<UserPreferences> {
  return request("/settings/preferences", {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(prefs),
  });
}

export async function apiGetAdminStats(token: string): Promise<PlatformStats> {
  return request("/admin/stats", { headers: authHeaders(token) });
}

export async function apiGetAdminTimeseries(token: string, days = 30) {
  return request(`/admin/analytics/timeseries?days=${days}`, { headers: authHeaders(token) });
}

export async function apiGetFeedbackAnalytics(token: string, days = 30) {
  return request(`/admin/analytics/summary?days=${days}`, { headers: authHeaders(token) });
}

export async function apiGetEvaluationLogs(token: string) {
  return request("/evaluation/logs", { headers: authHeaders(token) });
}

export async function apiRunEvaluation(
  token: string,
  payload: {
    query: string;
    answer: string;
    context: string;
    retrieved_ids?: string[];
    ground_truth_ids?: string[];
    ground_truth_answer?: string;
  }
) {
  return request("/evaluation/run", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}
