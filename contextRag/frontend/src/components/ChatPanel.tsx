import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CitationList } from "./CitationList";
import { FeedbackButtons } from "./FeedbackButtons";
import { RetrievalDebugPanel } from "./RetrievalDebugPanel";
import { useComposerUpload } from "./UploadPanel";
import type { ChatMessage, Citation, RetrievalDiagnostics } from "../types";

type ChatPanelProps = {
  messages: ChatMessage[];
  onSend: (text: string) => void;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    onSend(text);
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
    <div className="chat-panel">
      <div className="chat-panel-scroll">
        <RetrievalDebugPanel
          diagnostics={lastDiagnostics}
          visible={showDiagnostics}
          onToggle={onToggleDiagnostics}
        />

        <div className="chat-window">
          {messages.length === 0 && (
            <div className="chat-empty">
              <h2>Ask anything about your documents</h2>
              <p className="muted-text">
                Upload documents with the paperclip, then ask questions. Citations appear below each answer.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={msg.id ?? idx} className={`message-bubble ${msg.role}`}>
              <div className="message-role">
                {msg.role === "assistant" ? "AI" : msg.role === "user" ? "You" : "System"}
              </div>
              <div className="message-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                {msg.isStreaming && <span className="streaming-cursor">▊</span>}
              </div>
              {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                <CitationList citations={msg.citations} onCitationClick={onCitationClick} />
              )}
              {msg.role === "assistant" && !msg.isStreaming && (
                <FeedbackButtons feedbackId={msg.feedback_id} token={token} />
              )}
            </div>
          ))}

          {loading && !streaming && (
            <div className="typing-indicator">
              <span /><span /><span />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && <p className="error-text chat-panel-error">{error}</p>}
      </div>

      <div className="composer">
        {(uploadStatus || uploadError) && (
          <p className={`composer-toast ${uploadError ? "composer-toast-error" : ""}`}>
            {uploadError || uploadStatus}
          </p>
        )}

        <div className="composer-bar">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={accept}
            onChange={handleFileChange}
          />

          <button
            type="button"
            className="composer-icon-btn"
            onClick={openFilePicker}
            disabled={uploading || inputDisabled}
            aria-label="Upload document"
            title="Upload document"
          >
            {uploading ? <SpinnerIcon /> : <PaperclipIcon />}
          </button>

          <button
            type="button"
            className="composer-icon-btn composer-mic-btn"
            disabled
            aria-label="Voice input (coming soon)"
            title="Voice input (coming soon)"
          >
            <MicIcon />
          </button>

          <textarea
            ref={textareaRef}
            className="composer-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your documents..."
            rows={1}
            disabled={inputDisabled}
          />

          {streaming ? (
            <button
              type="button"
              className="composer-send-btn composer-stop-btn"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              type="button"
              className="composer-send-btn"
              onClick={handleSubmit}
              disabled={!canSend}
              aria-label="Send message"
              title="Send message"
            >
              {loading ? <SpinnerIcon /> : <SendIcon />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
