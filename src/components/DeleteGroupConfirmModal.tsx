import { useState } from "react";
import type { GroupSummary } from "../lib/types";
import { CloseIcon, TrashIcon } from "./UiIcons";

interface DeleteGroupConfirmModalProps {
  group: Pick<GroupSummary, "id" | "name" | "role">;
  onCancel: () => void;
  onConfirmDelete: () => Promise<void>;
}

export function DeleteGroupConfirmModal({
  group,
  onCancel,
  onConfirmDelete,
}: DeleteGroupConfirmModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typedName, setTypedName] = useState("");
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isOwner = group.role === "owner";
  const exactMatch = typedName === group.name;

  function requestClose() {
    if (busy || closing) return;
    setClosing(true);
    window.setTimeout(onCancel, 170);
  }

  async function handleFinalDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!exactMatch || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirmDelete();
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this group.");
      setBusy(false);
    }
  }

  return (
    <div
      className={`modal-backdrop ${closing ? "closing" : ""}`}
      onClick={requestClose}
    >
      <div
        className={`modal-card delete-group-modal ${closing ? "closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div className="delete-group-title-wrap">
            <span className="delete-group-danger-icon" aria-hidden="true">
              <TrashIcon size={17} />
            </span>
            <div>
              <h2>Delete group</h2>
              <p className="muted small">
                Step {step} of 2 · Confirmation required
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={requestClose}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {step === 1 ? (
          <div className="delete-group-step">
            <p className="delete-group-warning-text">
              {isOwner ? (
                <>
                  Are you sure you want to permanently delete{" "}
                  <strong>{group.name}</strong>? All messages, attachments, and
                  member access will be permanently erased for everyone.
                </>
              ) : (
                <>
                  Are you sure you want to remove and leave{" "}
                  <strong>{group.name}</strong>? It will be removed from your
                  chats immediately.
                </>
              )}
            </p>
            <div className="delete-group-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={requestClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-solid-btn"
                onClick={() => setStep(2)}
              >
                Yes, continue
              </button>
            </div>
          </div>
        ) : (
          <form className="delete-group-step" onSubmit={handleFinalDelete}>
            <p className="delete-group-warning-text">
              To confirm, type the exact group name{" "}
              <code className="delete-group-name-chip">{group.name}</code>{" "}
              below:
            </p>
            <input
              type="text"
              className="delete-group-confirm-input"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={group.name}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            {error ? <div className="form-error">{error}</div> : null}
            <div className="delete-group-actions">
              <button
                type="button"
                className="ghost-btn"
                disabled={busy}
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="submit"
                className="danger-solid-btn"
                disabled={!exactMatch || busy}
              >
                {busy ? "Deleting…" : "Delete group"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
