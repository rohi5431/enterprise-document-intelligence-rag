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
      setMessage("Settings saved.");
    } catch {
      setMessage("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!prefs) return <p className="muted-text">Loading settings…</p>;

  const models = prefs.available_models[prefs.llm_provider] || [];

  return (
    <div className="page-container">
      <header className="page-header">
        <h1>Configuration</h1>
        <p className="muted-text">Model provider and RAG settings</p>
      </header>

      <div className="settings-form">
        <div className="form-group">
          <label htmlFor="provider">LLM Provider</label>
          <select
            id="provider"
            value={prefs.llm_provider}
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
                {p === "ollama" ? "Local LLM (Ollama)" : p === "openai" ? "OpenAI GPT-4o" : "Gemini 2.5"}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="model">Model</label>
          <select
            id="model"
            value={prefs.llm_model || ""}
            onChange={(e) => setPrefs({ ...prefs, llm_model: e.target.value })}
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={prefs.query_expansion_enabled}
              onChange={(e) =>
                setPrefs({ ...prefs, query_expansion_enabled: e.target.checked })
              }
            />
            Enable Query Expansion
          </label>
        </div>

        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={prefs.show_retrieval_diagnostics}
              onChange={(e) =>
                setPrefs({ ...prefs, show_retrieval_diagnostics: e.target.checked })
              }
            />
            Show Retrieval Diagnostics by default
          </label>
        </div>

        <button type="button" className="primary-button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {message && <p className="muted-text">{message}</p>}
      </div>
    </div>
  );
}
