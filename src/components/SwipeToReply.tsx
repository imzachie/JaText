import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { ReplyIcon } from "./UiIcons";

const TRIGGER_PX = 58;
const MAX_PULL_PX = 86;

function computeMobileSwipeCapable(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  return coarse || window.innerWidth <= 820;
}

let cachedMobileCapable = computeMobileSwipeCapable();
const mobileCapableListeners = new Set<() => void>();
let mobileWatcherInstalled = false;

function ensureMobileWatcher(): void {
  if (mobileWatcherInstalled || typeof window === "undefined") return;
  mobileWatcherInstalled = true;
  const update = () => {
    const next = computeMobileSwipeCapable();
    if (next !== cachedMobileCapable) {
      cachedMobileCapable = next;
      for (const fn of mobileCapableListeners) fn();
    }
  };
  window.addEventListener("resize", update, { passive: true });
  const mq = window.matchMedia?.("(pointer: coarse)");
  mq?.addEventListener?.("change", update);
}

function subscribeMobileCapable(cb: () => void): () => void {
  ensureMobileWatcher();
  mobileCapableListeners.add(cb);
  return () => {
    mobileCapableListeners.delete(cb);
  };
}

function getMobileCapableSnapshot(): boolean {
  return cachedMobileCapable;
}

/**
 * Mobile-only left-to-right swipe wrapper for message bubbles using 100% passive native
 * touch listeners and direct GPU transforms (zero React re-renders during gesture and zero
 * main-thread scroll blocking on Android/iOS).
 */
export function SwipeToReply({
  disabled = false,
  onReply,
  children,
}: {
  disabled?: boolean;
  onReply: () => void;
  children: ReactNode;
}) {
  const isMobile = useSyncExternalStore(
    subscribeMobileCapable,
    getMobileCapableSnapshot,
    () => false,
  );
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  useEffect(() => {
    if (!isMobile || disabled) return;
    const el = wrapRef.current;
    if (!el) return;

    let active = false;
    let startX = 0;
    let startY = 0;
    let lockedAxis: "x" | "y" | null = null;
    let currentOffset = 0;
    let armed = false;
    let rafId = 0;

    const applyVisual = (px: number, snapping: boolean) => {
      const track = trackRef.current;
      const badge = badgeRef.current;
      if (track) {
        track.style.transition = snapping
          ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)"
          : "none";
        track.style.transform = px > 0 ? `translate3d(${px}px, 0, 0)` : "";
      }
      if (badge) {
        const progress = Math.min(1, px / TRIGGER_PX);
        badge.style.opacity = px > 2 ? String(progress) : "0";
        badge.style.transform = `translateY(-50%) scale(${0.55 + progress * 0.45})`;
        badge.classList.toggle("armed", px >= TRIGGER_PX);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [data-no-swipe-reply='true']")) {
        return;
      }
      const t = e.touches[0];
      active = true;
      startX = t.clientX;
      startY = t.clientY;
      lockedAxis = null;
      currentOffset = 0;
      armed = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (!lockedAxis) {
        if (Math.abs(dx) < 9 && Math.abs(dy) < 9) return;
        if (dx > 9 && Math.abs(dx) > Math.abs(dy) * 1.35) {
          lockedAxis = "x";
        } else {
          lockedAxis = "y";
          active = false;
          return;
        }
      }

      if (lockedAxis !== "x") return;

      const clamped = Math.max(0, dx - 6);
      const damped =
        clamped <= TRIGGER_PX
          ? clamped
          : Math.min(MAX_PULL_PX, TRIGGER_PX + (clamped - TRIGGER_PX) * 0.35);

      if (damped >= TRIGGER_PX && !armed) {
        armed = true;
        try {
          navigator.vibrate?.(10);
        } catch {
          // Ignore unsupported vibrate API
        }
      } else if (damped < TRIGGER_PX - 6 && armed) {
        armed = false;
      }

      currentOffset = damped;
      if (!rafId) {
        rafId = window.requestAnimationFrame(() => {
          rafId = 0;
          applyVisual(currentOffset, false);
        });
      }
    };

    const finishGesture = (cancelled: boolean) => {
      if (!active && currentOffset === 0) return;
      const shouldTrigger = !cancelled && lockedAxis === "x" && currentOffset >= TRIGGER_PX;
      active = false;
      lockedAxis = null;
      currentOffset = 0;
      armed = false;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      applyVisual(0, true);
      if (shouldTrigger) {
        onReplyRef.current();
      }
    };

    const onTouchEnd = () => finishGesture(false);
    const onTouchCancel = () => finishGesture(true);

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [disabled, isMobile]);

  if (!isMobile || disabled) {
    return <>{children}</>;
  }

  return (
    <div ref={wrapRef} className="swipe-reply-wrap">
      <div
        ref={badgeRef}
        className="swipe-reply-badge"
        style={{ opacity: 0, transform: "translateY(-50%) scale(0.55)" }}
        aria-hidden="true"
      >
        <ReplyIcon size={15} />
      </div>
      <div ref={trackRef} className="swipe-reply-track">
        {children}
      </div>
    </div>
  );
}
