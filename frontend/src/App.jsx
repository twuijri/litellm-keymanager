import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api.js";
import Login from "./components/Login.jsx";
import KeyList from "./components/KeyList.jsx";
import KeyEditor from "./components/KeyEditor.jsx";
import NewKeyDialog from "./components/NewKeyDialog.jsx";
import RevealKeyDialog from "./components/RevealKeyDialog.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import SettingsDialog from "./components/SettingsDialog.jsx";

function extractKeys(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.keys)) return payload.keys;
  return [];
}

function extractModelNames(payload) {
  const list = (payload && payload.data) || payload;
  if (!Array.isArray(list)) return [];
  const names = list
    .map((m) => m?.model_name || m?.model_info?.model || m?.name)
    .filter(Boolean);
  return Array.from(new Set(names)).sort();
}

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [user, setUser] = useState(null);

  const [keys, setKeys] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [keysResp, modelsResp] = await Promise.all([api.listKeys(), api.models()]);
      setKeys(extractKeys(keysResp));
      setModels(extractModelNames(modelsResp));
    } catch (err) {
      if (err.status === 401) {
        setAuthed(false);
      } else {
        setError(err.message || "Failed to load");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    api.me()
      .then((u) => setUser(u))
      .catch(() => setAuthed(false));
    refresh();
  }, [authed, refresh]);

  function logout() {
    setToken(null);
    setUser(null);
    setAuthed(false);
  }

  function handleAction(action, record) {
    const id = record.token || record.key_name || record.key;
    if (action === "delete") {
      setConfirm({
        title: "Delete key?",
        message: `This will permanently delete key "${record.key_alias || id}". Apps using it will stop working immediately.`,
        confirmLabel: "Delete",
        danger: true,
        onConfirm: async () => {
          try {
            await api.deleteKey(id);
            setConfirm(null);
            refresh();
          } catch (err) {
            setError(err.message);
            setConfirm(null);
          }
        },
      });
    } else if (action === "clone") {
      setConfirm({
        title: "Clone key",
        message: `Create a new key with the same models, budget, and fallbacks as "${record.key_alias || id}".`,
        confirmLabel: "Clone",
        inputLabel: "New alias",
        inputPlaceholder: "alias for the cloned key",
        defaultValue: record.key_alias ? `${record.key_alias}-copy` : "",
        onConfirm: async (alias) => {
          if (!alias) return;
          try {
            const created = await api.cloneKey(id, alias);
            setConfirm(null);
            setRevealed({ payload: created, title: "Cloned key created" });
            refresh();
          } catch (err) {
            setError(err.message);
            setConfirm(null);
          }
        },
      });
    } else if (action === "regenerate") {
      setConfirm({
        title: "Regenerate key",
        message:
          "The old key will be deleted and a new one issued with the same settings. Anything still using the old key will break.",
        confirmLabel: "Regenerate",
        danger: true,
        onConfirm: async () => {
          try {
            const created = await api.regenerateKey(id, null);
            setConfirm(null);
            setRevealed({ payload: created, title: "Key regenerated" });
            refresh();
          } catch (err) {
            setError(err.message);
            setConfirm(null);
          }
        },
      });
    }
  }

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-800 bg-ink-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent-500 text-white">
              <span className="font-bold">K</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-ink-200">LiteLLM Key Manager</h1>
              <p className="text-xs text-ink-500">Virtual key & fallback admin</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={refresh} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + New key
            </button>
            <button className="btn-ghost" onClick={() => setShowSettings(true)} title="Settings">
              Settings
            </button>
            {user && (
              <span className="hidden text-xs text-ink-300 sm:inline">{user.username}</span>
            )}
            <button className="btn-ghost" onClick={logout} title="Sign out">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <KeyList
          keys={keys}
          loading={loading}
          query={query}
          setQuery={setQuery}
          onSelect={(k) => setEditing(k)}
          onAction={handleAction}
        />
      </main>

      <KeyEditor
        open={!!editing}
        record={editing}
        models={models}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />

      <NewKeyDialog
        open={creating}
        models={models}
        onClose={() => setCreating(false)}
        onCreated={(payload) => {
          setCreating(false);
          setRevealed({ payload, title: "Key created" });
          refresh();
        }}
      />

      <RevealKeyDialog
        open={!!revealed}
        payload={revealed?.payload}
        title={revealed?.title}
        onClose={() => setRevealed(null)}
      />

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />

      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          inputLabel={confirm.inputLabel}
          inputPlaceholder={confirm.inputPlaceholder}
          defaultValue={confirm.defaultValue}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      )}
    </div>
  );
}
