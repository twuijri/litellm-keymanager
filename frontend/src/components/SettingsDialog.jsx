import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import { api } from "../api.js";

function FieldRow({ label, hint, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

export default function SettingsDialog({ open, onClose }) {
  const [view, setView] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setTestResult(null);
    api.getSettings()
      .then((v) => {
        setView(v);
        setForm({
          litellm_base_url: v.litellm_base_url || "",
          litellm_master_key: "",
          database_url: "",
          cors_origins: v.cors_origins || "",
        });
      })
      .catch((e) => setError(e.message));
  }, [open]);

  function update(k, v) {
    setForm({ ...form, [k]: v });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        litellm_base_url: form.litellm_base_url,
        cors_origins: form.cors_origins,
      };
      // Only send key/url if user actually typed something to avoid wiping existing values
      if (form.litellm_master_key !== "") payload.litellm_master_key = form.litellm_master_key;
      if (form.database_url !== "") payload.database_url = form.database_url;
      const updated = await api.saveSettings(payload);
      setView(updated);
      setForm({ ...form, litellm_master_key: "", database_url: "" });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function testDb() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testDatabase();
      setTestResult({
        ok: true,
        message: `Connected. Found ${result.tables_found?.length ?? 0} LiteLLM tables.`,
      });
    } catch (e) {
      setTestResult({ ok: false, message: e.message });
    } finally {
      setTesting(false);
    }
  }

  async function clearOverride(key) {
    setSaving(true);
    setError("");
    try {
      const updated = await api.saveSettings({ [key]: "" });
      setView(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Settings"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Close</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <p className="text-xs text-ink-500">
          Settings are stored on the server in <code className="font-mono">/data/settings.json</code> and override
          values from the container's environment.
        </p>

        <FieldRow label="LiteLLM base URL" hint="Internal URL of the LiteLLM proxy reachable from this container.">
          <input
            className="input"
            placeholder="http://litellm_app:4000"
            value={form.litellm_base_url || ""}
            onChange={(e) => update("litellm_base_url", e.target.value)}
          />
        </FieldRow>

        <FieldRow
          label="LiteLLM master key"
          hint={
            view?.litellm_master_key_set
              ? `Currently set: ${view.litellm_master_key_masked}. Leave blank to keep, or type a new value to replace.`
              : "Not set."
          }
        >
          <div className="flex gap-2">
            <input
              className="input font-mono"
              placeholder={view?.litellm_master_key_set ? "Leave blank to keep" : "sk-..."}
              type="password"
              autoComplete="new-password"
              value={form.litellm_master_key || ""}
              onChange={(e) => update("litellm_master_key", e.target.value)}
            />
            {view?.overrides_active?.litellm_master_key && (
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => clearOverride("litellm_master_key")}
                title="Remove this override and use the env value"
              >
                Reset
              </button>
            )}
          </div>
        </FieldRow>

        <FieldRow
          label="PostgreSQL DATABASE_URL"
          hint="Direct DB access lets the app surface fallbacks stored in router_settings."
        >
          <div className="flex gap-2">
            <input
              className="input font-mono"
              placeholder={
                view?.database_url_set
                  ? `Currently: ${view.database_url_masked} — leave blank to keep`
                  : "postgresql://litellm:password@litellm_db:5432/litellm"
              }
              type="password"
              autoComplete="new-password"
              value={form.database_url || ""}
              onChange={(e) => update("database_url", e.target.value)}
            />
            {view?.overrides_active?.database_url && (
              <button
                type="button"
                className="btn-ghost shrink-0"
                onClick={() => clearOverride("database_url")}
              >
                Reset
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary mt-2"
            onClick={testDb}
            disabled={testing || !view?.database_url_set}
          >
            {testing ? "Testing..." : "Test connection"}
          </button>
          {testResult && (
            <div
              className={`mt-2 rounded-md px-3 py-2 text-sm ${
                testResult.ok
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-red-500/15 text-red-300"
              }`}
            >
              {testResult.message}
            </div>
          )}
        </FieldRow>

        <FieldRow label="CORS origins" hint="Comma-separated list. Use * for any origin.">
          <input
            className="input"
            value={form.cors_origins || ""}
            onChange={(e) => update("cors_origins", e.target.value)}
          />
        </FieldRow>
      </div>
    </Modal>
  );
}
