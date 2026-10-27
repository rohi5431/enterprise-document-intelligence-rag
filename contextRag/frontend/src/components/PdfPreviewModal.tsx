import { useEffect, useState } from "react";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import { apiDocumentDownloadUrl, apiFetchChunk } from "../api";
import type { CitationPreviewTarget } from "../types";

type PdfPreviewModalProps = {
  target: CitationPreviewTarget | null;
  token: string;
  onClose: () => void;
};

export function PdfPreviewModal({ target, token, onClose }: PdfPreviewModalProps) {
  const [highlightText, setHighlightText] = useState("");
  const layoutPlugin = defaultLayoutPlugin();
  const { jumpToPage } = layoutPlugin;

  useEffect(() => {
    if (!target) return;
    setHighlightText(target.textSnippet);

    if (target.pageNumber && target.pageNumber > 0) {
      setTimeout(() => jumpToPage(target.pageNumber! - 1), 500);
    }

    void apiFetchChunk(token, target.docId, target.chunkId)
      .then((chunk) => setHighlightText(chunk.text.slice(0, 300)))
      .catch(() => {});
  }, [target, token, jumpToPage]);

  if (!target) return null;

  const fileUrl = apiDocumentDownloadUrl(target.docId);
  const name = target.docTitle || target.docFilename || `Document ${target.docId}`;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-content pdf-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2>{name}</h2>
            {target.pageNumber != null && (
              <p className="muted-text">Page {target.pageNumber}</p>
            )}
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </header>

        {highlightText && (
          <div className="highlight-banner">
            <strong>Referenced section:</strong>
            <p>{highlightText}</p>
          </div>
        )}

        <div className="pdf-viewer-container">
          <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
            <Viewer
              fileUrl={fileUrl}
              httpHeaders={{ Authorization: `Bearer ${token}` }}
              plugins={[layoutPlugin]}
            />
          </Worker>
        </div>
      </div>
    </div>
  );
}
