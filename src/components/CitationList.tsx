import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import type { Citation } from "../types";
import { CitationCard } from "./CitationCard";

type CitationListProps = {
  citations: Citation[];
  onCitationClick: (citation: Citation) => void;
};

export function CitationList({ citations, onCitationClick }: CitationListProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!citations.length) return null;

  return (
    <div className="citation-list mt-3 pt-3 border-t border-zinc-800/60" id="citation-list-container">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-zinc-900/40 hover:bg-zinc-900/75 border border-zinc-800/60 transition duration-150 text-left"
        id="sources-dropdown-toggle"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-xs font-bold font-sans uppercase tracking-wider text-zinc-300">
            Sources & References ({citations.length})
          </span>
        </div>
        <div className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200">
          <span className="text-[10px] font-mono uppercase tracking-wider">{isOpen ? "Hide" : "Show"}</span>
          {isOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="citation-grid grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {citations.map((c) => (
            <CitationCard key={c.chunk_id} citation={c} onClick={onCitationClick} />
          ))}
        </div>
      )}
    </div>
  );
}
