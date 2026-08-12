import { useEffect, useState } from "react";
import { apiDocumentDownloadUrl, apiFetchChunk } from "../api";
import type { CitationPreviewTarget } from "../types";

type PdfPreviewModalProps = {
  target: CitationPreviewTarget | null;
  token: string;
  onClose: () => void;
};

export function PdfPreviewModal({ target, token, onClose }: PdfPreviewModalProps) {
  const [highlightText, setHighlightText] = useState("");
  const [chunkDetails, setChunkDetails] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!target) return;
    setHighlightText(target.textSnippet);
    setChunkDetails(target.textSnippet);

    if (target.chunkId) {
      setLoading(true);
      void apiFetchChunk(token, target.docId, target.chunkId)
        .then((chunk) => {
          if (chunk && chunk.text) {
            setChunkDetails(chunk.text);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [target, token]);

  if (!target) return null;

  const name = target.docTitle || target.docFilename || `Document ${target.docId}`;

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose} role="presentation" id="pdf-preview-modal-overlay">
      <div className="modal-content bg-zinc-950 border border-zinc-900 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header flex justify-between items-center p-5 border-b border-zinc-900">
          <div>
            <h2 className="text-base font-bold text-zinc-100 font-sans">{name}</h2>
            {target.pageNumber != null && (
              <p className="muted-text text-xs text-zinc-500 font-mono mt-0.5">Page {target.pageNumber}</p>
            )}
          </div>
          <button type="button" className="ghost-button text-xs bg-zinc-900 border border-zinc-850 hover:border-orange-500/30 px-3 py-1.5 rounded-xl text-zinc-300 transition" onClick={onClose} id="preview-close-btn">
            Close
          </button>
        </header>

        {highlightText && (
          <div className="highlight-banner p-4 bg-orange-500/5 border-b border-zinc-900">
            <strong className="text-xs uppercase tracking-wider text-orange-400 font-bold font-sans">Referenced segment:</strong>
            <p className="text-zinc-300 text-sm mt-1.5 leading-relaxed bg-orange-500/10 border-l-2 border-orange-500 p-2.5 rounded-r-lg font-sans">
              {highlightText}
            </p>
          </div>
        )}

        <div className="chunk-body-container flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Full Context Chunk</span>
            <a
              className="text-xs font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1"
              href={apiDocumentDownloadUrl(target.docId)}
              download
              id="preview-direct-download-link"
            >
              📥 Direct Download
            </a>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-900/60 p-4.5 rounded-2xl text-zinc-200 text-sm leading-relaxed font-sans font-normal whitespace-pre-wrap max-h-96 overflow-y-auto">
            {loading ? (
              <p className="text-zinc-500 text-xs animate-pulse">Loading expanded document snippet…</p>
            ) : (
              chunkDetails || <p className="text-zinc-500 italic text-xs">No extra segment text available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
