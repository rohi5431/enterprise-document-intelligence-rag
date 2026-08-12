import { useMemo, useState } from "react";
import { Trash2, MoreVertical, Edit2, Check, X } from "lucide-react";
import type { SessionSummary } from "../types";

type SessionSidebarProps = {
  sessions: SessionSummary[];
  activeSessionId?: number;
  onSelect: (session: SessionSummary) => Promise<void>;
  onDelete?: (sessionId: number) => Promise<void>;
  onRename?: (sessionId: number, newTitle: string) => Promise<void>;
};

export function SessionSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onRename,
  onDelete,
}: SessionSidebarProps) {
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;

    return sessions.filter((session) =>
      (session.title || "")
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [sessions, search]);

  const handleSaveRename = async (sessionId: number) => {
    if (!editingTitle.trim()) return;
    if (onRename) {
      await onRename(sessionId, editingTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="session-sidebar-wrapper flex flex-col flex-1 min-h-0 overflow-hidden" id="session-sidebar-wrapper">
      <div className="session-list-header flex justify-between items-center mb-1.5">
        <div className="session-list-heading text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">
          Chat History
        </div>
        <div className="session-count px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-[10px] font-mono font-bold">
          {sessions.length}
        </div>
      </div>

      <input
        className="session-search w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-850 rounded-lg text-zinc-100 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500/50 mb-2.5"
        placeholder="Search chats..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        id="session-search-input"
      />

      <div className="session-list flex-1 overflow-y-auto pr-1 space-y-1 scrollbar-thin scrollbar-thumb-zinc-850 scrollbar-track-transparent">
        {filteredSessions.length === 0 ? (
          <div className="session-empty text-xs text-zinc-500 text-center py-4 font-sans">
            No matching conversations
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.id}
              className={`session-item group w-full !flex !flex-row !items-center !justify-between !p-2.5 !gap-3 rounded-lg border transition-all duration-150 ${
                session.id === activeSessionId
                  ? "border-orange-500/30 bg-orange-500/5 active-session"
                  : "border-transparent bg-zinc-900/20 hover:bg-zinc-900/50"
              }`}
              id={`session-item-container-${session.id}`}
            >
              {editingId === session.id ? (
                <div className="flex items-center justify-between w-full gap-2 py-0.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-orange-500 font-sans"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void handleSaveRename(session.id);
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                    id={`session-rename-input-${session.id}`}
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleSaveRename(session.id)}
                      className="p-1 text-green-400 hover:text-green-300 hover:bg-zinc-800 rounded transition"
                      title="Save name"
                      id={`session-rename-save-${session.id}`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition"
                      title="Cancel"
                      id={`session-rename-cancel-${session.id}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : confirmDeleteId === session.id ? (
                <div className="flex items-center justify-between w-full gap-2 py-0.5">
                  <span className="text-[11px] font-bold text-red-400 font-sans truncate">Confirm Delete?</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (onDelete) {
                          await onDelete(session.id);
                        }
                        setConfirmDeleteId(null);
                      }}
                      className="px-2 py-0.5 bg-red-500 text-black text-[10px] font-extrabold rounded hover:bg-red-400 transition"
                      id={`session-delete-confirm-${session.id}`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded hover:bg-zinc-700 transition"
                      id={`session-delete-cancel-${session.id}`}
                    >
                      No
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => onSelect(session)}
                    type="button"
                    id={`session-item-btn-${session.id}`}
                  >
                    <div className="session-name font-bold text-xs text-zinc-200 truncate flex items-center gap-1.5">
                      <span className="shrink-0 text-zinc-500 text-[10px]">💬</span>
                      <span className="truncate">{session.title || `Session ${session.id}`}</span>
                    </div>
                    <div className="session-meta text-[10px] text-zinc-500 mt-0.5 font-mono">
                      {session.message_count} message{session.message_count !== 1 ? "s" : ""}
                    </div>
                  </button>

                  <div className="relative shrink-0 flex items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === session.id ? null : session.id);
                      }}
                      className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all ml-1 shrink-0 opacity-60 group-hover:opacity-100 focus:opacity-100"
                      title="Chat Options"
                      id={`session-menu-btn-${session.id}`}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {menuOpenId === session.id && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId(null);
                          }}
                        />
                        <div className="absolute right-0 top-6 mt-1 w-28 bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl z-40 py-1 flex flex-col font-sans">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(session.id);
                              setEditingTitle(session.title || "");
                              setMenuOpenId(null);
                            }}
                            className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-900 text-left transition"
                            id={`menu-rename-btn-${session.id}`}
                          >
                            <Edit2 className="w-3 h-3 text-orange-400" />
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(session.id);
                              setMenuOpenId(null);
                            }}
                            className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-950/20 text-left transition"
                            id={`menu-delete-btn-${session.id}`}
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
