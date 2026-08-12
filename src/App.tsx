import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Brain, Cpu, Database, Sparkles, ShieldCheck, Check, FileText, Layers, Search, Terminal, ArrowRight, ChevronDown, MessageSquare, BarChart3, Award, Settings } from "lucide-react";
import ragWorkbenchPreview from "./assets/images/rag_workbench_preview_1782855207720.jpg";
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
  apiDeleteSession,
  apiFetchSessionMessages,
  apiFetchSessions,
  apiGetMe,
  apiGetPreferences,
  apiLogin,
  apiRegister,
  apiRenameSession,
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

  const location = useLocation();
  const navigate = useNavigate();
  const [navDropdownOpen, setNavDropdownOpen] = useState(false);

  const navOptions = useMemo(() => {
    const opts = [
      { path: "/", label: "Chat", icon: <MessageSquare className="w-3.5 h-3.5 text-orange-400 shrink-0" /> },
      { path: "/documents", label: "Documents", icon: <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" /> },
      { path: "/search", label: "Search", icon: <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" /> },
      { path: "/settings", label: "Settings", icon: <Settings className="w-3.5 h-3.5 text-zinc-400 shrink-0" /> },
    ];
    if (isAdmin) {
      opts.push(
        { path: "/admin", label: "Analytics", icon: <BarChart3 className="w-3.5 h-3.5 text-green-400 shrink-0" /> },
        { path: "/evaluation", label: "Evaluation", icon: <Award className="w-3.5 h-3.5 text-purple-400 shrink-0" /> }
      );
    }
    return opts;
  }, [isAdmin]);

  const currentNavOption = useMemo(() => {
    const currentPath = location.pathname;
    const match = navOptions.find((opt) => {
      if (opt.path === "/") {
        return currentPath === "/";
      }
      return currentPath.startsWith(opt.path);
    });
    return match || navOptions[0];
  }, [location.pathname, navOptions]);

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
      const response = await apiLogin(email, password);
      scheduleToken(response);
      const profile = await apiGetMe(response.access_token);
      setUser(profile);
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

  const deleteSession = async (sessionId: number) => {
    if (!token) return;
    try {
      await apiDeleteSession(token, sessionId);
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
        setMessages([]);
      }
      await refreshSessionList();
    } catch {
      setError("Could not delete conversation.");
    }
  };

  const renameSession = async (sessionId: number, newTitle: string) => {
    if (!token) return;
    try {
      await apiRenameSession(token, sessionId, newTitle);
      if (activeSession?.id === sessionId) {
        setActiveSession((prev) => prev ? { ...prev, title: newTitle } : null);
      }
      await refreshSessionList();
    } catch {
      setError("Could not rename conversation.");
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

  const handleSendMessage = async (
    text: string,
    template?: string,
    options?: {
      model?: string;
      department?: string;
      hybridSearch?: boolean;
      reranking?: boolean;
      queryRewriting?: boolean;
      queryExpansion?: boolean;
      parentChild?: boolean;
      guardrails?: boolean;
    }
  ) => {
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
    let evaluationMetrics: any = undefined;
    let retrievalMeta: any = undefined;

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
        template,
        options,
        (event) => {
          if (event.type === "token") {
            fullAnswer += event.content as string;
            updateAssistant({ content: fullAnswer, isStreaming: true });
          }
          if (event.type === "metadata") {
            citations = (event.sources as Citation[]) || [];
            retrievalMeta = event.retrieval_meta;
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
            evaluationMetrics = event.evaluation_metrics;
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
        evaluation_metrics: evaluationMetrics,
        retrieval_meta: retrievalMeta,
        isStreaming: false,
      });
      await refreshSessionList();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        try {
          const result = await apiSendMessage(token, text, activeSession?.id, {
            showDiagnostics,
            template,
            model: options?.model,
            department: options?.department,
            hybridSearch: options?.hybridSearch,
            reranking: options?.reranking,
            queryRewriting: options?.queryRewriting,
            queryExpansion: options?.queryExpansion,
            parentChild: options?.parentChild,
            guardrails: options?.guardrails,
          });
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

  if (!token || !user) {
    return (
      <div className="min-h-screen lg:h-screen bg-black text-zinc-100 flex items-center justify-start p-6 md:p-12 lg:p-16 xl:p-20 relative overflow-y-auto lg:overflow-hidden select-none" id="landing-container">
        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_20%_30%,rgba(255,122,0,0.05),transparent)] pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

        <div className="w-full max-w-7xl flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-24 xl:gap-28 relative z-10">
          
          {/* LEFT CONTENT: BRAND EXPERIENCE */}
          <div className="flex-1 space-y-6 lg:space-y-8 max-w-2xl lg:max-w-[640px] xl:max-w-[680px] w-full">
            {/* Top Logo and Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center font-black text-black text-lg shadow-lg shadow-orange-500/10">
                R
              </div>
              <div>
                <span className="text-[9px] font-extrabold tracking-widest text-orange-400 uppercase font-mono">
                  BETA 2.1
                </span>
                <h2 className="text-xl font-bold tracking-tight text-white font-sans">
                  RAG Studio
                </h2>
              </div>
            </div>

            {/* Main pitch */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-full">
                <Sparkles className="w-3 h-3 text-orange-400" />
                <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest font-mono">
                  Enterprise Document Intelligence
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white font-sans leading-tight">
                Analyze documents with <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">absolute precision</span>.
              </h1>
              <p className="text-xs lg:text-sm text-zinc-400 leading-relaxed font-sans font-normal">
                An advanced cognitive exploration workbench. Tuned with hybrid vector-keyword semantic indexers, neural rerankers, and deep citation analysis.
              </p>
            </div>

            {/* Concept Illustration */}
            <div className="relative group overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950/80 shadow-2xl max-h-[240px] sm:max-h-[300px]">
              <img
                src={ragWorkbenchPreview}
                alt="Document Intelligence Vector Space Representation"
                referrerPolicy="no-referrer"
                className="w-full h-56 sm:h-72 object-cover transition-all duration-700 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                <span className="flex items-center gap-1.5 text-orange-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping" />
                  RAG INDEX VISUALIZER
                </span>
                <span className="text-zinc-500 bg-black/60 px-1.5 py-0.5 rounded border border-zinc-800">
                  Dense Vector Space
                </span>
              </div>
            </div>

            {/* Core Value Pillars */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex gap-2">
                <Check className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[11px] font-bold text-zinc-200 font-sans uppercase tracking-wider">Overlapping Chunks</h4>
                  <p className="text-[10px] text-zinc-500 leading-normal font-sans mt-0.5">Maintains structural context across token splits.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Check className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[11px] font-bold text-zinc-200 font-sans uppercase tracking-wider">Evaluation Logs</h4>
                  <p className="text-[10px] text-zinc-500 leading-normal font-sans mt-0.5">Live grading of BLEU, ROUGE, and latency stats.</p>
                </div>
              </div>
            </div>

            {/* Footer Brand Line */}
            <div className="text-[9px] font-mono text-zinc-600 flex items-center justify-between pt-4 border-t border-zinc-900/60">
              <span>&copy; 2026 RAG Studio Inc. All rights reserved.</span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> ISO 27001 SECURE
              </span>
            </div>
          </div>

          {/* RIGHT PANE: SECURE ENTRY INTERFACE */}
          <div className="w-full lg:w-auto flex justify-center lg:justify-end shrink-0 pt-6 lg:pt-0 lg:ml-28 xl:ml-40 2xl:ml-48">
            <div className="relative w-full max-w-md">
              {/* Subtle background glow behind the form */}
              <div className="absolute -inset-4 bg-gradient-to-r from-orange-500/5 to-amber-500/5 rounded-2xl blur-2xl pointer-events-none" />
              <AuthPanel onLogin={handleLogin} onRegister={handleRegister} loading={loading} error={error} />
            </div>
          </div>

        </div>
      </div>
    );
  }

  if (user?.role === "admin") {
    return (
      <div className="app-shell" id="admin-only-shell">
        <aside className="sidebar select-none">
          <div className="brand-card">
            <div className="brand-symbol">R</div>
            <div>
              <p className="brand-title font-sans">RAG Studio</p>
              <p className="brand-subtitle font-sans tracking-wider text-[11px] text-zinc-400">Enterprise Console</p>
            </div>
          </div>

          <div className="flex-1 px-3 py-4 flex flex-col gap-4">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 mb-2 px-1 font-sans">
                System Administration
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-sans text-left transition-all bg-orange-500/10 text-orange-400 font-bold border-l-2 border-orange-500 rounded-r-xl"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="text-[12.5px] font-medium">Admin Console</span>
                </button>
              </div>
            </div>
          </div>

          <div className="sidebar-footer border-t border-zinc-900/40 pt-2">
            <p className="muted-text user-info text-zinc-400 font-sans text-xs">{user.full_name || user.email}</p>
            <div className="bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-bold text-center py-1.5 rounded-lg mt-1 select-none font-sans tracking-wider">
              SYSTEM ADMINISTRATOR
            </div>
            <button type="button" className="ghost-button signout-button text-xs py-1.5 rounded-xl border border-zinc-850 hover:border-red-500/30 text-zinc-300 w-full hover:text-red-400 mt-2 transition" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </aside>

        <main className="content-panel">
          <Routes>
            <Route path="/admin" element={<AdminDashboard token={token!} />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
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

        {/* Navigation Dropdown */}
        <div className="px-3 mb-4" id="sidebar-navigation-container">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 mb-1.5 px-0.5">
            Workspace Navigation
          </div>
          <div className="relative">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2 bg-zinc-950 border border-zinc-900 rounded-xl text-zinc-100 text-xs font-semibold hover:bg-zinc-900/80 hover:border-zinc-800 transition focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              onClick={() => setNavDropdownOpen(!navDropdownOpen)}
              id="sidebar-nav-dropdown-toggle"
            >
              <div className="flex items-center gap-2">
                {currentNavOption.icon}
                <span className="font-sans text-[12.5px] font-medium">{currentNavOption.label}</span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${navDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {navDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setNavDropdownOpen(false)}
                />
                <div className="absolute left-0 right-0 top-10 mt-1 bg-zinc-950 border border-zinc-900 rounded-xl shadow-2xl z-40 py-1 flex flex-col overflow-hidden" id="sidebar-nav-dropdown-menu">
                  {navOptions.map((opt) => {
                    const isSelected = opt.path === location.pathname || (opt.path === "/" && location.pathname === "/");
                    return (
                      <button
                        key={opt.path}
                        type="button"
                        onClick={() => {
                          navigate(opt.path);
                          setNavDropdownOpen(false);
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2.5 text-xs font-sans text-left transition-all ${
                          isSelected
                            ? "bg-orange-500/10 text-orange-400 font-bold border-l-2 border-orange-500"
                            : "text-zinc-400 hover:text-white hover:bg-zinc-900/55"
                        }`}
                        id={`nav-opt-${opt.path.replace("/", "root")}`}
                      >
                        {opt.icon}
                        <span className="text-[12px]">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <Routes>
          <Route
            path="/"
            element={
              <div className="flex flex-col flex-1 min-h-0">
                <div className="sidebar-actions mb-2.5">
                  <button type="button" className="primary-button font-bold text-[11px] py-1.5 text-black rounded-lg w-full" onClick={() => { setActiveSession(null); setMessages([]); }}>
                    + New Chat
                  </button>
                </div>
                <SessionSidebar sessions={sessions} activeSessionId={activeSession?.id} onSelect={selectSession} onDelete={deleteSession} onRename={renameSession} />
              </div>
            }
          />
          <Route path="*" element={null} />
        </Routes>

        <div className="sidebar-footer border-t border-zinc-900/40 pt-2">
          <p className="muted-text user-info text-zinc-400 font-sans text-xs">{user?.full_name || user?.email}</p>
          <button type="button" className="ghost-button signout-button text-xs py-1.5 rounded-xl border border-zinc-850 hover:border-red-500/30 text-zinc-300 w-full hover:text-red-400 mt-1 transition" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content-panel">
        <Routes>
          <Route
            path="/"
            element={
              <div className="flex flex-col flex-1 min-h-0">
                <header className="page-header mb-6">
                  <h1 className="text-2xl font-bold font-sans tracking-tight text-white">{activeSession?.title || "Ask anything"}</h1>
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
              </div>
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
