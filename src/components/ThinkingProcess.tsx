import { useState } from "react";
import { ChevronDown, ChevronUp, Brain, CheckCircle2, Search, Cpu, Database, Sparkles } from "lucide-react";
import type { RetrievalDiagnostics } from "../types";

type ThinkingProcessProps = {
  diagnostics?: RetrievalDiagnostics;
  citationsCount: number;
  isStreaming?: boolean;
};

export function ThinkingProcess({ diagnostics, citationsCount, isStreaming }: ThinkingProcessProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!diagnostics) return null;

  const {
    embedding_ms = 0,
    vector_ms = 0,
    bm25_ms = 0,
    rerank_ms = 0,
    total_ms = 0,
    vector_candidates = 0,
    bm25_candidates = 0,
    total_candidates = 0,
    expanded_queries = [],
    cache_hit = false,
  } = diagnostics;

  return (
    <div className="thinking-process-accordion border border-zinc-800/60 bg-zinc-950/40 rounded-xl mb-3 overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3.5 py-2.5 hover:bg-zinc-900/40 transition-colors text-left"
        id="thinking-process-toggle"
      >
        <div className="flex items-center gap-2">
          <Brain className={`w-4 h-4 ${isStreaming ? "text-orange-400 animate-pulse" : "text-zinc-400"}`} />
          <span className="text-xs font-bold font-sans uppercase tracking-wider text-zinc-300">
            {isStreaming ? "Thinking..." : "Thought Process"}
          </span>
          {cache_hit && (
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-mono font-bold animate-pulse">
              ⚡ Cache Hit
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200">
          <span className="text-[10px] font-mono font-bold text-zinc-500">
            {cache_hit ? "0 ms" : `${total_ms.toFixed(0)} ms`}
          </span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="px-3.5 pb-3 border-t border-zinc-900/60 bg-zinc-950/20 text-xs text-zinc-300 space-y-3 pt-3">
          {cache_hit ? (
            <div className="flex items-start gap-2.5 text-zinc-300 bg-emerald-950/10 border border-emerald-900/20 p-2.5 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-400 text-xs">Retrieved from cache</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 font-sans">
                  This query matches a highly similar past request. The system served the response instantly from the semantic cache with 0ms retrieval latency.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-zinc-800">
              {/* Step 1: Query Expansion */}
              <div className="flex items-start gap-3 relative">
                <div className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 z-10">
                  <Search className="w-2.5 h-2.5 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-200 text-[11px] uppercase tracking-wider">1. Query Intent Expansion</span>
                    <span className="text-[10px] font-mono text-zinc-500">Completed</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Analyzed query syntax and expanded semantic variations for improved matching.
                  </p>
                  {expanded_queries.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {expanded_queries.map((q, qIdx) => (
                        <span key={qIdx} className="text-[9.5px] font-mono bg-zinc-900 border border-zinc-850 text-zinc-300 px-1.5 py-0.5 rounded">
                          "{q}"
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Multi-stage Retrieval */}
              <div className="flex items-start gap-3 relative">
                <div className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 z-10">
                  <Database className="w-2.5 h-2.5 text-orange-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-200 text-[11px] uppercase tracking-wider">2. Hybrid Context Retrieval</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {((embedding_ms || 0) + (vector_ms || 0) + (bm25_ms || 0)).toFixed(0)} ms
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Fetched potential sources in parallel using two indexing methodologies:
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <div className="bg-zinc-900/50 border border-zinc-850 p-1.5 rounded text-[10px]">
                      <span className="text-zinc-500 block">Dense Vector (Semantic)</span>
                      <strong className="text-zinc-200 font-mono text-[10.5px]">
                        {vector_candidates} candidates ({(embedding_ms + vector_ms).toFixed(0)}ms)
                      </strong>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-850 p-1.5 rounded text-[10px]">
                      <span className="text-zinc-500 block">Sparse BM25 (Keyword)</span>
                      <strong className="text-zinc-200 font-mono text-[10.5px]">
                        {bm25_candidates} candidates ({bm25_ms.toFixed(0)}ms)
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Neural Reranking */}
              <div className="flex items-start gap-3 relative">
                <div className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 z-10">
                  <Cpu className="w-2.5 h-2.5 text-orange-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-200 text-[11px] uppercase tracking-wider">3. Neural Reranking & Fusion</span>
                    <span className="text-[10px] font-mono text-zinc-500">{rerank_ms.toFixed(0)} ms</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Merged sparse and dense candidate pools. Applied Cross-Attention neural reranking to find the highest value segments.
                  </p>
                  <div className="mt-1 text-[10px] text-zinc-500 font-mono">
                    Filtered <span className="text-zinc-300 font-bold">{total_candidates} candidates</span> down to top <span className="text-zinc-300 font-bold">{citationsCount} primary context chunks</span>.
                  </div>
                </div>
              </div>

              {/* Step 4: Generation */}
              <div className="flex items-start gap-3 relative">
                <div className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 z-10">
                  <Sparkles className="w-2.5 h-2.5 text-orange-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-200 text-[11px] uppercase tracking-wider">4. LLM Synthesis & Citation Mapping</span>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">Synthesizing</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Gemini model processes the context chunks to formulate a highly targeted, accurate response with bracketed source references.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
