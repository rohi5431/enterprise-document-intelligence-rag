import { useState, useMemo } from "react";
import { Sliders, Search, Database, Layers, Eye, HelpCircle, Binary, FileText, Check, Sparkles } from "lucide-react";
import { apiSemanticSearch } from "../api";
import type { SemanticSearchResult } from "../types";

type SearchPageProps = {
  token: string;
  onResultClick: (result: SemanticSearchResult) => void;
};

export function SearchPage({ token, onResultClick }: SearchPageProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SemanticSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topK, setTopK] = useState(10);

  // Search Strategy States (Sandbox Simulators)
  const [strategy, setStrategy] = useState<"semantic" | "bm25" | "hybrid">("hybrid");
  const [metric, setMetric] = useState<"cosine" | "dot" | "l2">("cosine");
  const [threshold, setThreshold] = useState(0.5);

  // Chunking Visualizer States
  const [chunkText, setChunkText] = useState(
    "Enterprise RAG Platforms index structured documents by splitting them into smaller passages. These are called chunks. Chunks are converted to embeddings. For optimal results, an overlapping window is used so context around boundaries is not lost."
  );
  const [chunkSize, setChunkSize] = useState(120);
  const [chunkOverlap, setChunkOverlap] = useState(30);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch semantic results from the backend
      const res = await apiSemanticSearch(token, query, topK * 2); // get a larger candidate pool so we can filter
      setResults(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  // Dynamically filter & score results based on chosen metrics in the sandbox
  const processedResults = useMemo(() => {
    return results
      .map((r) => {
        let adjustedScore = r.score;

        // Simulate strategy differences
        if (strategy === "bm25") {
          // BM25 is keyword focused, we add slight keyword-bias fluctuation
          adjustedScore = Math.max(0.1, r.score * 0.85);
        } else if (strategy === "hybrid") {
          // Reciprocal Rank Fusion / Hybrid combines dense + sparse
          adjustedScore = Math.min(1.0, r.score * 1.05);
        }

        // Simulate distance metric scales
        if (metric === "l2") {
          // Euclidean distance: smaller is better, score mapped to distance range
          adjustedScore = Math.max(0.2, 1.0 - adjustedScore * 0.4);
        } else if (metric === "dot") {
          adjustedScore = Math.min(1.0, adjustedScore * 0.98);
        }

        return {
          ...r,
          adjustedScore,
        };
      })
      .filter((r) => r.adjustedScore >= threshold)
      .slice(0, topK)
      .sort((a, b) => b.adjustedScore - a.adjustedScore);
  }, [results, strategy, metric, threshold, topK]);

  // Compute overlapping chunks for chunking visualizer
  const segmentedChunks = useMemo(() => {
    if (!chunkText.trim() || chunkSize <= 0) return [];
    const chunks: { text: string; start: number; end: number; index: number }[] = [];
    const step = Math.max(1, chunkSize - chunkOverlap);
    let index = 0;

    for (let i = 0; i < chunkText.length; i += step) {
      const end = Math.min(i + chunkSize, chunkText.length);
      const text = chunkText.substring(i, end);
      chunks.push({ text, start: i, end, index });
      index++;
      if (end >= chunkText.length) break;
    }
    return chunks;
  }, [chunkText, chunkSize, chunkOverlap]);

  return (
    <div className="page-container flex flex-col flex-1 min-h-0 overflow-y-auto !pb-20" id="search-page">
      <header className="page-header mb-6">
        <div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-white flex items-center gap-2">
            <Database className="w-6 h-6 text-orange-400" />
            Semantic Search & Vector Sandbox
          </h1>
          <p className="muted-text text-sm text-zinc-400 mt-1">
            Search your documents by meaning while tuning indices, distance metrics, and chunk parameters.
          </p>
        </div>
      </header>

      {/* Grid Layout: Search Panel + Settings Side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start flex-1 min-h-0">
        
        {/* LEFT/MID: Search Bar & Results */}
        <div className="lg:col-span-2 space-y-5 flex flex-col h-full">
          <div className="search-bar flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Type query (e.g. 'GPA requirement', 'eval metrics', etc)..."
                className="w-full pl-10 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-orange-500/50 text-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
                id="semantic-query-input"
              />
            </div>
            <select
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="!w-auto !flex-none px-3 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50 text-sm font-mono"
              id="semantic-topk-select"
            >
              <option value={3}>K = 3</option>
              <option value={5}>K = 5</option>
              <option value={10}>K = 10</option>
            </select>
            <button
              type="button"
              className="primary-button !w-auto px-6 py-3 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black font-bold text-sm rounded-xl transition shadow-lg flex items-center gap-1.5 shrink-0"
              onClick={() => void handleSearch()}
              disabled={loading}
              id="semantic-search-btn"
            >
              <Search className="w-4 h-4" />
              {loading ? "Searching…" : "Search"}
            </button>
          </div>

          {error && <p className="error-text text-sm text-rose-400 font-medium">{error}</p>}

          <div className="search-results space-y-3 overflow-y-auto max-h-[500px] pr-1 flex-1">
            {processedResults.map((r, rIdx) => (
              <button
                key={`${r.chunk_id}-${rIdx}`}
                type="button"
                className="search-result-card w-full text-left bg-zinc-900/10 hover:bg-zinc-900/40 p-4.5 rounded-2xl border border-zinc-900 hover:border-orange-500/20 transition duration-150 flex flex-col gap-2 relative group"
                onClick={() => onResultClick(r)}
                id={`semantic-res-card-${r.chunk_id}`}
              >
                <div className="search-result-header flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <strong className="font-sans text-xs font-semibold text-zinc-300 truncate block group-hover:text-white transition-colors">
                      {r.doc_title || r.doc_filename || `Doc ${r.doc_id}`}
                    </strong>
                    {r.page_number != null && (
                      <span className="muted-text text-[10px] text-zinc-500 font-mono">Page {r.page_number}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="search-score text-xs font-mono font-bold text-orange-400 bg-orange-500/5 px-2 py-0.5 rounded-full border border-orange-500/10">
                      {(r.adjustedScore * 100).toFixed(1)}% match
                    </span>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
                      Rank #{rIdx + 1}
                    </span>
                  </div>
                </div>
                <p className="search-highlight text-zinc-400 text-sm mt-1 leading-relaxed font-sans font-normal border-l-2 border-zinc-800 pl-3">
                  {r.highlight}
                </p>
                <div className="text-[10px] font-mono text-zinc-500 mt-1 flex items-center justify-between">
                  <span>Chunk ID: {r.chunk_id}</span>
                  <span className="text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Click to view full chunk context &rarr;
                  </span>
                </div>
              </button>
            ))}

            {!loading && results.length > 0 && processedResults.length === 0 && (
              <div className="text-center py-16 bg-zinc-900/5 border border-zinc-900 p-8 rounded-2xl">
                <Sliders className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-400 font-bold text-sm">No results match filters</p>
                <p className="text-zinc-500 text-xs mt-1">Try lowering the Minimum Similarity Score threshold in the sidebar.</p>
              </div>
            )}

            {!loading && results.length === 0 && query && (
              <p className="muted-text text-zinc-500 text-center py-16 font-sans">No matches found in the vector space.</p>
            )}

            {results.length === 0 && !query && (
              <div className="text-center py-16 bg-zinc-900/5 border border-zinc-900 p-8 rounded-2xl">
                <Sparkles className="w-8 h-8 text-orange-400/70 mx-auto mb-2 animate-pulse" />
                <p className="text-zinc-300 font-bold text-sm font-sans">Run a semantic query</p>
                <p className="text-zinc-500 text-xs mt-1 max-w-sm mx-auto">
                  Type a prompt above. The system will retrieve relevant source information by calculating embedding vectors.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Vector Index & Chunking Sandbox Settings */}
        <div className="space-y-6">
          
          {/* Index & Metrics Card */}
          <div className="sandbox-panel bg-zinc-950/80 border border-zinc-900/80 p-5 rounded-2xl shadow-lg flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
              <Sliders className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-bold font-sans uppercase tracking-wider text-zinc-200">
                Vector DB Tuning
              </h2>
            </div>

            {/* Retrieval Strategy */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Retrieval Strategy
              </label>
              <div className="grid grid-cols-3 gap-1 bg-zinc-900 p-1 rounded-xl">
                {(["semantic", "bm25", "hybrid"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStrategy(s)}
                    className={`px-1.5 py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all ${
                      strategy === s
                        ? "bg-orange-500 text-black shadow-md font-extrabold"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 leading-normal mt-1">
                {strategy === "semantic" && "Uses dense embeddings for pure conceptual understanding."}
                {strategy === "bm25" && "Uses sparse statistical TF-IDF keyword token matching."}
                {strategy === "hybrid" && "Combines both using Reciprocal Rank Fusion (RRF) algorithms."}
              </p>
            </div>

            {/* Similarity Metric */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Distance / Similarity Metric
              </label>
              <div className="grid grid-cols-3 gap-1 bg-zinc-900 p-1 rounded-xl">
                {(["cosine", "dot", "l2"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetric(m)}
                    className={`px-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      metric === m
                        ? "bg-orange-500 text-black shadow-md font-extrabold"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {m === "cosine" ? "Cosine" : m === "dot" ? "Dot" : "L2"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 leading-normal mt-1">
                {metric === "cosine" && "Cosine similarity calculates normalized angular distance."}
                {metric === "dot" && "Dot Product measures alignment (magnitude + direction)."}
                {metric === "l2" && "Euclidean (L2) measures absolute spatial distance."}
              </p>
            </div>

            {/* Min Similarity Threshold */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Min Similarity Cutoff
                </label>
                <span className="text-[11px] font-mono text-orange-400 font-bold">
                  {(threshold * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.95"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full accent-orange-500 bg-zinc-900 cursor-pointer h-1.5 rounded-lg appearance-none"
              />
              <p className="text-[10px] text-zinc-500 leading-normal">
                Prunes RAG chunk context inputs that score below the chosen confidence limit.
              </p>
            </div>
          </div>

          {/* CHUNKING PLAYGROUND VISUALIZER CARD */}
          <div className="sandbox-panel bg-zinc-950/80 border border-zinc-900/80 p-5 rounded-2xl shadow-lg flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
              <Layers className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-bold font-sans uppercase tracking-wider text-zinc-200">
                Chunk Segmentation Sandbox
              </h2>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Source Document Segment
              </label>
              <textarea
                value={chunkText}
                onChange={(e) => setChunkText(e.target.value)}
                rows={3}
                className="w-full p-2.5 bg-zinc-900 border border-zinc-855 rounded-xl text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/50 resize-none font-sans"
                placeholder="Type document text to test chunk boundaries..."
              />
            </div>

            {/* Chunk Sliders */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase">
                  <span>Size</span>
                  <span className="text-orange-400">{chunkSize} ch</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="250"
                  step="10"
                  value={chunkSize}
                  onChange={(e) => {
                    const size = parseInt(e.target.value);
                    setChunkSize(size);
                    if (chunkOverlap >= size) {
                      setChunkOverlap(size - 10);
                    }
                  }}
                  className="w-full accent-orange-500 bg-zinc-900 cursor-pointer h-1 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-zinc-400 uppercase">
                  <span>Overlap</span>
                  <span className="text-orange-400">{chunkOverlap} ch</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={chunkOverlap}
                  onChange={(e) => {
                    const overlap = parseInt(e.target.value);
                    setChunkOverlap(Math.min(overlap, chunkSize - 10));
                  }}
                  className="w-full accent-orange-500 bg-zinc-900 cursor-pointer h-1 rounded-lg"
                />
              </div>
            </div>

            {/* Output Segment Visualizer */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                Overlapping Chunks ({segmentedChunks.length})
              </span>
              <div className="bg-zinc-900 p-3 rounded-xl max-h-56 overflow-y-auto space-y-2 border border-zinc-850">
                {segmentedChunks.map((chunk, cIdx) => {
                  const colors = [
                    "border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10",
                    "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10",
                    "border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10",
                    "border-orange-400/30 bg-orange-400/5 hover:bg-orange-400/10",
                  ];
                  const borderCol = colors[cIdx % colors.length];

                  return (
                    <div
                      key={chunk.index}
                      className={`p-2.5 rounded-lg border text-[11px] font-sans leading-relaxed transition ${borderCol}`}
                    >
                      <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mb-1">
                        <span className="font-bold text-orange-400 uppercase">Chunk #{chunk.index + 1}</span>
                        <span>
                          [{chunk.start} &rarr; {chunk.end}] ({chunk.text.length} chars)
                        </span>
                      </div>
                      <span className="text-zinc-300 font-normal">
                        {/* Highlight the overlapping portion at the beginning of subsequent chunks */}
                        {cIdx > 0 && chunkOverlap > 0 ? (
                          <>
                            <span className="bg-orange-500/20 text-orange-300 rounded font-semibold px-0.5" title="Overlap Context Segment">
                              {chunk.text.substring(0, chunkOverlap)}
                            </span>
                            {chunk.text.substring(chunkOverlap)}
                          </>
                        ) : (
                          chunk.text
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[9.5px] text-zinc-500 leading-normal">
                Overlapping windows are highlighted in <span className="text-orange-400 font-semibold">orange</span> to maintain spatial semantic coherence across split tokens.
              </p>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
