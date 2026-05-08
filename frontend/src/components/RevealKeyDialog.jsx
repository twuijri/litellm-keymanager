import Modal from "./Modal.jsx";
import CopyField from "./CopyField.jsx";

export default function RevealKeyDialog({ open, payload, onClose, title = "Key created" }) {
  const keyValue = payload?.key || payload?.token || "";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <button className="btn-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          This key is shown only once. Copy it now — you won't see it again.
        </div>
        {keyValue ? <CopyField value={keyValue} label="Secret key" /> : null}
        {payload?.key_alias && (
          <CopyField value={payload.key_alias} label="Alias" mono={false} />
        )}
        {payload && (
          <details className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <summary className="cursor-pointer text-xs text-ink-300">Full response</summary>
            <pre className="mt-2 overflow-auto text-xs text-ink-300">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </Modal>
  );
}
