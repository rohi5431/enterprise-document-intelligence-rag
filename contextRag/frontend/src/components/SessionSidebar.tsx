import { useMemo, useState } from "react";
import type { SessionSummary } from "../types";

type SessionSidebarProps = {
  sessions: SessionSummary[];
  activeSessionId?: number;
  onSelect: (
    session: SessionSummary
  ) => Promise<void>;
};

export function SessionSidebar({
  sessions,
  activeSessionId,
  onSelect,
}: SessionSidebarProps) {
  const [search, setSearch] = useState("");

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;

    return sessions.filter((session) =>
      (session.title || "")
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [sessions, search]);

  return (
    <div className="session-list">
      <div className="session-list-header">
        <div className="session-list-heading">
          Chat History
        </div>

        <div className="session-count">
          {sessions.length}
        </div>
      </div>

      <input
        className="session-search"
        placeholder="Search chats..."
        value={search}
        onChange={(e) =>
          setSearch(e.target.value)
        }
      />

      {filteredSessions.length === 0 ? (
        <div className="session-empty">
          No matching conversations
        </div>
      ) : (
        filteredSessions.map((session) => (
          <button
            key={session.id}
            className={`session-item ${
              session.id === activeSessionId
                ? "active"
                : ""
            }`}
            onClick={() =>
              onSelect(session)
            }
            type="button"
          >
            <div className="session-name">
              💬{" "}
              {session.title ||
                `Session ${session.id}`}
            </div>

            <div className="session-meta">
              {
                session.message_count
              }{" "}
              messages
            </div>
          </button>
        ))
      )}
    </div>
  );
}
