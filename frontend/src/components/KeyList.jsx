import { useMemo, useState } from "react";

function shortKey(token) {
  if (!token) return "—";
  if (token.length < 16) return token;
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function FallbackBadge({ metadata }) {
  const fallbacks = metadata?.fallbacks;
  if (!Array.isArray(fallbacks) || fallbacks.length === 0) return null;
  return (
    <span className="pill bg-accent-500/15 text-accent-300" title="Has fallback rules">
      {fallbacks.length} fallback{fallbacks.length === 1 ? "" : "s"}
    </span>
  );
}

function BudgetCell({ spend, max }) {
  const used = Number(spend || 0);
  if (max === null || max === undefined) {
    return (
      <span className="text-ink-300">
        ${used.toFixed(2)} <span className="text-ink-500">/ ∞</span>
      </span>
    );
  }
  const pct = max > 0 ? Math.min(100, (used / Number(max)) * 100) : 0;
  const tone = pct > 90 ? "bg-red-500" : pct > 60 ? "bg-amber-400" : "bg-accent-500";
  return (
    <div>
      <div className="flex justify-between text-xs text-ink-300">
        <span>${used.toFixed(2)}</span>
        <span className="text-ink-500">${Number(max).toFixed(2)}</span>
      </div>
      <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-ink-800">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function KeyList({ keys, loading, query, setQuery, onSelect, onAction }) {
  const [showWithFallbacksOnly, setShowWithFallbacksOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keys.filter((k) => {
      if (showWithFallbacksOnly) {
        const f = k.metadata?.fallbacks;
        if (!Array.isArray(f) || f.length === 0) return false;
      }
      if (!q) return true;
      const haystack = [
        k.key_alias,
        k.token,
        k.user_id,
        k.team_id,
        ...(k.models || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [keys, query, showWithFallbacksOnly]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-ink-700 px-4 py-3">
        <div className="relative flex-1 min-w-[220px]">
          <input
            className="input pl-9"
            placeholder="Search by alias, key, model, team..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">⌕</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-300">
          <input
            type="checkbox"
            className="accent-accent-500"
            checked={showWithFallbacksOnly}
            onChange={(e) => setShowWithFallbacksOnly(e.target.checked)}
          />
          Only with fallbacks
        </label>
        <span className="text-xs text-ink-500">
          {filtered.length} / {keys.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-ink-900/60 text-left text-xs uppercase tracking-wider text-ink-300">
              <th className="px-4 py-3 font-medium">Alias</th>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Models</th>
              <th className="px-4 py-3 font-medium">Budget</th>
              <th className="px-4 py-3 font-medium">Flags</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-500">
                  Loading keys...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-500">
                  No keys match your filters.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((k) => {
                const id = k.token || k.key_name || k.key;
                return (
                  <tr
                    key={id}
                    className="cursor-pointer border-t border-ink-800 hover:bg-ink-800/40"
                    onClick={() => onSelect(k)}
                  >
                    <td className="px-4 py-3">
                      <div className="text-ink-200">{k.key_alias || <span className="text-ink-500">—</span>}</div>
                      {k.team_alias && (
                        <div className="text-xs text-ink-500">team: {k.team_alias}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-300">{shortKey(id)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(k.models || []).slice(0, 4).map((m) => (
                          <span key={m} className="chip">{m}</span>
                        ))}
                        {(k.models || []).length > 4 && (
                          <span className="chip">+{k.models.length - 4}</span>
                        )}
                        {(!k.models || k.models.length === 0) && (
                          <span className="text-xs text-ink-500">all</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <BudgetCell spend={k.spend} max={k.max_budget} />
                    </td>
                    <td className="px-4 py-3">
                      <FallbackBadge metadata={k.metadata} />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1.5">
                        <button className="btn-ghost" onClick={() => onSelect(k)}>Edit</button>
                        <button
                          className="btn-ghost"
                          onClick={() => onAction("clone", k)}
                          title="Clone with new alias"
                        >
                          Clone
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => onAction("regenerate", k)}
                          title="Replace with a new key, keep settings"
                        >
                          Regen
                        </button>
                        <button
                          className="btn-ghost text-red-300 hover:bg-red-500/10"
                          onClick={() => onAction("delete", k)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
