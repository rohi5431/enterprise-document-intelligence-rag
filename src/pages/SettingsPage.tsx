import { useEffect, useState } from "react";
import { apiGetPreferences, apiUpdatePreferences } from "../api";
import type { UserPreferences } from "../types";

type SettingsPageProps = {
  token: string;
  onPreferencesChange?: (prefs: UserPreferences) => void;
};

export function SettingsPage({ token, onPreferencesChange }: SettingsPageProps) {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGetPreferences(token).then(setPrefs).catch(() => {});
  }, [token]);

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiUpdatePreferences(token, {
        llm_provider: prefs.llm_provider,
        llm_model: prefs.llm_model ?? undefined,
        query_expansion_enabled: prefs.query_expansion_enabled,
        show_retrieval_diagnostics: prefs.show_retrieval_diagnostics,
      });
      setPrefs(updated);
      onPreferencesChange?.(updated);
      setMessage("Settings saved successfully.");
    } catch {
      setMessage("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!prefs) return <p className="muted-text text-zinc-500 text-sm">Loading settings…</p>;

  const models = prefs.available_models[prefs.llm_provider] || [];

  return (
    <div className="page-container flex flex-col flex-1 min-h-0 overflow-y-auto" id="settings-page">
      <header className="page-header mb-6">
        <h1 className="text-2xl font-bold font-sans tracking-tight text-white">Configuration</h1>
        <p className="muted-text text-sm text-zinc-400 mt-1">Model provider and RAG settings</p>
      </header>

      <div className="settings-form max-w-lg space-y-5">
        <div className="form-group flex flex-col gap-1.5">
          <label htmlFor="provider" className="text-xs font-bold text-zinc-500 uppercase tracking-wider">LLM Provider</label>
          <select
            id="provider"
            value={prefs.llm_provider}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500/50 text-sm"
            onChange={(e) =>
              setPrefs({
                ...prefs,
                llm_provider: e.target.value,
                llm_model: prefs.available_models[e.target.value]?.[0] || null,
              })
            }
          >
            {prefs.available_providers.map((p) => (
              <option key={p} value={p}>
                {p === "ollama" ? "Local LLM (Ollama)" : p === "openai" ? "OpenAI GPT-4o" : "Gemini 2.5 Pro"}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group flex flex-col gap-1.5">
          <label htmlFor="model" className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Model</label>
          <select
            id="model"
            value={prefs.llm_model || ""}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500/50 text-sm font-mono"
            onChange={(e) => setPrefs({ ...prefs, llm_model: e.target.value })}
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="form-group checkbox-group py-1 select-none">
          <label className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.query_expansion_enabled}
              className="rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500 w-4 h-4"
              onChange={(e) =>
                setPrefs({ ...prefs, query_expansion_enabled: e.target.checked })
              }
              id="settings-query-expansion-checkbox"
            />
            <span>Enable Query Expansion (Gemini Multi-Querying)</span>
          </label>
        </div>

        <div className="form-group checkbox-group py-1 select-none">
          <label className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.show_retrieval_diagnostics}
              className="rounded border-zinc-800 bg-zinc-900 text-orange-500 focus:ring-orange-500 w-4 h-4"
              onChange={(e) =>
                setPrefs({ ...prefs, show_retrieval_diagnostics: e.target.checked })
              }
              id="settings-diagnostics-checkbox"
            />
            <span>Show Retrieval Diagnostics by default</span>
          </label>
        </div>

        <button
          type="button"
          className="primary-button font-bold py-3.5 px-6 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black font-sans shadow-lg transition"
          onClick={() => void handleSave()}
          disabled={saving}
          id="settings-save-btn"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {message && <p className="text-sm font-sans text-orange-400 mt-2 font-semibold animate-pulse">{message}</p>}
      </div>
    </div>
  );
}
