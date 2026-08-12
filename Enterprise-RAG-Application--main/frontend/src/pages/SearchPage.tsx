import { useState } from "react";
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

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiSemanticSearch(token, query, topK);
      setResults(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Semantic Search</h1>
          <p className="muted-text">Search your documents by meaning — no chat required</p>
        </div>
      </header>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search documents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
        />
        <select value={topK} onChange={(e) => setTopK(Number(e.target.value))}>
          <option value={5}>Top 5</option>
          <option value={10}>Top 10</option>
          <option value={20}>Top 20</option>
        </select>
        <button type="button" className="primary-button" onClick={() => void handleSearch()} disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="search-results">
        {results.map((r) => (
          <button
            key={r.chunk_id}
            type="button"
            className="search-result-card"
            onClick={() => onResultClick(r)}
          >
            <div className="search-result-header">
              <strong>{r.doc_title || r.doc_filename || `Doc ${r.doc_id}`}</strong>
              <span className="search-score">{(r.score * 100).toFixed(1)}%</span>
            </div>
            {r.page_number != null && (
              <span className="muted-text">Page {r.page_number}</span>
            )}
            <p className="search-highlight">{r.highlight}</p>
          </button>
        ))}
        {!loading && results.length === 0 && query && (
          <p className="muted-text empty-state">No results found.</p>
        )}
      </div>
    </div>
  );
}
