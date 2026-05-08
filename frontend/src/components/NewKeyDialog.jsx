import { useState } from "react";
import Modal from "./Modal.jsx";
import MultiSelect from "./MultiSelect.jsx";
import FallbackEditor, { fallbacksToWire } from "./FallbackEditor.jsx";
import { api } from "../api.js";

export default function NewKeyDialog({ open, models, onClose, onCreated }) {
  const [alias, setAlias] = useState("");
  const [budget, setBudget] = useState("");
  const [allowed, setAllowed] = useState([]);
  const [fallbacks, setFallbacks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setAlias("");
    setBudget("");
    setAllowed([]);
    setFallbacks([]);
    setError("");
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        key_alias: alias || null,
        models: allowed,
        max_budget: budget === "" ? null : Number(budget),
        fallbacks: fallbacksToWire(fallbacks),
      };
      const created = await api.generateKey(payload);
      reset();
      onCreated?.(created);
    } catch (err) {
      setError(err.message || "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="lg"
      title="Create new key"
      footer={
        <>
          <button
            className="btn-ghost"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={saving}
          >
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Creating..." : "Create key"}
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
            <input
              className="input"
              value={alias}
              autoFocus
              onChange={(e) => setAlias(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Max budget (USD)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              placeholder="unlimited"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Allowed models</label>
          <MultiSelect
            options={models || []}
            value={allowed}
            onChange={setAllowed}
            placeholder="All models allowed"
          />
        </div>
        <div>
          <label className="label">Fallbacks</label>
          <FallbackEditor value={fallbacks} onChange={setFallbacks} availableModels={models} />
        </div>
      </div>
    </Modal>
  );
}
