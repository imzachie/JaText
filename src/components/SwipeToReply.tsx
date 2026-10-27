import { useRef, type ReactNode, type TouchEvent } from "react";
import { Capacitor } from "@capacitor/core";

const SWIPE_TRIGGER_PX = 52;
const MAX_PULL_PX = 78;

function isMobileTouchEnvironment(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(pointer: coarse)").matches ||
    window.innerWidth <= 820
  );
}

export function SwipeToReply({
  disabled = false,
  onReply,
  children,
}: {
  disabled?: boolean;
  onReply: () => void;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    locked: "none" | "horizontal" | "vertical";
    offset: number;
    armed: boolean;
  } | null>(null);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (disabled || e.touches.length !== 1 || !isMobileTouchEnvironment()) {
      gestureRef.current = null;
      return;
    }
    const t = e.touches[0];
    gestureRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      locked: "none",
      offset: 0,
      armed: false,
    };
    if (contentRef.current) {
      contentRef.current.style.transition = "none";
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;

    if (g.locked === "none") {
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
        g.locked = "vertical";
        return;
      }
      if (dx > 13 && dx > Math.abs(dy) * 1.45) {
        g.locked = "horizontal";
      } else {
        return;
      }
    }

    if (g.locked !== "horizontal") return;

    const clamped = Math.max(0, Math.min(MAX_PULL_PX, dx * 0.72));
    g.offset = clamped;
    const armed = clamped >= SWIPE_TRIGGER_PX;
    g.armed = armed;

    if (contentRef.current) {
      contentRef.current.style.transform = `translate3d(${clamped}px, 0, 0)`;
    }
    if (badgeRef.current) {
      const progress = Math.min(1, clamped / SWIPE_TRIGGER_PX);
      badgeRef.current.style.opacity = `${progress}`;
      badgeRef.current.style.transform = `translateY(-50%) scale(${0.55 + progress * 0.45})`;
      badgeRef.current.classList.toggle("armed", armed);
    }
  };

  const finishGesture = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || g.locked !== "horizontal") return;

    if (contentRef.current) {
      contentRef.current.style.transition = "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";
      contentRef.current.style.transform = "translate3d(0px, 0, 0)";
    }
    if (badgeRef.current) {
      badgeRef.current.style.transition = "opacity 180ms ease, transform 200ms ease";
      badgeRef.current.style.opacity = "0";
      badgeRef.current.style.transform = "translateY(-50%) scale(0.5)";
      badgeRef.current.classList.remove("armed");
    }

    if (g.armed) {
      try {
        navigator.vibrate?.(12);
      } catch {
        // Ignore if vibration unsupported.
      }
      onReply();
    }
  };

  return (
    <div
      className="swipe-reply-wrap"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={finishGesture}
      onTouchCancel={finishGesture}
    >
      <div ref={badgeRef} className="swipe-reply-indicator" aria-hidden="true">
        ↩
      </div>
      <div ref={contentRef} className="swipe-reply-content">
        {children}
      </div>
    </div>
  );
}
