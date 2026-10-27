import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { AuthPanel } from "./components/AuthPanel";
import { ChatPanel } from "./components/ChatPanel";
import { SessionSidebar } from "./components/SessionSidebar";
import { PdfPreviewModal } from "./components/PdfPreviewModal";
import { DocumentsPage } from "./pages/DocumentsPage";
import { SearchPage } from "./pages/SearchPage";
import { AdminDashboard } from "./pages/AdminDashboard";
import { SettingsPage } from "./pages/SettingsPage";
import { EvaluationPage } from "./pages/EvaluationPage";
import {
  apiFetchSessionMessages,
  apiFetchSessions,
  apiGetMe,
  apiGetPreferences,
  apiLogin,
  apiRegister,
  apiSendMessage,
  apiStreamMessage,
} from "./api";
import type {
  ChatMessage,
  Citation,
  CitationPreviewTarget,
  RetrievalDiagnostics,
  SemanticSearchResult,
  SessionSummary,
  TokenResponse,
  User,
  UserPreferences,
} from "./types";

function AppShell() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("rag_access_token"));
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [lastDiagnostics, setLastDiagnostics] = useState<RetrievalDiagnostics | null>(null);
  const [previewTarget, setPreviewTarget] = useState<CitationPreviewTarget | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!token) { setUser(null); return; }
    apiGetMe(token)
      .then((profile) => { setUser(profile); setError(null); })
      .catch(() => { setError("Authentication expired."); handleSignOut(); });
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    void refreshSessionList();
    apiGetPreferences(token)
      .then((p) => setShowDiagnostics(p.show_retrieval_diagnostics))
      .catch(() => {});
  }, [token, user]);

  const handleSignOut = () => {
    localStorage.removeItem("rag_access_token");
    localStorage.removeItem("rag_refresh_token");
    setToken(null);
    setUser(null);
    setSessions([]);
    setActiveSession(null);
    setMessages([]);
    setError(null);
  };

  const scheduleToken = (response: TokenResponse) => {
    localStorage.setItem("rag_access_token", response.access_token);
    localStorage.setItem("rag_refresh_token", response.refresh_token);
    setToken(response.access_token);
  };

  const refreshSessionList = async () => {
    if (!token) return;
    try {
      const sessionList = await apiFetchSessions(token);
      setSessions(sessionList);
    } catch { /* ignore */ }
  };

  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      scheduleToken(await apiLogin(email, password));
      await refreshSessionList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (email: string, password: string, fullName: string) => {
    setLoading(true);
    try {
      await apiRegister(email, password, fullName);
      await handleLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const selectSession = async (session: SessionSummary) => {
    if (!token) return;
    setActiveSession(session);
    setMessages([]);
    setLoading(true);
    try {
      const sessionMessages = await apiFetchSessionMessages(token, session.id);
      setMessages(
        sessionMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          citations: m.sources,
        }))
      );
    } catch {
      setError("Could not load messages.");
    } finally {
      setLoading(false);
    }
  };

  const handleCitationClick = useCallback((citation: Citation) => {
    setPreviewTarget({
      docId: citation.doc_id,
      docTitle: citation.doc_title,
      docFilename: citation.doc_filename,
      pageNumber: citation.page_number,
      chunkId: citation.chunk_id,
      textSnippet: citation.text_snippet,
    });
  }, []);

  const handleSearchResultClick = (result: SemanticSearchResult) => {
    setPreviewTarget({
      docId: result.doc_id,
      docTitle: result.doc_title,
      docFilename: result.doc_filename,
      pageNumber: result.page_number,
      chunkId: result.chunk_id,
      textSnippet: result.highlight,
    });
  };

  const handleSendMessage = async (text: string) => {
    if (!token) return;

    setError(null);
    setStreaming(true);
    setLoading(true);

    setMessages((prev) => {
      const withUser = [...prev, { role: "user" as const, content: text }];
      return [...withUser, { role: "assistant" as const, content: "", isStreaming: true, citations: [] }];
    });

    abortRef.current = new AbortController();
    let fullAnswer = "";
    let citations: Citation[] = [];
    let feedbackId: string | undefined;
    let diagnostics: RetrievalDiagnostics | undefined;

    const updateAssistant = (patch: Partial<ChatMessage>) => {
      setMessages((prev) => {
        const updated = [...prev];
        const idx = updated.length - 1;
        if (idx >= 0 && updated[idx].role === "assistant") {
          updated[idx] = { ...updated[idx], ...patch };
        }
        return updated;
      });
    };

    try {
      await apiStreamMessage(
        token,
        text,
        activeSession?.id,
        (event) => {
          if (event.type === "token") {
            fullAnswer += event.content as string;
            updateAssistant({ content: fullAnswer, isStreaming: true });
          }
          if (event.type === "metadata") {
            citations = (event.sources as Citation[]) || [];
            const meta = event.retrieval_meta as Record<string, unknown>;
            if (meta?.latency_ms) {
              const lat = meta.latency_ms as Record<string, number>;
              diagnostics = {
                embedding_ms: lat.embedding_ms || 0,
                vector_ms: lat.vector_ms || 0,
                bm25_ms: lat.bm25_ms || 0,
                fusion_ms: lat.fusion_ms || 0,
                rerank_ms: lat.rerank_ms || 0,
                total_ms: lat.total_ms || 0,
                vector_candidates: (meta.vector_candidates as number) || 0,
                bm25_candidates: (meta.bm25_candidates as number) || 0,
                total_candidates: (meta.total_candidates as number) || 0,
                expanded_queries: (meta.expanded_queries as string[]) || [],
                cache_hit: false,
              };
              setLastDiagnostics(diagnostics);
            }
          }
          if (event.type === "final") {
            citations = (event.citations as Citation[]) || citations;
            feedbackId = event.feedback_id as string;
            setActiveSession((prev) => ({
              ...prev,
              id: event.session_id as number,
              title: prev?.title || `Chat ${new Date().toLocaleDateString()}`,
            } as SessionSummary));
          }
        },
        abortRef.current.signal
      );

      updateAssistant({
        content: fullAnswer,
        citations,
        feedback_id: feedbackId,
        diagnostics,
        isStreaming: false,
      });
      await refreshSessionList();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        try {
          const result = await apiSendMessage(token, text, activeSession?.id, { showDiagnostics });
          updateAssistant({
            content: result.answer,
            citations: result.citations,
            feedback_id: result.feedback_id,
            diagnostics: result.diagnostics ?? undefined,
            isStreaming: false,
          });
          if (result.diagnostics) setLastDiagnostics(result.diagnostics);
        } catch {
          setError("Unable to send message.");
          setMessages((prev) => prev.slice(0, -2));
        }
      }
    } finally {
      setStreaming(false);
      setLoading(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setLoading(false);
  };

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="screen-center">
          <AuthPanel onLogin={handleLogin} onRegister={handleRegister} loading={loading} error={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div className="brand-symbol">R</div>
          <div>
            <p className="brand-title">RAG Studio</p>
            <p className="brand-subtitle">Enterprise RAG Platform</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            Chat
          </NavLink>
          <NavLink to="/documents" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            Documents
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            Search
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            Settings
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/admin" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                Analytics
              </NavLink>
              <NavLink to="/evaluation" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
                Evaluation
              </NavLink>
            </>
          )}
        </nav>

        <Routes>
          <Route
            path="/"
            element={
              <>
                <div className="sidebar-actions">
                  <button type="button" className="primary-button" onClick={() => { setActiveSession(null); setMessages([]); }}>
                    + New Chat
                  </button>
                </div>
                <SessionSidebar sessions={sessions} activeSessionId={activeSession?.id} onSelect={selectSession} />
              </>
            }
          />
        </Routes>

        <div className="sidebar-footer">
          <p className="muted-text user-info">{user?.full_name || user?.email}</p>
          <button type="button" className="ghost-button signout-button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content-panel">
        <Routes>
          <Route
            path="/"
            element={
              <>
                <header className="page-header">
                  <h1>{activeSession?.title || "Ask anything"}</h1>
                </header>
                <ChatPanel
                  messages={messages}
                  onSend={handleSendMessage}
                  onStop={handleStop}
                  loading={loading}
                  streaming={streaming}
                  error={error}
                  showDiagnostics={showDiagnostics}
                  onToggleDiagnostics={setShowDiagnostics}
                  lastDiagnostics={lastDiagnostics}
                  onCitationClick={handleCitationClick}
                  token={token}
                />
              </>
            }
          />
          <Route path="/documents" element={
            token ? <DocumentsPage token={token} isAdmin={!!isAdmin} onPreview={(id, title, filename) =>
              setPreviewTarget({ docId: id, docTitle: title, docFilename: filename, pageNumber: 1, chunkId: "", textSnippet: "" })
            } /> : <Navigate to="/" />
          } />
          <Route path="/search" element={
            token ? <SearchPage token={token} onResultClick={handleSearchResultClick} /> : <Navigate to="/" />
          } />
          <Route path="/settings" element={
            token ? <SettingsPage token={token} onPreferencesChange={(p: UserPreferences) => setShowDiagnostics(p.show_retrieval_diagnostics)} /> : <Navigate to="/" />
          } />
          <Route path="/admin" element={
            token && isAdmin ? <AdminDashboard token={token} /> : <Navigate to="/" />
          } />
          <Route path="/evaluation" element={
            token && isAdmin ? <EvaluationPage token={token} isAdmin={!!isAdmin} /> : <Navigate to="/" />
          } />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>

      <PdfPreviewModal target={previewTarget} token={token} onClose={() => setPreviewTarget(null)} />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
