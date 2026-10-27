import { useEffect, useRef, useState } from "react";
import {
  apiDeleteDocument,
  apiDocumentDownloadUrl,
  apiFetchDocuments,
  apiUploadDocument,
} from "../api";
import type { DocumentSummary } from "../types";

type UploadFileState = {
  name: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

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
  const [uploadFileStates, setUploadFileStates] = useState<UploadFileState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    try {
      await apiDeleteDocument(token, docId);
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleUpload = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (!fileList.length) return;
    setUploading(true);
    setError(null);

    // Initialize per-file state
    const initStates: UploadFileState[] = fileList.map((f) => ({ name: f.name, status: "pending" }));
    setUploadFileStates(initStates);

    let successCount = 0;
    for (let i = 0; i < fileList.length; i++) {
      setUploadFileStates((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: "uploading" } : s))
      );
      try {
        await apiUploadDocument(token, fileList[i]);
        successCount++;
        setUploadFileStates((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "done" } : s))
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setUploadFileStates((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: "error", error: msg } : s))
        );
      }
    }

    setUploading(false);
    await load(search);
    // Auto-clear file states after 5s
    setTimeout(() => setUploadFileStates([]), 5000);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void handleUpload(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) void handleUpload(e.dataTransfer.files);
  };

  return (
    <div className="page-container flex flex-col flex-1 min-h-0 overflow-y-auto" id="documents-page">
      <header className="page-header flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-white">Document Management</h1>
          <p className="muted-text text-sm text-zinc-400 mt-1">{documents.length} documents loaded</p>
        </div>
        <label
          className="primary-button upload-label cursor-pointer font-bold font-sans text-xs bg-orange-500 hover:bg-orange-400 text-black px-4 py-2.5 rounded-xl transition shadow-lg"
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? `Uploading ${uploadFileStates.filter(f => f.status === "done").length}/${uploadFileStates.length}…` : "+ Upload Documents"}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={handleFileInputChange}
            accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.tiff,.bmp,.webp"
            id="doc-upload-input"
          />
        </label>
      </header>

      {/* Drag & Drop Zone */}
      <div
        className={`mb-5 border-2 border-dashed rounded-2xl py-8 px-6 text-center transition-all duration-200 cursor-pointer ${
          isDragging
            ? "border-orange-500/60 bg-orange-500/5 scale-[1.01]"
            : "border-zinc-800/60 hover:border-zinc-700 bg-zinc-900/10 hover:bg-zinc-900/20"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        id="doc-drop-zone"
      >
        <svg className={`w-8 h-8 mx-auto mb-2 transition-colors ${ isDragging ? "text-orange-400" : "text-zinc-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-zinc-400 font-sans">
          <span className="font-bold text-orange-400">Click to upload</span> or drag &amp; drop multiple files
        </p>
        <p className="text-[11px] text-zinc-600 mt-1">PDF, DOCX, TXT, MD, PNG, JPG, TIFF, BMP, WEBP</p>
      </div>

      {/* Per-file upload progress */}
      {uploadFileStates.length > 0 && (
        <div className="mb-4 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Upload Progress</span>
          {uploadFileStates.map((fs, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                fs.status === "done" ? "bg-emerald-400" :
                fs.status === "error" ? "bg-red-400" :
                fs.status === "uploading" ? "bg-orange-400 animate-pulse" :
                "bg-zinc-700"
              }`} />
              <span className="flex-1 text-zinc-300 truncate font-sans">{fs.name}</span>
              <span className={`font-bold text-[11px] shrink-0 ${
                fs.status === "done" ? "text-emerald-400" :
                fs.status === "error" ? "text-red-400" :
                "text-orange-400"
              }`}>
                {fs.status === "done" ? "✓ Done" :
                 fs.status === "error" ? `✗ ${fs.error ?? "Failed"}` :
                 fs.status === "uploading" ? "Uploading..." : "Pending"}
              </span>
            </div>
          ))}
          <div className="mt-1 pt-2 border-t border-zinc-800/50 flex justify-between text-[10px] text-zinc-500 font-sans">
            <span>{uploadFileStates.filter(f => f.status === "done").length} / {uploadFileStates.length} complete</span>
            <span>{uploadFileStates.filter(f => f.status === "error").length > 0 ? `${uploadFileStates.filter(f => f.status === "error").length} failed` : ""}</span>
          </div>
        </div>
      )}
      <div className="search-bar flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Search documents by name or content..."
          className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-orange-500/50"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          id="doc-search-input"
        />
        <button
          type="button"
          className="secondary-button px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-sm transition"
          onClick={handleSearch}
          id="doc-search-btn"
        >
          Search
        </button>
      </div>

      {error && <p className="error-text text-rose-400 text-sm mb-4">{error}</p>}
      {loading && <p className="muted-text text-zinc-500 text-sm mb-4">Loading documents…</p>}

      <div className="doc-table flex-1 flex flex-col overflow-y-auto pr-1">
        <div className="doc-table-header grid grid-cols-1 md:grid-cols-[2fr_1.2fr_0.8fr_1fr_1.2fr_1.5fr] gap-4 text-xs font-bold uppercase tracking-wider text-zinc-500 pb-3 border-b border-zinc-850">
          <span>Filename</span>
          <span>Status</span>
          <span>Chunks</span>
          <span>Size</span>
          <span>Uploaded</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="space-y-2 mt-3 overflow-y-auto flex-1">
          {documents.map((doc) => (
            <div key={doc.id} className="doc-table-row grid grid-cols-1 md:grid-cols-[2fr_1.2fr_0.8fr_1fr_1.2fr_1.5fr] gap-4 items-center bg-zinc-900/20 hover:bg-zinc-900/60 p-4 rounded-xl border border-zinc-900/40 text-sm transition duration-150">
              <span className="doc-name font-semibold text-zinc-200 truncate flex items-center gap-2">
                {doc.image_base64 ? (
                  <div className="w-8 h-8 rounded bg-zinc-950 flex items-center justify-center overflow-hidden border border-zinc-800 shrink-0">
                    <img src={doc.image_base64} alt={doc.title} className="object-cover w-full h-full" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded bg-zinc-950 flex items-center justify-center border border-zinc-850 text-zinc-400 shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                )}
                <span className="truncate">{doc.title || doc.filename}</span>
              </span>
              <span className="flex">
                <span className={`status-badge text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full ${
                  doc.processing_status === "processed" ? "bg-green-500/10 text-green-400" :
                  doc.processing_status === "failed" ? "bg-red-500/10 text-red-400" :
                  "bg-orange-500/10 text-orange-400 animate-pulse"
                }`}>
                  {doc.processing_status}
                </span>
              </span>
              <span className="text-zinc-400 font-mono">{doc.chunks_count}</span>
              <span className="text-zinc-400 font-mono">{formatBytes(doc.file_size)}</span>
              <span className="text-zinc-400">{new Date(doc.created_at).toLocaleDateString()}</span>
              <span className="doc-actions flex gap-2 justify-end">
                <button
                  type="button"
                  className="ghost-button text-xs bg-zinc-800/40 border border-zinc-800 hover:border-orange-500/30 text-zinc-300 px-3 py-1.5 rounded-lg transition"
                  onClick={() => onPreview(doc.id, doc.title, doc.filename)}
                >
                  Preview
                </button>
                <a
                  className="ghost-button text-xs bg-zinc-800/40 border border-zinc-800 hover:border-orange-500/30 text-zinc-300 px-3 py-1.5 rounded-lg transition"
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
                {confirmDeleteId === doc.id ? (
                  <div className="flex items-center gap-1.5 bg-rose-950/20 border border-red-900/40 px-2 py-1 rounded-lg">
                    <span className="text-[11px] font-bold text-red-400">Sure?</span>
                    <button
                      type="button"
                      className="bg-red-500 text-black text-[10px] font-extrabold px-1.5 py-0.5 rounded hover:bg-red-400 transition"
                      onClick={() => {
                        void handleDelete(doc.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="bg-zinc-800 text-zinc-300 text-[10px] font-bold px-1.5 py-0.5 rounded hover:bg-zinc-700 transition"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="ghost-button danger text-xs hover:bg-rose-950/20 text-red-400 border border-transparent hover:border-red-900 px-3 py-1.5 rounded-lg transition"
                    onClick={() => setConfirmDeleteId(doc.id)}
                  >
                    Delete
                  </button>
                )}
              </span>
            </div>
          ))}
          {!loading && documents.length === 0 && (
            <p className="muted-text text-zinc-500 text-center py-16 font-sans">No documents found. Upload text/md files above.</p>
          )}
        </div>
      </div>
    </div>
  );
}
