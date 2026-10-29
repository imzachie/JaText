import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "./UiIcons";

type ModalCloseEntry = {
  id: number;
  close: () => void;
};

let nextModalEntryId = 1;
const activeModalStack: ModalCloseEntry[] = [];
const stackListeners = new Set<() => void>();

function notifyStackListeners() {
  for (const listener of stackListeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

export function getActiveAnimatedModalCount(): number {
  return activeModalStack.length;
}

export function subscribeAnimatedModalStack(listener: () => void): () => void {
  stackListeners.add(listener);
  return () => {
    stackListeners.delete(listener);
  };
}

export function closeTopmostAnimatedModal(): boolean {
  const top = activeModalStack[activeModalStack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function AnimatedModal({
  open = true,
  onClose,
  backdropClassName = "modal-backdrop",
  cardClassName = "modal-card",
  showCloseButton = true,
  closeLabel = "Close",
  zIndex,
  children,
}: {
  open?: boolean;
  onClose: () => void;
  backdropClassName?: string;
  cardClassName?: string;
  showCloseButton?: boolean;
  closeLabel?: string;
  zIndex?: number;
  children: (requestClose: () => void) => ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const requestCloseRef = useRef<() => void>(() => {});

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 185);
  }, [closing, onClose]);

  useEffect(() => {
    requestCloseRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = nextModalEntryId++;
    activeModalStack.push({
      id,
      close: () => requestCloseRef.current(),
    });
    notifyStackListeners();
    return () => {
      const idx = activeModalStack.findIndex((item) => item.id === id);
      if (idx !== -1) {
        activeModalStack.splice(idx, 1);
        notifyStackListeners();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const top = activeModalStack[activeModalStack.length - 1];
        if (!top) return;
        event.preventDefault();
        top.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`${backdropClassName} ${closing ? "is-closing" : ""}`}
      style={zIndex !== undefined ? { zIndex } : undefined}
      onClick={requestClose}
    >
      <div
        className={`${cardClassName} ${closing ? "is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            type="button"
            className="modal-close animated-x-btn"
            onClick={requestClose}
            aria-label={closeLabel}
          >
            <CloseIcon size={17} />
          </button>
        )}
        {children(requestClose)}
      </div>
    </div>
  );
}
