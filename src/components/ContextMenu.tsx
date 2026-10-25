import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
      className="context-menu-backdrop"
      onClick={onClose}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={menuRef}
        className={className}
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
