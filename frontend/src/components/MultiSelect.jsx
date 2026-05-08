import { useMemo, useRef, useState, useEffect } from "react";

export default function MultiSelect({ options, value, onChange, placeholder = "Select..." }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const visible = useMemo(() => {
    const f = filter.toLowerCase();
    return options.filter((o) => !f || o.toLowerCase().includes(f));
  }, [options, filter]);

  const selected = new Set(value || []);

  function toggle(opt) {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(Array.from(next));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="input flex flex-wrap items-center gap-1.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {value?.length ? (
          value.map((v) => (
            <span key={v} className="chip">
              {v}
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(v);
                }}
                className="-mr-1 ml-1 cursor-pointer text-ink-300 hover:text-ink-200"
              >
                ×
              </span>
            </span>
          ))
        ) : (
          <span className="text-ink-500">{placeholder}</span>
        )}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-ink-700 bg-ink-900 p-2 shadow-xl shadow-black/40">
          <input
            className="input mb-2"
            placeholder="Filter..."
            value={filter}
            autoFocus
            onChange={(e) => setFilter(e.target.value)}
          />
          {visible.length === 0 && (
            <div className="px-2 py-1 text-xs text-ink-500">No options</div>
          )}
          {visible.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-ink-800"
            >
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => toggle(opt)}
                className="accent-accent-500"
              />
              <span className="text-sm text-ink-200">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
