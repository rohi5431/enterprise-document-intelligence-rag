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
      className="citation-card"
      onClick={() => onClick(citation)}
      title="Open document preview"
    >
      <div className="citation-card-header">
        <span className="citation-number">[{citation.citation_number}]</span>
        <span className="citation-doc-name">{name}</span>
      </div>
      <div className="citation-card-meta">
        {citation.page_number != null && (
          <span className="citation-page">Page {citation.page_number}</span>
        )}
        <span className="citation-score">Score: {(score * 100).toFixed(1)}%</span>
      </div>
      <p className="citation-snippet">{citation.text_snippet}</p>
    </button>
  );
}
