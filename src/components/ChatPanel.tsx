import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, Volume2, VolumeX, RefreshCw, SlidersHorizontal, Globe, Share2, Zap, ChevronDown, ChevronUp, FileText, ShieldCheck, Clock } from "lucide-react";
import { CitationList } from "./CitationList";
import { FeedbackButtons } from "./FeedbackButtons";
import { ThinkingProcess } from "./ThinkingProcess";
import { apiImportText, apiImportWebPage, apiUploadDocument } from "../api";
import { useComposerUpload } from "./UploadPanel";
import type { FileUploadState } from "./UploadPanel";
import type { ChatMessage, Citation, RetrievalDiagnostics, SessionSummary } from "../types";

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
  activeSession?: SessionSummary | null;
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
      documentIds?: number[];
      documentName?: string;
    },
    attachments?: AttachedFile[]
  ) => void;
  onStop?: () => void;
  loading: boolean;
  streaming: boolean;
  error: string | null;
  showDiagnostics?: boolean;
  onToggleDiagnostics?: (v: boolean) => void;
  lastDiagnostics?: RetrievalDiagnostics | null;
  onCitationClick: (citation: Citation) => void;
  token: string;
};

export type AttachedFile = {
  id: string;
  name: string;
  type: string;
  dataUrl?: string;   // base64 preview for images
  uploaded: boolean;
  uploadError?: string;
  docId?: number;
  alreadyExists?: boolean;
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
  activeSession,
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

  const [expandedDetails, setExpandedDetails] = useState<Record<string | number, boolean>>({});
  const toggleDetails = (id: string | number) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [expandedTraces, setExpandedTraces] = useState<Record<string | number, boolean>>({});
  const toggleTrace = (id: string | number) => {
    setExpandedTraces((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [isListening, setIsListening] = useState(false);
  const [micNotification, setMicNotification] = useState<{ text: string; isError: boolean } | null>(null);
  const recognitionRef = useRef<any>(null);

  // Pending attachments — files attached before sending
  const [pendingAttachments, setPendingAttachments] = useState<AttachedFile[]>([]);
  const [importingSource, setImportingSource] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

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
    fileStates,
    status: uploadStatus,
    error: uploadError,
    openFilePicker,
    handleFileChange: _handleFileChange,
    clearStatus,
    accept,
  } = useComposerUpload(token);

  // Custom file change handler that also creates attachment preview chips
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Show pending attachment chips immediately
    const newAttachments: AttachedFile[] = await Promise.all(
      files.map(async (f) => {
        let dataUrl: string | undefined;
        if (f.type.startsWith("image/")) {
          dataUrl = await readFileAsDataUrl(f);
        }
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: f.name,
          type: f.type,
          dataUrl,
          uploaded: false,
        };
      })
    );
    setPendingAttachments((prev) => [...prev, ...newAttachments]);

    // Trigger actual upload
    try {
      const uploadResults = await _handleFileChange(e);

      // Reflect each upload result on its corresponding attachment.
      setPendingAttachments((prev) =>
        prev.map((attachment) => {
          const index = newAttachments.findIndex((item) => item.id === attachment.id);
          if (index < 0) return attachment;
          const result = uploadResults && uploadResults[index];
          return {
            ...attachment,
            uploaded: result ? result.status === "done" : true,
            uploadError: result?.status === "error" ? result.error : undefined,
            docId: result?.docId,
            alreadyExists: result?.alreadyExists,
          };
        })
      );
    } catch (err: any) {
      setPendingAttachments((prev) =>
        prev.map((attachment) => {
          const isNew = newAttachments.some((item) => item.id === attachment.id);
          if (!isNew) return attachment;
          return {
            ...attachment,
            uploaded: false,
            uploadError: err instanceof Error ? err.message : "Upload failed",
          };
        })
      );
    }
  };

  // Read file as base64 dataURL
  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Ctrl+V paste to upload image from clipboard
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (!imageItems.length) {
      const pasted = e.clipboardData.getData("text/plain").trim();
      if (pasted && !importingSource && isStandaloneUrl(pasted)) {
        e.preventDefault();
        void importWebPage(pasted);
      } else if (pasted && !importingSource && isLongPastedSource(pasted)) {
        e.preventDefault();
        void importPastedText(pasted);
      }
      return;
    }

    e.preventDefault();
    const files = imageItems
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];

    // Build preview chips
    const newAttachments: AttachedFile[] = await Promise.all(
      files.map(async (f, i) => {
        const name = f.name && f.name !== "image.png" ? f.name : `pasted-image-${Date.now()}-${i}.png`;
        const namedFile = new File([f], name, { type: f.type });
        const dataUrl = await readFileAsDataUrl(namedFile);
        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name,
          type: namedFile.type,
          dataUrl,
          uploaded: false,
        };
      })
    );
    setPendingAttachments((prev) => [...prev, ...newAttachments]);

    // Upload each pasted image
    for (let i = 0; i < files.length; i++) {
      const name = newAttachments[i].name;
      try {
        await apiUploadDocument(token, new File([files[i]], name, { type: files[i].type }));
        setPendingAttachments((prev) =>
          prev.map((a) => (a.id === newAttachments[i].id ? { ...a, uploaded: true } : a))
        );
      } catch (err) {
        setPendingAttachments((prev) =>
          prev.map((a) =>
            a.id === newAttachments[i].id
              ? { ...a, uploaded: false, uploadError: err instanceof Error ? err.message : "Upload failed" }
              : a
          )
        );
      }
    }
  };

  const removePendingAttachment = (id: string) =>
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));

  const importWebPage = async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url || importingSource) return;
    const attachmentId = `url-${Date.now()}`;
    setPendingAttachments((current) => [...current, {
      id: attachmentId, name: "Adding web page…", type: "text/html", uploaded: false,
    }]);
    setImportingSource(true);
    setMicNotification(null);
    try {
      const document = await apiImportWebPage(token, url);
      const attachment: AttachedFile = {
        id: attachmentId,
        name: document.title || url,
        type: "text/html",
        uploaded: true,
        docId: document.id,
        alreadyExists: Boolean((document as any).already_exists),
      };
      setPendingAttachments((current) => current.map((item) => item.id === attachmentId ? attachment : item));
      setMicNotification({ text: `Web page ready: ${attachment.name}`, isError: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Web-page import failed.";
      setPendingAttachments((current) => current.map((item) => item.id === attachmentId ? { ...item, uploadError: message } : item));
      setMicNotification({ text: message, isError: true });
    } finally {
      setImportingSource(false);
    }
  };

  const importPastedText = async (rawText: string) => {
    const text = rawText.trim();
    if (text.length < 20 || importingSource) return;
    const attachmentId = `text-${Date.now()}`;
    setPendingAttachments((current) => [...current, {
      id: attachmentId, name: "Adding pasted text…", type: "text/plain", uploaded: false,
    }]);
    setImportingSource(true);
    setMicNotification(null);
    try {
      const document = await apiImportText(token, text, "Pasted notes");
      const attachment: AttachedFile = {
        id: attachmentId,
        name: document.title || "Pasted notes",
        type: "text/plain",
        uploaded: true,
        docId: document.id,
      };
      setPendingAttachments((current) => current.map((item) => item.id === attachmentId ? attachment : item));
      setMicNotification({ text: "Pasted text is ready for questions.", isError: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Text import failed.";
      setPendingAttachments((current) => current.map((item) => item.id === attachmentId ? { ...item, uploadError: message } : item));
      setMicNotification({ text: message, isError: true });
    } finally {
      setImportingSource(false);
    }
  };

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

  const isStandaloneUrl = (value: string) => /^https?:\/\/[^\s]+$/i.test(value.trim());
  const isLongPastedSource = (value: string) => value.trim().length >= 350 && (/\n/.test(value) || /[.!?]\s+[A-Z]/.test(value));

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (pendingAttachments.some((attachment) => !attachment.uploaded)) return;
    if (loading || streaming || uploading) return;

    // The one chat composer also accepts sources: paste a link or a large
    // text block, then ask a normal question once its attachment appears.
    if (pendingAttachments.length === 0 && isStandaloneUrl(text)) {
      setInput("");
      await importWebPage(text);
      return;
    }
    if (pendingAttachments.length === 0 && isLongPastedSource(text)) {
      setInput("");
      await importPastedText(text);
      return;
    }
    
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    const finalText = text || (pendingAttachments.length > 0 ? `[Uploaded: ${pendingAttachments.map(a => a.name).join(", ")}]` : "");
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    const attachmentsToSend = [...pendingAttachments];
    setPendingAttachments([]);

    const attachedDocIds = attachmentsToSend
      .map((a) => a.docId)
      .filter((id): id is number => typeof id === "number");
    const attachedDocName = attachmentsToSend.map((a) => a.name).join(", ");

    const targetDocIds = attachedDocIds.length > 0 ? attachedDocIds : activeSession?.document_ids;
    const targetDocName = attachedDocName || activeSession?.document_name;

    onSend(finalText, selectedTemplate, {
      model: overrideModel,
      department: departmentFilter,
      hybridSearch,
      reranking,
      queryRewriting,
      queryExpansion,
      parentChild,
      guardrails,
      documentIds: targetDocIds,
      documentName: targetDocName,
    }, attachmentsToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const canSend =
    (input.trim().length > 0 || pendingAttachments.length > 0) &&
    pendingAttachments.every((attachment) => attachment.uploaded) &&
    !importingSource &&
    !loading &&
    !streaming &&
    !uploading;
  const inputDisabled = (loading && !streaming) || uploading;

  return (
    <div className="chat-panel flex flex-col flex-1 min-h-0 overflow-hidden" id="chat-panel">
      <div className="chat-panel-scroll flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="chat-window flex-1 overflow-y-auto pr-2 space-y-4">
          {/* ChatGPT / Document Header Banner */}
          {(activeSession?.document_name || activeSession?.title) && (
            <div className="mb-2 p-3.5 rounded-2xl bg-gradient-to-r from-zinc-900/90 via-zinc-900/60 to-zinc-950/80 border border-zinc-800/80 shadow-md flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0 text-orange-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-zinc-100 truncate font-sans">
                    Ask About {activeSession?.document_name || activeSession?.title}
                  </h3>
                  <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                    <span>Answers are grounded in <strong>{activeSession?.document_name || activeSession?.title}</strong></span>
                  </p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-950/80 border border-zinc-800 text-[10px] font-mono text-zinc-400 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verified Source</span>
              </div>
            </div>
          )}

          {messages.length === 0 && (
            <div className="chat-empty py-16 text-center" id="chat-empty-greeting">
              <h2 className="text-2xl font-bold font-sans text-zinc-100 mb-2">
                {activeSession?.document_name ? `Ask anything about ${activeSession.document_name}` : "Ask anything about your documents"}
              </h2>
              <p className="muted-text text-sm text-zinc-400">
                Upload documents with the paperclip, then ask questions.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={msg.id ?? idx} className={`message-bubble font-sans p-5 rounded-2xl max-w-full ${msg.role}`}>
              <div className="message-role text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 flex items-center gap-2">
                <span>{msg.role === "assistant" ? "AI Studio" : msg.role === "user" ? "You" : "System"}</span>
                {/* Router mode badge */}
                {msg.role === "assistant" && msg.retrieval_meta?.router_mode && (
                  <span className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-zinc-400">
                    <Zap className="w-2.5 h-2.5 text-orange-400" />
                    {String(msg.retrieval_meta.router_mode).replace("RetrievalMode.", "").replace("_", " ")}
                  </span>
                )}
                {/* Web search badge */}
                {msg.role === "assistant" && (msg.retrieval_meta as any)?.web_search_used && (
                  <span className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-blue-400">
                    <Globe className="w-2.5 h-2.5" /> Web Search
                  </span>
                )}
                {/* Graph RAG badge */}
                {msg.role === "assistant" && (msg.retrieval_meta?.graph_candidates ?? 0) > 0 && (
                  <span className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-purple-400">
                    <Share2 className="w-2.5 h-2.5" /> Graph
                  </span>
                )}
              </div>
              {msg.role === "assistant" && (
                <ThinkingProcess
                  diagnostics={msg.diagnostics}
                  citationsCount={msg.citations?.length || 0}
                  isStreaming={msg.isStreaming}
                />
              )}
              {/* Attachment chips inside user message — like ChatGPT */}
              {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {msg.attachments.map((att, ai) => (
                    <div
                      key={ai}
                      className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2 max-w-[220px] group"
                    >
                      {att.dataUrl ? (
                        <img
                          src={att.dataUrl}
                          alt={att.name}
                          className="w-10 h-10 rounded-lg object-cover border border-zinc-800 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-zinc-200 truncate">{att.name}</p>
                        <p className="text-[9px] text-zinc-500 mt-0.5">
                          {att.type.startsWith("image/") ? "Image" : att.type === "application/pdf" ? "PDF" : att.type.includes("word") ? "DOCX" : "Document"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="message-content text-zinc-200 text-sm leading-relaxed">
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
              {msg.role === "assistant" && msg.citations?.some((citation) => citation.image_base64) && (
                <div className="mt-3 overflow-hidden rounded-xl border border-orange-500/20 bg-zinc-950/60">
                  {Array.from(new Map(msg.citations.filter((citation) => citation.image_base64).map((citation) => [citation.image_base64, citation])).values()).slice(0, 2).map((citation) => (
                    <button
                      key={citation.chunk_id}
                      type="button"
                      onClick={() => setZoomImage({ src: citation.image_base64!, title: `${citation.doc_title || "Document visual"}${citation.page_number ? ` — Page ${citation.page_number}` : ""}` })}
                      className="block w-full border-b border-zinc-800 last:border-b-0 p-2 text-left transition hover:bg-zinc-900/70"
                      title="Open referenced diagram"
                    >
                      <span className="mb-1 block text-[11px] font-semibold text-orange-300">Referenced diagram{citation.page_number ? ` — Page ${citation.page_number}` : ""}</span>
                      <img src={citation.image_base64!} alt="Referenced document diagram" className="max-h-64 w-full rounded-lg object-contain" />
                    </button>
                  ))}
                </div>
              )}
              {msg.role === "assistant" && !msg.isStreaming && (
                <div className="message-actions-bar flex flex-wrap items-center justify-between gap-2.5 mt-3 pt-3 border-t border-zinc-900/60 text-xs text-zinc-400 font-sans">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Grounded in document pill */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-semibold text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="truncate max-w-[220px]" title={activeSession?.document_name || (msg.citations && msg.citations[0]?.doc_filename) || "Knowledge Base"}>
                        Grounded in {activeSession?.document_name || (msg.citations && msg.citations[0]?.doc_filename) || "Knowledge Base"}
                      </span>
                    </div>

                    {/* Latency / Model pill */}
                    {typeof msg.retrieval_meta?.pipeline_duration_ms === "number" && !isNaN(msg.retrieval_meta.pipeline_duration_ms) ? (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">
                        <Clock className="w-3 h-3 text-orange-400" />
                        <span>{(msg.retrieval_meta.pipeline_duration_ms / 1000).toFixed(2)}s</span>
                      </div>
                    ) : typeof msg.retrieval_meta?.latency_ms === "number" && !isNaN(msg.retrieval_meta.latency_ms) ? (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">
                        <Clock className="w-3 h-3 text-orange-400" />
                        <span>{(msg.retrieval_meta.latency_ms / 1000).toFixed(2)}s</span>
                      </div>
                    ) : null}

                    {/* Toggle Details button - Hide/Show other contents */}
                    {(Boolean(msg.citations?.length) || Boolean(msg.evaluation_metrics) || Boolean(msg.retrieval_meta)) && (
                      <button
                        type="button"
                        onClick={() => toggleDetails(msg.id ?? idx)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition border cursor-pointer ${
                          expandedDetails[msg.id ?? idx]
                            ? "bg-orange-500/15 border-orange-500/40 text-orange-400"
                            : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                        }`}
                      >
                        <span>{expandedDetails[msg.id ?? idx] ? "Hide Details" : "Show Details"}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedDetails[msg.id ?? idx] ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id?.toString() || idx.toString(), msg.content)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-850 bg-zinc-900/30 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-700 transition duration-150 cursor-pointer"
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
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition duration-150 cursor-pointer ${
                        speakingMsgId === (msg.id?.toString() || idx.toString())
                          ? "bg-orange-500/15 border-orange-500 text-orange-400"
                          : "bg-zinc-900/30 border-zinc-850 text-zinc-300 hover:text-white hover:border-zinc-700"
                      }`}
                      title="Read response aloud"
                    >
                      {speakingMsgId === (msg.id?.toString() || idx.toString()) ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5 text-orange-400" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Speak</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRegenerate(idx)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-850 bg-zinc-900/30 text-[11px] text-zinc-300 hover:text-white hover:border-zinc-700 transition duration-150 cursor-pointer"
                      title="Regenerate this response"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>

                    <FeedbackButtons feedbackId={msg.feedback_id} token={token} />
                  </div>
                </div>
              )}

              {/* Collapsible Details: Referenced diagrams, citations, and evaluation */}
              {msg.role === "assistant" && expandedDetails[msg.id ?? idx] && (
                <div className="mt-3.5 pt-3.5 border-t border-zinc-900 flex flex-col gap-3">
                  {msg.citations && msg.citations.length > 0 && (() => {
                    const imageCitations = msg.citations.filter((c) => c.image_base64);
                    const uniqueImageCitations = Array.from(
                      new Map(imageCitations.map((c) => [c.image_base64, c])).values()
                    );
                    if (uniqueImageCitations.length === 0) return null;

                    return (
                      <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 shadow-inner" id={`visual-context-${msg.id ?? idx}`}>
                        <div className="flex items-center gap-2 mb-3">
                          <svg className="w-4 h-4 text-orange-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs font-bold uppercase tracking-wider text-orange-400 font-sans">
                            Referenced Diagram / Visual Context
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
                                      {isExplExpanded ? "Hide Details" : "Explain Diagram"}
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

                  {msg.citations && msg.citations.length > 0 && (
                    <CitationList citations={msg.citations} onCitationClick={onCitationClick} />
                  )}

                  {(msg.evaluation_metrics || msg.retrieval_meta) && (() => {
                    const traceKey = msg.id ?? idx;
                    const isTraceExpanded = expandedTraces[traceKey] !== false; // expanded by default within details
                    return (
                      <div className="rounded-xl bg-zinc-950/80 border border-zinc-900 overflow-hidden font-sans shadow-md">
                        <button
                          type="button"
                          onClick={() => toggleTrace(traceKey)}
                          className="w-full flex items-center justify-between px-3.5 py-2 bg-zinc-900/30 hover:bg-zinc-900/60 transition text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                              Cognitive Trace & Evaluation
                            </span>
                            {msg.retrieval_meta?.selected_model && (
                              <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-[9px] font-mono text-zinc-300">
                                {msg.retrieval_meta.selected_model}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 text-[10px]">
                            <span>{isTraceExpanded ? "Collapse Trace" : "Expand Trace"}</span>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isTraceExpanded ? "rotate-180" : ""}`} />
                          </div>
                        </button>

                        {isTraceExpanded && (
                          <div className="p-4 border-t border-zinc-900 flex flex-col gap-3">
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
                      </div>
                    );
                  })()}
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
        {/* Per-file upload progress */}
        {fileStates.length > 0 && (
          <div className="px-3 py-2 bg-zinc-900/80 border border-zinc-800/60 rounded-xl mb-2 flex flex-col gap-1.5">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Uploading Files</span>
            {fileStates.map((fs: FileUploadState, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    fs.status === "done"
                      ? "bg-emerald-400"
                      : fs.status === "error"
                      ? "bg-red-400"
                      : fs.status === "uploading"
                      ? "bg-orange-400 animate-pulse"
                      : "bg-zinc-600"
                  }`}
                />
                <span className="flex-1 text-zinc-300 truncate">{fs.name}</span>
                <span
                  className={`font-bold shrink-0 ${
                    fs.status === "done"
                      ? "text-emerald-400"
                      : fs.status === "error"
                      ? "text-red-400"
                      : "text-orange-400"
                  }`}
                >
                  {fs.status === "done"
                    ? "✓ Done"
                    : fs.status === "error"
                    ? `✗ ${fs.error ?? "Failed"}`
                    : fs.status === "uploading"
                    ? "Uploading..."
                    : "Pending"}
                </span>
              </div>
            ))}
          </div>
        )}

        {(uploadStatus || uploadError || micNotification) && (
          <p className={`composer-toast text-xs font-mono py-1 text-center ${
            (uploadError || (micNotification && micNotification.isError)) ? "text-rose-400" : "text-green-400"
          }`}>
            {uploadError || uploadStatus || (micNotification && micNotification.text)}
          </p>
        )}

        <div className="composer-bar flex flex-col gap-2 p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl relative">
          {/* Pending attachment preview strip */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2 border-b border-zinc-800/60">
              {pendingAttachments.map((att) => (
                <div
                  key={att.id}
                  className="relative flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1.5 max-w-[180px] group"
                >
                  {att.dataUrl ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="w-8 h-8 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-md bg-orange-500/10 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-zinc-300 truncate">{att.name}</p>
                    <p className={`text-[9px] ${att.uploaded ? "text-emerald-400" : att.uploadError ? "text-red-400" : "text-orange-400 animate-pulse"}`}>
                      {att.uploaded ? "✓ Ready" : att.uploadError ? "Upload failed" : "Uploading..."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(att.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-zinc-700 hover:bg-red-500 rounded-full flex items-center justify-center text-[9px] text-zinc-300 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Main input row */}
          <div className="flex items-end gap-3 w-full">
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
                        <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
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
            onPaste={handlePaste}
            placeholder="Ask anything, paste a link, or paste long text…"
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
              onClick={() => void handleSubmit()}
              disabled={!canSend}
              aria-label="Send message"
              title="Send message"
              id="composer-submit-btn"
            >
              {loading ? <SpinnerIcon /> : <SendIcon />}
            </button>
          )}
          </div>{/* end main input row */}
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
