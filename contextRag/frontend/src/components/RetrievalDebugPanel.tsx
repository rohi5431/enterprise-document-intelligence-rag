import type { RetrievalDiagnostics } from "../types";

type RetrievalDebugPanelProps = {
  diagnostics: RetrievalDiagnostics | null;
  visible: boolean;
  onToggle: (v: boolean) => void;
};

export function RetrievalDebugPanel({ diagnostics, visible, onToggle }: RetrievalDebugPanelProps) {
  return (
    <div className="debug-panel">
      <label className="debug-toggle">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => onToggle(e.target.checked)}
        />
        Show Retrieval Diagnostics
      </label>

      {visible && diagnostics && (
        <div className="debug-grid">
          <div className="debug-item">
            <span>Embedding</span>
            <strong>{diagnostics.embedding_ms.toFixed(0)} ms</strong>
          </div>
          <div className="debug-item">
            <span>Vector Search</span>
            <strong>{diagnostics.vector_ms.toFixed(0)} ms</strong>
          </div>
          <div className="debug-item">
            <span>BM25</span>
            <strong>{diagnostics.bm25_ms.toFixed(0)} ms</strong>
          </div>
          <div className="debug-item">
            <span>Fusion</span>
            <strong>{diagnostics.fusion_ms.toFixed(0)} ms</strong>
          </div>
          <div className="debug-item">
            <span>Rerank</span>
            <strong>{diagnostics.rerank_ms.toFixed(0)} ms</strong>
          </div>
          <div className="debug-item">
            <span>Total</span>
            <strong>{diagnostics.total_ms.toFixed(0)} ms</strong>
          </div>
          <div className="debug-item">
            <span>Vector Candidates</span>
            <strong>{diagnostics.vector_candidates}</strong>
          </div>
          <div className="debug-item">
            <span>BM25 Candidates</span>
            <strong>{diagnostics.bm25_candidates}</strong>
          </div>
          <div className="debug-item">
            <span>Total Candidates</span>
            <strong>{diagnostics.total_candidates}</strong>
          </div>
          <div className="debug-item">
            <span>Cache</span>
            <strong className={diagnostics.cache_hit ? "cache-hit" : "cache-miss"}>
              {diagnostics.cache_hit ? "HIT" : "MISS"}
            </strong>
          </div>
          {diagnostics.expanded_queries.length > 0 && (
            <div className="debug-expanded">
              <span>Expanded Queries</span>
              <ul>
                {diagnostics.expanded_queries.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
