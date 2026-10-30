import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { createPortal } from "react-dom";

function readSafeAreaPx(varName: string): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function ContextMenu({
  x,
  y,
  label,
  className,
  variant = "context",
  externalClosing = false,
  onClose,
  children,
}: {
  x: number;
  y: number;
  label: string;
  className: string;
  variant?: "context" | "dropdown";
  externalClosing?: boolean;
  onClose: () => void;
  children:
    | ReactNode
    | ((helpers: { closeWithAnimation: (afterClose?: () => void) => void }) => ReactNode);
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef<number>(Date.now());
  const backdropPressedAfterOpenRef = useRef(false);
  const menuPressedAfterOpenRef = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight?: number }>({
    left: x,
    top: y,
  });
  const [closing, setClosing] = useState(false);

  const closeWithAnimation = useCallback(
    (afterClose?: () => void) => {
      if (closing) return;
      setClosing(true);
      window.setTimeout(() => {
        onClose();
        afterClose?.();
      }, 165);
    },
    [closing, onClose],
  );

  const requestClose = useCallback(() => {
    closeWithAnimation();
  }, [closeWithAnimation]);

  useEffect(() => {
    if (externalClosing && !closing) {
      closeWithAnimation();
    }
  }, [closeWithAnimation, closing, externalClosing]);

  useEffect(() => {
    openedAtRef.current = Date.now();
    backdropPressedAfterOpenRef.current = false;
    menuPressedAfterOpenRef.current = false;
  }, []);

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
    const isMobileViewport =
      Capacitor.isNativePlatform() ||
      window.innerWidth <= 820 ||
      Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);

    const safeTop = readSafeAreaPx("--safe-area-inset-top");
    const safeBottom = readSafeAreaPx("--safe-area-inset-bottom");
    const sidePad = isMobileViewport ? 14 : 8;
    const topPad = isMobileViewport
      ? variant === "dropdown"
        ? Math.max(12, safeTop + 8)
        : Math.max(56, safeTop + 18)
      : 8;
    const bottomPad = isMobileViewport
      ? variant === "dropdown"
        ? Math.max(84, safeBottom + 56)
        : Math.max(98, safeBottom + 76)
      : 8;

    const maxMenuHeight = isMobileViewport
      ? Math.max(200, window.innerHeight - topPad - bottomPad)
      : undefined;
    const effectiveHeight =
      maxMenuHeight !== undefined ? Math.min(menu.offsetHeight, maxMenuHeight) : menu.offsetHeight;

    const next = {
      left: Math.max(sidePad, Math.min(x, window.innerWidth - menu.offsetWidth - sidePad)),
      top: Math.max(topPad, Math.min(y, window.innerHeight - effectiveHeight - bottomPad)),
      maxHeight: maxMenuHeight,
    };
    setPosition((current) =>
      current.left === next.left &&
      current.top === next.top &&
      current.maxHeight === next.maxHeight
        ? current
        : next,
    );
  }, [children, variant, x, y]);

  return createPortal(
    <div
      className={`context-menu-backdrop ${closing ? "is-closing" : ""}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          backdropPressedAfterOpenRef.current = true;
        }
      }}
      onTouchStart={(event) => {
        if (event.target === event.currentTarget) {
          backdropPressedAfterOpenRef.current = true;
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          backdropPressedAfterOpenRef.current = true;
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        // Ignore synthetic click emitted when lifting the initial mobile long-press finger!
        if (!backdropPressedAfterOpenRef.current) return;
        requestClose();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        // Ignore Android WebView's delayed 500ms native contextmenu event from the opening hold!
        if (Date.now() - openedAtRef.current < 450) return;
        requestClose();
      }}
    >
      <div
        ref={menuRef}
        className={`${className} ${variant === "dropdown" ? "header-dropdown-menu" : ""} ${
          closing || externalClosing ? "is-closing closing" : ""
        }`}
        role="menu"
        aria-label={label}
        style={{
          left: position.left,
          top: position.top,
          ...(position.maxHeight ? { maxHeight: position.maxHeight, overflowY: "auto" } : {}),
        }}
        onPointerDownCapture={() => {
          menuPressedAfterOpenRef.current = true;
        }}
        onTouchStartCapture={() => {
          menuPressedAfterOpenRef.current = true;
        }}
        onMouseDownCapture={() => {
          menuPressedAfterOpenRef.current = true;
        }}
        onClickCapture={(event) => {
          // Allow keyboard activation (detail === 0), block synthetic click on finger release after hold
          if (
            event.detail !== 0 &&
            !menuPressedAfterOpenRef.current &&
            Date.now() - openedAtRef.current < 1200
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {typeof children === "function" ? children({ closeWithAnimation }) : children}
      </div>
    </div>,
    document.body,
  );
}
