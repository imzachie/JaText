import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function AnimatedModal({
  open = true,
  onClose,
  backdropClassName = "modal-backdrop",
  cardClassName = "modal-card",
  showCloseButton = true,
  closeLabel = "Close",
  children,
}: {
  open?: boolean;
  onClose: () => void;
  backdropClassName?: string;
  cardClassName?: string;
  showCloseButton?: boolean;
  closeLabel?: string;
  children: (requestClose: () => void) => ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 185);
  }, [closing, onClose]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div
      className={`${backdropClassName} ${closing ? "is-closing" : ""}`}
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
            ✕
          </button>
        )}
        {children(requestClose)}
      </div>
    </div>
  );
}
