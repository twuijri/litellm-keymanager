import { useState } from "react";

export default function CopyField({ value, mono = true, label }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op */
    }
  }

  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="flex items-stretch gap-2">
        <code
          className={`flex-1 truncate rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm ${
            mono ? "font-mono" : ""
          } text-ink-200`}
          title={value}
        >
          {value}
        </code>
        <button onClick={copy} className="btn-secondary shrink-0">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
