import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Capacitor } from "@capacitor/core";

const TRIGGER_PX = 56;
const MAX_PULL_PX = 84;

function isMobileTouchDevice(): boolean {
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
  const trackRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileTouchDevice());
  const gestureRef = useRef<{
    active: boolean;
    lockedAxis: "none" | "x" | "y";
    startX: number;
    startY: number;
    dx: number;
    hapticFired: boolean;
  }>({
    active: false,
    lockedAxis: "none",
    startX: 0,
    startY: 0,
    dx: 0,
    hapticFired: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsMobile(isMobileTouchDevice());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  function applyOffset(px: number, animate: boolean) {
    const track = trackRef.current;
    const icon = iconRef.current;
    if (track) {
      track.style.transition = animate
        ? "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
      track.style.transform = px > 0 ? `translate3d(${px}px, 0, 0)` : "";
    }
    if (icon) {
      const progress = Math.min(1, px / TRIGGER_PX);
      icon.style.transition = animate
        ? "opacity 200ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
      icon.style.opacity = px > 4 ? `${progress}` : "0";
      icon.style.transform = `translate3d(${Math.min(14, px * 0.22) - 8}px, 0, 0) scale(${
        0.5 + progress * 0.5
      })`;
      icon.classList.toggle("armed", px >= TRIGGER_PX);
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (disabled || !isMobileTouchDevice() || event.touches.length !== 1) return;
    const t = event.touches[0];
    gestureRef.current = {
      active: true,
      lockedAxis: "none",
      startX: t.clientX,
      startY: t.clientY,
      dx: 0,
      hapticFired: false,
    };
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g.active || event.touches.length !== 1) return;
    const t = event.touches[0];
    const rawDx = t.clientX - g.startX;
    const rawDy = t.clientY - g.startY;

    if (g.lockedAxis === "none") {
      if (Math.abs(rawDx) < 8 && Math.abs(rawDy) < 8) return;
      if (rawDx > 0 && Math.abs(rawDx) > Math.abs(rawDy) * 1.25) {
        g.lockedAxis = "x";
      } else {
        g.lockedAxis = "y";
        g.active = false;
        return;
      }
    }

    if (g.lockedAxis !== "x") return;

    const clamped = Math.max(
      0,
      Math.min(
        MAX_PULL_PX,
        rawDx <= TRIGGER_PX
          ? rawDx
          : TRIGGER_PX + (rawDx - TRIGGER_PX) * 0.34,
      ),
    );
    g.dx = clamped;
    if (clamped >= TRIGGER_PX && !g.hapticFired) {
      g.hapticFired = true;
      try {
        navigator.vibrate?.(12);
      } catch {
        // Ignore on unsupported browsers
      }
    } else if (clamped < TRIGGER_PX - 6) {
      g.hapticFired = false;
    }
    applyOffset(clamped, false);
  }

  function finishGesture(trigger: boolean) {
    const g = gestureRef.current;
    if (!g.active) return;
    const shouldReply = trigger && g.lockedAxis === "x" && g.dx >= TRIGGER_PX;
    g.active = false;
    g.lockedAxis = "none";
    g.dx = 0;
    applyOffset(0, true);
    if (shouldReply) {
      onReply();
    }
  }

  return (
    <div
      className="swipe-reply-wrap"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => finishGesture(true)}
      onTouchCancel={() => finishGesture(false)}
    >
      {isMobile && !disabled && (
        <div
          ref={iconRef}
          className="swipe-reply-indicator"
          aria-hidden="true"
          style={{ opacity: 0, transform: "translate3d(-8px, 0, 0) scale(0.5)" }}
        >
          <span className="swipe-reply-badge">↩</span>
        </div>
      )}
      <div ref={trackRef} className="swipe-reply-content">
        {children}
      </div>
    </div>
  );
}
