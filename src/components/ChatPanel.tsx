import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Volume2, VolumeX, RefreshCw, SlidersHorizontal } from "lucide-react";
import { CitationList } from "./CitationList";
import { FeedbackButtons } from "./FeedbackButtons";
import { RetrievalDebugPanel } from "./RetrievalDebugPanel";
import { ThinkingProcess } from "./ThinkingProcess";
import { useComposerUpload } from "./UploadPanel";
import type { ChatMessage, Citation, RetrievalDiagnostics } from "../types";

const TEMPLATE_OPTIONS = [
  {
    id: "standard",
    label: "Standard",
    desc: "Detailed paragraphs & summary",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    )
  },
  {
    id: "executive",
    label: "Executive Brief",
    desc: "Concise summary & action bulletpoints",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    )
  },
  {
    id: "deepdive",
    label: "Analytical Deep Dive",
    desc: "Rigorous detail-by-detail breakdown",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    )
  },
  {
    id: "bulletpoints",
    label: "Bulleted Breakdown",
    desc: "Nested bullet points & headers",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
    )
  },
  {
    id: "faq",
    label: "Q&A Format",
    desc: "FAQ style questions & answers",
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
];

type ChatPanelProps = {
  messages: ChatMessage[];
  onSend: (
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
  ) => void;
  onStop?: () => void;
  loading: boolean;
  streaming: boolean;
  error: string | null;
  showDiagnostics: boolean;
  onToggleDiagnostics: (v: boolean) => void;
  lastDiagnostics: RetrievalDiagnostics | null;
  onCitationClick: (citation: Citation) => void;
  token: string;
};

const MAX_INPUT_ROWS = 5;

function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="composer-spinner" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function ChatPanel({
  messages,
  onSend,
  onStop,
  loading,
  streaming,
  error,
  showDiagnostics,
  onToggleDiagnostics,
  lastDiagnostics,
  onCitationClick,
  token,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("standard");
  const [zoomImage, setZoomImage] = useState<{ src: string; title: string } | null>(null);
  const [showExplanationId, setShowExplanationId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [overrideModel, setOverrideModel] = useState("Auto");
  const [departmentFilter, setDepartmentFilter] = useState("All");

  const [hybridSearch, setHybridSearch] = useState(true);
  const [reranking, setReranking] = useState(true);
  const [queryRewriting, setQueryRewriting] = useState(true);
  const [queryExpansion, setQueryExpansion] = useState(true);
  const [parentChild, setParentChild] = useState(true);
  const [guardrails, setGuardrails] = useState(true);

  const [isListening, setIsListening] = useState(false);
  const [micNotification, setMicNotification] = useState<{ text: string; isError: boolean } | null>(null);
  const recognitionRef = useRef<any>(null);

  // Cancel speech synthesis and speech recognition on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Auto-clear mic notification
  useEffect(() => {
    if (!micNotification) return;
    const timer = window.setTimeout(() => setMicNotification(null), 4000);
    return () => window.clearTimeout(timer);
  }, [micNotification]);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      setMicNotification({ text: "Voice input stopped.", isError: false });
    } else {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SpeechRecognition) {
        setMicNotification({
          text: "Speech recognition is not supported in this browser. Please use Chrome or Safari.",
          isError: true,
        });
        return;
      }

      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = "en-US";

        rec.onstart = () => {
          setIsListening(true);
          setMicNotification({ text: "Listening... Speak now.", isError: false });
        };

        rec.onresult = (event: any) => {
          const transcript = event.results[event.results.length - 1][0].transcript;
          setInput((prev) => (prev ? prev + " " + transcript.trim() : transcript.trim()));
        };

        rec.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          let errorMsg = "Speech recognition error: " + event.error;
          if (event.error === "not-allowed") {
            errorMsg = "Microphone access denied. Please allow microphone access in settings.";
          } else if (event.error === "no-speech") {
            errorMsg = "No speech detected. Please try speaking again.";
          } else if (event.error === "network") {
            errorMsg = "Network error. Speech recognition requires internet connection.";
          }
          setMicNotification({ text: errorMsg, isError: true });
          setIsListening(false);
        };

        rec.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = rec;
        rec.start();
      } catch (err: any) {
        setMicNotification({ text: "Failed to start speech recognition.", isError: true });
        setIsListening(false);
      }
    }
  };

  const handleCopy = (msgId: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedMsgId(msgId);
        setTimeout(() => setCopiedMsgId(null), 2000);
      });
    }
  };

  const handleSpeak = (msgId: string, text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    } else {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/\[\d+\]/g, ""); // strip bracketed citations for better reading aloud
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.onend = () => setSpeakingMsgId(null);
      utterance.onerror = () => setSpeakingMsgId(null);
      window.speechSynthesis.speak(utterance);
      setSpeakingMsgId(msgId);
    }
  };

  const handleRegenerate = (msgIdx: number) => {
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        onSend(messages[i].content, selectedTemplate);
        break;
      }
    }
  };

  const preprocessContent = (content: string) => {
    return content.replace(/\[([0-9]+)\]/g, "[$1](#cit-$1)");
  };

  const {
    fileInputRef,
    uploading,
    status: uploadStatus,
    error: uploadError,
    openFilePicker,
    handleFileChange,
    clearStatus,
    accept,
  } = useComposerUpload(token);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streaming]);

  useEffect(() => {
    if (!uploadStatus && !uploadError) return;
    const timer = window.setTimeout(clearStatus, 4000);
    return () => window.clearTimeout(timer);
  }, [uploadStatus, uploadError, clearStatus]);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 22;
    const padding =
      Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
    const maxHeight = lineHeight * MAX_INPUT_ROWS + padding;

    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || loading || streaming || uploading) return;
    
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    onSend(text, selectedTemplate, {
      model: overrideModel,
      department: departmentFilter,
      hybridSearch,
      reranking,
      queryRewriting,
      queryExpansion,
      parentChild,
      guardrails,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = input.trim().length > 0 && !loading && !streaming && !uploading;
  const inputDisabled = (loading && !streaming) || uploading;

  return (
    <div className="chat-panel flex flex-col flex-1 min-h-0 overflow-hidden" id="chat-panel">
      <div className="chat-panel-scroll flex-1 flex flex-col min-h-0 overflow-hidden">
        <RetrievalDebugPanel
          diagnostics={lastDiagnostics}
          visible={showDiagnostics}
          onToggle={onToggleDiagnostics}
        />

        <div className="chat-window flex-1 overflow-y-auto pr-2 space-y-4">
          {messages.length === 0 && (
            <div className="chat-empty py-16 text-center" id="chat-empty-greeting">
              <h2 className="text-xl font-bold font-sans text-zinc-100 mb-2">
                Ask anything about your documents
              </h2>
              <p className="muted-text text-sm text-zinc-400">
                Upload documents with the paperclip, then ask questions. Citations appear below each answer.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={msg.id ?? idx} className={`message-bubble font-sans p-5 rounded-2xl max-w-full ${msg.role}`}>
              <div className="message-role text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">
                {msg.role === "assistant" ? "AI Studio" : msg.role === "user" ? "You" : "System"}
              </div>
              {msg.role === "assistant" && (
                <ThinkingProcess
                  diagnostics={msg.diagnostics}
                  citationsCount={msg.citations?.length || 0}
                  isStreaming={msg.isStreaming}
                />
              )}
              <div className="message-content text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
                      if (href && href.startsWith("#cit-")) {
                        const num = href.replace("#cit-", "");
                        return (
                          <span
                            onClick={(e) => {
                              e.preventDefault();
                              const citationEl = document.getElementById(`citation-card-num-${num}`);
                              if (citationEl) {
                                citationEl.scrollIntoView({ behavior: "smooth", block: "center" });
                                citationEl.classList.add("ring-2", "ring-orange-500", "ring-offset-2");
                                setTimeout(() => {
                                  citationEl.classList.remove("ring-2", "ring-orange-500", "ring-offset-2");
                                }, 2000);
                              }
                            }}
                            className="inline-flex items-center justify-center bg-orange-500/15 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 hover:border-orange-500/60 font-mono text-[9px] font-extrabold w-4 h-4 rounded-full mx-0.5 cursor-pointer align-super select-none transition-all duration-150"
                            title={`Source [${num}]`}
                            id={`citation-inline-${num}`}
                          >
                            {num}
                          </span>
                        );
                      }
                      return (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-400 underline hover:text-orange-300">
                          {children}
                        </a>
                      );
                    }
                  }}
                >
                  {preprocessContent(msg.content)}
                </ReactMarkdown>
                {msg.isStreaming && <span className="streaming-cursor ml-1">▊</span>}
              </div>
              {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                <>
                  {(() => {
                    const imageCitations = msg.citations.filter((c) => c.image_base64);
                    const uniqueImageCitations = Array.from(
                      new Map(imageCitations.map((c) => [c.doc_id, c])).values()
                    );
                    if (uniqueImageCitations.length === 0) return null;

                    return (
                      <div className="mt-4 p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 shadow-inner" id={`visual-context-${msg.id ?? idx}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <svg className="w-4 h-4 text-orange-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs font-bold uppercase tracking-wider text-orange-400 font-sans">
                            Referenced Slide / Visual Context
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {uniqueImageCitations.map((citation) => {
                            const isExplExpanded = showExplanationId === `${msg.id}-${citation.chunk_id}`;
                            return (
                              <div key={citation.chunk_id} className="flex flex-col bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden transition-all duration-200 hover:border-orange-500/30">
                                <div className="relative group aspect-video bg-black flex items-center justify-center cursor-zoom-in" onClick={() => setZoomImage({ src: citation.image_base64!, title: citation.doc_title || "Visual Context" })}>
                                  <img
                                    src={citation.image_base64!}
                                    alt={citation.doc_title || "Slide context"}
                                    className="object-contain w-full h-full max-h-40 transition-transform duration-300 group-hover:scale-105"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                                    <span className="text-xs font-semibold text-white bg-black/60 px-2.5 py-1.5 rounded-full border border-zinc-700">
                                      Click to Zoom
                                    </span>
                                  </div>
                                </div>
                                <div className="p-3 flex flex-col flex-1 justify-between gap-2">
                                  <div>
                                    <h4 className="text-xs font-bold text-zinc-100 line-clamp-1">{citation.doc_title}</h4>
                                    <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{citation.doc_filename}</p>
                                  </div>
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      className="text-[11px] font-bold text-orange-400 hover:text-orange-300 transition-colors py-1 px-2.5 rounded bg-orange-500/10 hover:bg-orange-500/20"
                                      onClick={() => setShowExplanationId(isExplExpanded ? null : `${msg.id}-${citation.chunk_id}`)}
                                    >
                                      {isExplExpanded ? "Hide Details" : "Explain Slide"}
                                    </button>
                                  </div>
                                </div>
                                {isExplExpanded && (
                                  <div className="p-3 border-t border-zinc-800 bg-zinc-950/90 text-xs text-zinc-300 leading-relaxed max-h-48 overflow-y-auto font-mono">
                                    <span className="font-sans font-bold text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">Extracted Information:</span>
                                    {citation.text_snippet}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  <CitationList citations={msg.citations} onCitationClick={onCitationClick} />
                </>
              )}
              {msg.role === "assistant" && (msg.evaluation_metrics || msg.retrieval_meta) && (
                <div className="mt-4 p-4 rounded-xl bg-zinc-950/90 border border-zinc-900 flex flex-col gap-3 font-sans shadow-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 pb-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                        Cognitive Trace & Evaluation
                      </span>
                    </div>
                    {msg.retrieval_meta?.selected_model && (
                      <span className="bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded text-[9px] font-bold text-zinc-300 font-mono">
                        Model: {msg.retrieval_meta.selected_model}
                      </span>
                    )}
                  </div>

                  {msg.retrieval_meta && (
                    <div className="text-[10px] text-zinc-400 flex flex-col gap-1.5 font-mono">
                      {msg.retrieval_meta.routing_reason && (
                        <p className="flex items-start gap-1">
                          <span className="text-zinc-500 font-bold shrink-0">Routing:</span>
                          <span className="text-zinc-300">{msg.retrieval_meta.routing_reason}</span>
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-0.5 text-zinc-500">
                        {msg.retrieval_meta.cost_estimate !== undefined && (
                          <span>Cost: <strong className="text-zinc-300">${msg.retrieval_meta.cost_estimate.toFixed(5)}</strong></span>
                        )}
                        {msg.retrieval_meta.pii_masked && (
                          <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/15">PII Masked</span>
                        )}
                      </div>
                    </div>
                  )}

                  {msg.evaluation_metrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-1">
                      {msg.evaluation_metrics.faithfulness !== undefined && (
                        <div className="bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900 flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Faithfulness</span>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-xs font-bold text-white font-mono">{(msg.evaluation_metrics.faithfulness * 100).toFixed(0)}%</span>
                            <div className="flex-1 h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-400" style={{ width: `${msg.evaluation_metrics.faithfulness * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )}
                      {msg.evaluation_metrics.context_precision !== undefined && (
                        <div className="bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900 flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Context Precision</span>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-xs font-bold text-white font-mono">{(msg.evaluation_metrics.context_precision * 100).toFixed(0)}%</span>
                            <div className="flex-1 h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-400" style={{ width: `${msg.evaluation_metrics.context_precision * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )}
                      {msg.evaluation_metrics.answer_relevancy !== undefined && (
                        <div className="bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900 flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Answer Relevancy</span>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-xs font-bold text-white font-mono">{(msg.evaluation_metrics.answer_relevancy * 100).toFixed(0)}%</span>
                            <div className="flex-1 h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-400" style={{ width: `${msg.evaluation_metrics.answer_relevancy * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )}
                      {msg.evaluation_metrics.context_recall !== undefined && (
                        <div className="bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-900 flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Context Recall</span>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-xs font-bold text-white font-mono">{(msg.evaluation_metrics.context_recall * 100).toFixed(0)}%</span>
                            <div className="flex-1 h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-400" style={{ width: `${msg.evaluation_metrics.context_recall * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {msg.role === "assistant" && !msg.isStreaming && (
                <div className="message-actions-bar flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-zinc-900/60 text-xs text-zinc-400 font-sans">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id?.toString() || idx.toString(), msg.content)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-850 bg-zinc-900/30 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-700 transition duration-150 cursor-pointer"
                      title="Copy response to clipboard"
                    >
                      {copiedMsgId === (msg.id?.toString() || idx.toString()) ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-green-400 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSpeak(msg.id?.toString() || idx.toString(), msg.content)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] transition duration-150 cursor-pointer ${
                        speakingMsgId === (msg.id?.toString() || idx.toString())
                          ? "bg-orange-500/15 border-orange-500 text-orange-400"
                          : "bg-zinc-900/30 border-zinc-850 text-zinc-300 hover:text-white hover:border-zinc-700"
                      }`}
                      title="Read response aloud"
                    >
                      {speakingMsgId === (msg.id?.toString() || idx.toString()) ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5 text-orange-400" />
                          <span>Stop Reading</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Read Aloud</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRegenerate(idx)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-850 bg-zinc-900/30 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-700 transition duration-150 cursor-pointer"
                      title="Regenerate this response"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Regenerate</span>
                    </button>
                  </div>

                  <FeedbackButtons feedbackId={msg.feedback_id} token={token} />
                </div>
              )}
            </div>
          ))}

          {loading && !streaming && (
            <div className="typing-indicator flex gap-1 items-center py-2" id="typing-loader">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-bounce"></span>
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-bounce delay-75"></span>
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-bounce delay-150"></span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && <p className="error-text text-sm text-red-400 py-2" id="chat-error-log">{error}</p>}
      </div>

      <div className="composer mt-auto pt-3 border-t border-zinc-900/40 bg-black/40">
        {(uploadStatus || uploadError || micNotification) && (
          <p className={`composer-toast text-xs font-mono py-1 text-center ${
            (uploadError || (micNotification && micNotification.isError)) ? "text-rose-400" : "text-green-400"
          }`}>
            {uploadError || uploadStatus || (micNotification && micNotification.text)}
          </p>
        )}

        <div className="composer-bar flex items-end gap-3 p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl relative">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={accept}
            onChange={handleFileChange}
            id="composer-file-input"
          />

          {/* AI Pipeline & Templates Dropdown Button */}
          <div className="relative shrink-0">
            <button
              type="button"
              className={`composer-icon-btn p-2 rounded-full border transition-all duration-200 cursor-pointer ${
                isDropdownOpen
                  ? "bg-orange-500/10 border-orange-500/40 text-orange-400"
                  : "border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
              }`}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-label="AI Pipeline & Templates"
              title="AI Pipeline & Templates"
              id="composer-pipeline-dropdown-btn"
            >
              <SlidersHorizontal className="w-[18px] h-[18px]" />
            </button>

            {isDropdownOpen && (
              <>
                {/* Click outside to close */}
                <div 
                  className="fixed inset-0 z-40 bg-transparent" 
                  onClick={() => setIsDropdownOpen(false)} 
                />
                
                {/* Dropdown Menu Container */}
                <div className="absolute left-0 bottom-full mb-3 w-[340px] max-w-[calc(100vw-32px)] rounded-2xl bg-zinc-950/95 border border-zinc-800/80 p-4 shadow-2xl backdrop-blur-md z-50 flex flex-col gap-4 animate-fadeIn">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 font-sans flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400" />
                      AI Pipeline & Templates
                    </span>
                    <button 
                      type="button" 
                      onClick={() => setIsDropdownOpen(false)}
                      className="text-[11px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Answering Template Style */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-500 font-sans block">
                      Answering Template Style
                    </span>
                    <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                      {TEMPLATE_OPTIONS.map((opt) => {
                        const isSelected = selectedTemplate === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setSelectedTemplate(opt.id);
                              // Keep menu open so user can configure other routing parameters too
                            }}
                            className={`flex items-start gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-all duration-150 border cursor-pointer ${
                              isSelected
                                ? "bg-orange-500/10 border-orange-500/30 text-orange-400"
                                : "bg-zinc-900/20 border-transparent text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"
                            }`}
                          >
                            <span className="mt-0.5 shrink-0">{opt.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="text-xs font-bold truncate">{opt.label}</span>
                                {isSelected && <Check className="w-3 h-3 text-orange-400 shrink-0" />}
                              </div>
                              <span className="text-[10px] text-zinc-500 block leading-tight mt-0.5 truncate">{opt.desc}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Routing Model & Workspace Filter */}
                  <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-zinc-900/40">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Target Engine</label>
                      <select
                        value={overrideModel}
                        onChange={(e) => setOverrideModel(e.target.value)}
                        className="bg-zinc-900 border border-zinc-850 p-1.5 text-xs rounded-lg text-zinc-300 outline-none w-full cursor-pointer"
                      >
                        <option value="Auto">Auto-dynamic</option>
                        <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Org Workspace</label>
                      <select
                        value={departmentFilter}
                        onChange={(e) => setDepartmentFilter(e.target.value)}
                        className="bg-zinc-900 border border-zinc-850 p-1.5 text-xs rounded-lg text-zinc-300 outline-none w-full cursor-pointer"
                      >
                        <option value="All">All Spaces</option>
                        <option value="Engineering">Engineering</option>
                        <option value="Finance">Finance</option>
                        <option value="Legal">Legal</option>
                        <option value="HR">HR Dept</option>
                      </select>
                    </div>
                  </div>

                  {/* Cognitive Pipeline Stages */}
                  <div className="pt-2.5 border-t border-zinc-900/40 flex flex-col gap-1.5">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">
                      Cognitive Pipeline Stages
                    </span>
                    <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                      <label className="flex items-center gap-2 text-[11px] text-zinc-400 select-none cursor-pointer hover:text-zinc-200 transition-colors">
                        <input
                          type="checkbox"
                          checked={hybridSearch}
                          onChange={(e) => setHybridSearch(e.target.checked)}
                          className="rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500 w-3.5 h-3.5 shrink-0 cursor-pointer"
                        />
                        <span className="truncate">Hybrid Search</span>
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-zinc-400 select-none cursor-pointer hover:text-zinc-200 transition-colors">
                        <input
                          type="checkbox"
                          checked={reranking}
                          onChange={(e) => setReranking(e.target.checked)}
                          className="rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500 w-3.5 h-3.5 shrink-0 cursor-pointer"
                        />
                        <span className="truncate">AI Reranking</span>
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-zinc-400 select-none cursor-pointer hover:text-zinc-200 transition-colors">
                        <input
                          type="checkbox"
                          checked={queryRewriting}
                          onChange={(e) => setQueryRewriting(e.target.checked)}
                          className="rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500 w-3.5 h-3.5 shrink-0 cursor-pointer"
                        />
                        <span className="truncate">Query Rewriter</span>
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-zinc-400 select-none cursor-pointer hover:text-zinc-200 transition-colors">
                        <input
                          type="checkbox"
                          checked={queryExpansion}
                          onChange={(e) => setQueryExpansion(e.target.checked)}
                          className="rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500 w-3.5 h-3.5 shrink-0 cursor-pointer"
                        />
                        <span className="truncate">Multi-Query</span>
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-zinc-400 select-none cursor-pointer hover:text-zinc-200 transition-colors">
                        <input
                          type="checkbox"
                          checked={parentChild}
                          onChange={(e) => setParentChild(e.target.checked)}
                          className="rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500 w-3.5 h-3.5 shrink-0 cursor-pointer"
                        />
                        <span className="truncate">Parent-Child</span>
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-zinc-400 select-none cursor-pointer hover:text-zinc-200 transition-colors">
                        <input
                          type="checkbox"
                          checked={guardrails}
                          onChange={(e) => setGuardrails(e.target.checked)}
                          className="rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500 w-3.5 h-3.5 shrink-0 cursor-pointer"
                        />
                        <span className="truncate">Safety Guardrails</span>
                      </label>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            className="composer-icon-btn p-2 rounded-full border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition shrink-0 cursor-pointer"
            onClick={openFilePicker}
            disabled={uploading || inputDisabled}
            aria-label="Upload document"
            title="Upload document"
            id="composer-upload-picker-btn"
          >
            {uploading ? <SpinnerIcon /> : <PaperclipIcon />}
          </button>

          <button
            type="button"
            onClick={toggleListening}
            className={`composer-icon-btn p-2 rounded-full border transition-all duration-300 ${
              isListening
                ? "bg-red-500/20 border-red-500 text-red-500 animate-pulse scale-105 shadow-lg shadow-red-500/10"
                : "border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            }`}
            aria-label={isListening ? "Stop voice input" : "Voice input"}
            title={isListening ? "Listening... Click to stop" : "Voice input"}
            id="composer-mic-btn"
          >
            <MicIcon />
          </button>

          <textarea
            ref={textareaRef}
            className="composer-input flex-1 bg-transparent text-white placeholder-zinc-500 text-sm focus:outline-none resize-none max-h-32"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your documents..."
            rows={1}
            disabled={inputDisabled}
            id="composer-textarea"
          />

          {streaming ? (
            <button
              type="button"
              className="composer-send-btn p-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white transition"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating"
              id="composer-stop-btn"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              className="composer-send-btn p-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:hover:bg-orange-500 text-black font-bold transition"
              onClick={handleSubmit}
              disabled={!canSend}
              aria-label="Send message"
              title="Send message"
              id="composer-submit-btn"
            >
              {loading ? <SpinnerIcon /> : <SendIcon />}
            </button>
          )}
        </div>
      </div>

      {zoomImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md" onClick={() => setZoomImage(null)}>
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute -top-12 right-0 text-zinc-400 hover:text-white font-sans text-xs font-semibold flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-full"
              onClick={() => setZoomImage(null)}
            >
              <span>Close</span>
              <span className="text-xs">✕</span>
            </button>
            <img
              src={zoomImage.src}
              alt={zoomImage.title}
              className="object-contain max-w-full max-h-[80vh] rounded-xl border border-zinc-800 shadow-2xl"
            />
            <h3 className="text-xs font-bold text-zinc-200 mt-2 text-center px-4">{zoomImage.title}</h3>
          </div>
        </div>
      )}
    </div>
  );
}
