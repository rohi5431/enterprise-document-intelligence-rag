import type { Citation } from "../types";
import { CitationCard } from "./CitationCard";

type CitationListProps = {
  citations: Citation[];
  onCitationClick: (citation: Citation) => void;
};

export function CitationList({ citations, onCitationClick }: CitationListProps) {
  if (!citations.length) return null;

  return (
    <div className="citation-list">
      <p className="citation-list-title">Sources</p>
      <div className="citation-grid">
        {citations.map((c) => (
          <CitationCard key={c.chunk_id} citation={c} onClick={onCitationClick} />
        ))}
      </div>
    </div>
  );
}
