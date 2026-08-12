import type { Citation } from "../types";

type CitationCardProps = {
  citation: Citation;
  onClick: (citation: Citation) => void;
};

export function CitationCard({ citation, onClick }: CitationCardProps) {
  const name = citation.doc_title || citation.doc_filename || `Document ${citation.doc_id}`;
  const score = citation.rerank_score ?? citation.score;

  return (
    <button
      type="button"
      className="citation-card w-full text-left bg-orange-500/5 border border-orange-500/10 hover:border-orange-500/30 p-3.5 rounded-xl transition duration-150"
      onClick={() => onClick(citation)}
      title="Open document preview"
      id={`citation-card-num-${citation.citation_number}`}
    >
      <div className="citation-card-header flex items-center gap-2 mb-1">
        <span className="citation-number text-orange-400 font-bold text-xs font-mono">
          [{citation.citation_number}]
        </span>
        <span className="citation-doc-name font-sans text-sm font-semibold truncate text-zinc-100">
          {name}
        </span>
      </div>
      <div className="citation-card-meta flex gap-3 text-xs text-zinc-400 font-mono mb-2">
        {citation.page_number != null && (
          <span className="citation-page">Page {citation.page_number}</span>
        )}
        <span className="citation-score text-orange-400">Score: {(score * 100).toFixed(1)}%</span>
      </div>
      <p className="citation-snippet text-xs text-zinc-300 line-clamp-2 leading-relaxed font-sans">
        {citation.text_snippet}
      </p>
    </button>
  );
}
