import { useEffect } from "react";
import { TrashIcon, UndoIcon } from "./UiIcons";

export interface DeletedForMeUndoState {
  messageId: string;
  nonce: number;
  expiresAt: number;
}

export function DeleteForMeToast({
  state,
  onUndo,
  onExpire,
}: {
  state: DeletedForMeUndoState | null;
  onUndo: (messageId: string) => void;
  onExpire: (nonce: number) => void;
}) {
  useEffect(() => {
    if (!state) return;
    const remaining = Math.max(0, state.expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      onExpire(state.nonce);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [onExpire, state]);

  if (!state) return null;

  return (
    <div
      key={state.nonce}
      className="delete-undo-toast"
      role="status"
      aria-live="polite"
    >
      <div className="delete-undo-toast-row">
        <span className="delete-undo-toast-icon" aria-hidden="true">
          <TrashIcon size={16} />
        </span>
        <span className="delete-undo-toast-label">
          Deleted the message for me.
        </span>
        <button
          type="button"
          className="delete-undo-toast-btn"
          onClick={() => onUndo(state.messageId)}
        >
          <UndoIcon size={14} />
          <span>Undo</span>
        </button>
      </div>
      <div className="delete-undo-toast-progress" />
    </div>
  );
}
