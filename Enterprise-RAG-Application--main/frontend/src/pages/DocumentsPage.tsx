import { useEffect, useState } from "react";
import {
  apiDeleteDocument,
  apiDocumentDownloadUrl,
  apiFetchDocuments,
  apiUploadDocument,
} from "../api";
import type { DocumentSummary } from "../types";

type DocumentsPageProps = {
  token: string;
  isAdmin: boolean;
  onPreview: (docId: number, title: string | null, filename: string | null) => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPage({ token, isAdmin, onPreview }: DocumentsPageProps) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetchDocuments(token, q);
      setDocuments(res.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const handleSearch = () => void load(search);

  const handleDelete = async (docId: number) => {
    if (!confirm("Delete this document?")) return;
    try {
      await apiDeleteDocument(token, docId);
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await apiUploadDocument(token, file);
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Document Management</h1>
          <p className="muted-text">{documents.length} documents</p>
        </div>
        {isAdmin && (
          <label className="primary-button upload-label">
            {uploading ? "Uploading…" : "+ Upload Document"}
            <input type="file" hidden onChange={handleUpload} accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg" />
          </label>
        )}
      </header>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button type="button" className="secondary-button" onClick={handleSearch}>
          Search
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">Loading…</p>}

      <div className="doc-table">
        <div className="doc-table-header">
          <span>Filename</span>
          <span>Status</span>
          <span>Chunks</span>
          <span>Size</span>
          <span>Uploaded</span>
          <span>Actions</span>
        </div>
        {documents.map((doc) => (
          <div key={doc.id} className="doc-table-row">
            <span className="doc-name">{doc.title || doc.filename}</span>
            <span className={`status-badge status-${doc.processing_status}`}>
              {doc.processing_status}
            </span>
            <span>{doc.chunks_count}</span>
            <span>{formatBytes(doc.file_size)}</span>
            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
            <span className="doc-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => onPreview(doc.id, doc.title, doc.filename)}
              >
                Preview
              </button>
              <a
                className="ghost-button"
                href={apiDocumentDownloadUrl(doc.id)}
                download
                onClick={(e) => {
                  e.preventDefault();
                  fetch(apiDocumentDownloadUrl(doc.id), {
                    headers: { Authorization: `Bearer ${token}` },
                  })
                    .then((r) => r.blob())
                    .then((blob) => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = doc.filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    });
                }}
              >
                Download
              </a>
              {isAdmin && (
                <button
                  type="button"
                  className="ghost-button danger"
                  onClick={() => void handleDelete(doc.id)}
                >
                  Delete
                </button>
              )}
            </span>
          </div>
        ))}
        {!loading && documents.length === 0 && (
          <p className="muted-text empty-state">No documents found.</p>
        )}
      </div>
    </div>
  );
}
