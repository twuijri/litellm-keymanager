import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import MultiSelect from "./MultiSelect.jsx";
import FallbackEditor, { fallbacksFromMetadata, fallbacksToWire } from "./FallbackEditor.jsx";
import { api } from "../api.js";

function formatBudget(used, max) {
  const u = Number(used || 0);
  if (max === null || max === undefined) return `$${u.toFixed(4)} / ∞`;
  return `$${u.toFixed(4)} / $${Number(max).toFixed(2)}`;
}

export default function KeyEditor({ open, record, models, onClose, onSaved }) {
  const [alias, setAlias] = useState("");
  const [budget, setBudget] = useState("");
  const [allowed, setAllowed] = useState([]);
  const [fallbacks, setFallbacks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const keyId = record?.token || record?.key_name || record?.key;

  useEffect(() => {
    if (!record) return;
    setAlias(record.key_alias || "");
    setBudget(record.max_budget ?? "");
    setAllowed(record.models || []);
    setFallbacks(fallbacksFromMetadata((record.metadata || {}).fallbacks));
    setError("");
  }, [record]);

  const allModels = useMemo(() => {
    const set = new Set(models || []);
    (record?.models || []).forEach((m) => set.add(m));
    return Array.from(set).sort();
  }, [models, record]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        key: keyId,
        key_alias: alias || null,
        models: allowed,
        max_budget: budget === "" || budget === null ? null : Number(budget),
        fallbacks: fallbacksToWire(fallbacks),
      };
      await api.updateKey(payload);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!record) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <span>Edit key</span>
          {record.key_alias && (
            <span className="rounded-md bg-ink-800 px-2 py-0.5 font-mono text-xs text-ink-300">
              {record.key_alias}
            </span>
          )}
        </span>
      }
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
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

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Alias</label>
            <input className="input" value={alias} onChange={(e) => setAlias(e.target.value)} />
          </div>
          <div>
            <label className="label">Max budget (USD)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              placeholder="unlimited"
              value={budget ?? ""}
              onChange={(e) => setBudget(e.target.value)}
            />
            <p className="mt-1 text-xs text-ink-500">
              Spent: {formatBudget(record.spend, record.max_budget)}
            </p>
          </div>
        </div>

        <div>
          <label className="label">Allowed models</label>
          <MultiSelect
            options={allModels}
            value={allowed}
            onChange={setAllowed}
            placeholder="All models allowed"
          />
          <p className="mt-1 text-xs text-ink-500">
            Empty = all models allowed by the key's team / global config.
          </p>
        </div>

        <div>
          <label className="label">Fallbacks</label>
          <FallbackEditor value={fallbacks} onChange={setFallbacks} availableModels={allModels} />
        </div>

        <details className="rounded-lg border border-ink-700 bg-ink-900 p-3">
          <summary className="cursor-pointer text-xs text-ink-300">Raw key record</summary>
          <pre className="mt-2 overflow-auto text-xs text-ink-300">
            {JSON.stringify(record, null, 2)}
          </pre>
        </details>
      </div>
    </Modal>
  );
}
