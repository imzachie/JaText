import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ContextMenu({
  x,
  y,
  label,
  className,
  onClose,
  children,
}: {
  x: number;
  y: number;
  label: string;
  className: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [closing, setClosing] = useState(false);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      onClose();
    }, 165);
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const next = {
      left: Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8)),
    };
    setPosition((current) =>
      current.left === next.left && current.top === next.top ? current : next,
    );
  }, [children, x, y]);

  return createPortal(
    <div
      className={`context-menu-backdrop ${closing ? "is-closing" : ""}`}
      onClick={requestClose}
      onContextMenu={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <div
        ref={menuRef}
        className={`${className} ${closing ? "is-closing closing" : ""}`}
        role="menu"
        aria-label={label}
        style={{ left: position.left, top: position.top }}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
