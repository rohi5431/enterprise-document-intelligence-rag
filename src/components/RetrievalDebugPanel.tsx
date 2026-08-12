import type { RetrievalDiagnostics } from "../types";

type RetrievalDebugPanelProps = {
  diagnostics: RetrievalDiagnostics | null;
  visible: boolean;
  onToggle: (v: boolean) => void;
};

export function RetrievalDebugPanel({ diagnostics, visible, onToggle }: RetrievalDebugPanelProps) {
  return (
    <div className="debug-panel p-2.5 bg-zinc-950/60 border border-zinc-900/40 rounded-xl mb-2" id="retrieval-debug-panel">
      <label className="debug-toggle flex items-center gap-2 cursor-pointer text-xs font-semibold text-zinc-400 select-none">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => onToggle(e.target.checked)}
          className="rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500"
          id="retrieval-debug-checkbox"
        />
        Show Retrieval Diagnostics
      </label>

      {visible && diagnostics && (
        <div className="debug-grid grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2.5">
          <div className="debug-item bg-zinc-900/30 p-2 rounded-lg border border-zinc-800/30 flex flex-col gap-0.5 text-[11px]">
            <span className="text-zinc-500 font-medium">Embedding</span>
            <strong className="text-xs text-zinc-100 font-mono">
              {diagnostics.embedding_ms.toFixed(0)} ms
            </strong>
          </div>
          <div className="debug-item bg-zinc-900/30 p-2 rounded-lg border border-zinc-800/30 flex flex-col gap-0.5 text-[11px]">
            <span className="text-zinc-500 font-medium">Vector Search</span>
            <strong className="text-xs text-zinc-100 font-mono">
              {diagnostics.vector_ms.toFixed(0)} ms
            </strong>
          </div>
          <div className="debug-item bg-zinc-900/30 p-2 rounded-lg border border-zinc-800/30 flex flex-col gap-0.5 text-[11px]">
            <span className="text-zinc-500 font-medium">BM25 Search</span>
            <strong className="text-xs text-zinc-100 font-mono">
              {diagnostics.bm25_ms.toFixed(0)} ms
            </strong>
          </div>
          <div className="debug-item bg-zinc-900/30 p-2 rounded-lg border border-zinc-800/30 flex flex-col gap-0.5 text-[11px]">
            <span className="text-zinc-500 font-medium">Fusion & Rerank</span>
            <strong className="text-xs text-zinc-100 font-mono">
              {diagnostics.rerank_ms.toFixed(0)} ms
            </strong>
          </div>
          <div className="debug-item bg-zinc-900/30 p-2 rounded-lg border border-zinc-800/30 flex flex-col gap-0.5 text-[11px]">
            <span className="text-zinc-500 font-medium">Total Latency</span>
            <strong className="text-xs text-orange-400 font-mono">
              {diagnostics.total_ms.toFixed(0)} ms
            </strong>
          </div>

          <div className="debug-item bg-zinc-900/30 p-2 rounded-lg border border-zinc-800/30 flex flex-col gap-0.5 text-[11px]">
            <span className="text-zinc-500 font-medium">Vector Cand.</span>
            <strong className="text-xs text-zinc-100 font-mono">
              {diagnostics.vector_candidates}
            </strong>
          </div>
          <div className="debug-item bg-zinc-900/30 p-2 rounded-lg border border-zinc-800/30 flex flex-col gap-0.5 text-[11px]">
            <span className="text-zinc-500 font-medium">BM25 Cand.</span>
            <strong className="text-xs text-zinc-100 font-mono">
              {diagnostics.bm25_candidates}
            </strong>
          </div>
          <div className="debug-item bg-zinc-900/30 p-2 rounded-lg border border-zinc-800/30 flex flex-col gap-0.5 text-[11px]">
            <span className="text-zinc-500 font-medium">Total Cand.</span>
            <strong className="text-xs text-zinc-100 font-mono">
              {diagnostics.total_candidates}
            </strong>
          </div>
          <div className="debug-item bg-zinc-900/30 p-2 rounded-lg border border-zinc-800/30 flex flex-col gap-0.5 text-[11px]">
            <span className="text-zinc-500 font-medium">Cache Status</span>
            <strong className={`text-xs font-bold font-mono ${diagnostics.cache_hit ? "text-green-400" : "text-rose-400"}`}>
              {diagnostics.cache_hit ? "HIT" : "MISS"}
            </strong>
          </div>

          {diagnostics.expanded_queries.length > 0 && (
            <div className="debug-expanded col-span-full bg-zinc-900/20 p-2.5 rounded-lg border border-zinc-800/40 text-[11px] text-zinc-400">
              <span className="font-semibold text-zinc-300">Expanded Queries:</span>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                {diagnostics.expanded_queries.map((q) => (
                  <li key={q} className="font-mono text-zinc-300">{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
