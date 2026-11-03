import { useState } from "react";
import type { GroupSummary } from "../lib/types";
import { IosEmojiText } from "./IosEmoji";
import { CloseIcon, TrashIcon } from "./UiIcons";

interface DeleteGroupConfirmModalProps {
  group: Pick<GroupSummary, "id" | "name" | "role" | "isCommunity">;
  isCommunity?: boolean;
  onCancel: () => void;
  onConfirmDelete: () => Promise<void>;
}

export function DeleteGroupConfirmModal({
  group,
  isCommunity,
  onCancel,
  onConfirmDelete,
}: DeleteGroupConfirmModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typedName, setTypedName] = useState("");
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const comm = Boolean(isCommunity ?? group.isCommunity);
  const entityLower = comm ? "community" : "group";
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
      setError(
        err instanceof Error ? err.message : `Couldn't delete this ${entityLower}.`,
      );
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
              <h2>Delete {entityLower}</h2>
              <p className="muted small">
                Step {step} of 2 · Owner permanent deletion
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
              Are you sure you want to permanently delete{" "}
              <strong>
                <IosEmojiText text={group.name} />
              </strong>
              ? All messages, attachments, and member access will be permanently
              erased for everyone immediately.
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
              To confirm, type the exact {entityLower} name{" "}
              <code className="delete-group-name-chip">
                <IosEmojiText text={group.name} />
              </code>{" "}
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
                {busy ? "Deleting…" : `Delete ${entityLower}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

interface RemoveGroupChatModalProps {
  group: Pick<GroupSummary, "id" | "name" | "isCommunity">;
  isCommunity?: boolean;
  onCancel: () => void;
  onConfirmRemoveChat: () => Promise<void>;
}

export function RemoveGroupChatModal({
  group,
  isCommunity,
  onCancel,
  onConfirmRemoveChat,
}: RemoveGroupChatModalProps) {
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const comm = Boolean(isCommunity ?? group.isCommunity);
  const entityLower = comm ? "community" : "group";

  function requestClose() {
    if (busy || closing) return;
    setClosing(true);
    window.setTimeout(onCancel, 170);
  }

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirmRemoveChat();
      onCancel();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Couldn't clear ${entityLower} chat history.`,
      );
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
              <h2>Remove chat</h2>
              <p className="muted small">
                Clears history for you · Stays in {entityLower}
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

        <div className="delete-group-step">
          <p className="delete-group-warning-text">
            Clear your chat history in{" "}
            <strong>
              <IosEmojiText text={group.name} />
            </strong>
            ? You will <strong>stay in the {entityLower}</strong> and still
            receive new messages, while other members keep their copy of the
            chat.
          </p>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="delete-group-actions">
            <button
              type="button"
              className="ghost-btn"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger-solid-btn"
              disabled={busy}
              onClick={() => void handleConfirm()}
            >
              {busy ? "Clearing…" : "Remove chat"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
