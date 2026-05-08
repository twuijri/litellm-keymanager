import { useState } from "react";
import Modal from "./Modal.jsx";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  inputLabel,
  inputPlaceholder,
  defaultValue = "",
  onCancel,
  onConfirm,
}) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onConfirm(inputLabel ? value : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className={danger ? "btn-danger" : "btn-primary"} onClick={run} disabled={busy}>
            {busy ? "Working..." : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {message && <p className="text-sm text-ink-200">{message}</p>}
        {inputLabel && (
          <div>
            <label className="label">{inputLabel}</label>
            <input
              autoFocus
              className="input"
              placeholder={inputPlaceholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") run();
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
