export default function ConfirmDialog({
  open,
  title = "Confirm Action",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="confirm-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="confirm-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`confirm-dialog-icon ${tone}`} aria-hidden="true">
          !
        </div>
        <div className="confirm-dialog-body">
          <h3 id="confirm-dialog-title">{title}</h3>
          <p>{message}</p>
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog-confirm ${tone}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
