import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
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

interface SwipeRegistration {
  badgeEl: HTMLDivElement | null;
  trackEl: HTMLDivElement | null;
  onReply: () => void;
}

const swipeRegistry = new Map<HTMLElement, SwipeRegistration>();
let globalSwipeInstalled = false;

function ensureGlobalSwipeDelegator(): void {
  if (globalSwipeInstalled || typeof window === "undefined") return;
  globalSwipeInstalled = true;

  let activeWrap: HTMLElement | null = null;
  let activeReg: SwipeRegistration | null = null;
  let startX = 0;
  let startY = 0;
  let lockedAxis: "x" | "y" | null = null;
  let currentOffset = 0;
  let armed = false;
  let rafId = 0;
  let hideTimerId = 0;

  const applyVisual = (reg: SwipeRegistration, px: number, snapping: boolean) => {
    const track = reg.trackEl;
    const badge = reg.badgeEl;
    if (track) {
      track.style.transition = snapping
        ? "transform 210ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
      track.style.transform = px > 0 ? `translate3d(${px}px, 0, 0)` : "";
    }
    if (badge) {
      if (px > 2) {
        if (hideTimerId) {
          window.clearTimeout(hideTimerId);
          hideTimerId = 0;
        }
        badge.style.display = "flex";
        const progress = Math.min(1, px / TRIGGER_PX);
        badge.style.opacity = String(progress);
        badge.style.transform = `translate3d(0, -50%, 0) scale(${0.55 + progress * 0.45})`;
        badge.classList.toggle("armed", px >= TRIGGER_PX);
      } else {
        badge.style.opacity = "0";
        badge.style.transform = "translate3d(0, -50%, 0) scale(0.55)";
        badge.classList.remove("armed");
        if (snapping) {
          if (hideTimerId) window.clearTimeout(hideTimerId);
          hideTimerId = window.setTimeout(() => {
            badge.style.display = "none";
            hideTimerId = 0;
          }, 215);
        } else {
          badge.style.display = "none";
        }
      }
    }
  };

  const resetActive = (cancelled: boolean) => {
    if (!activeReg) {
      activeWrap = null;
      lockedAxis = null;
      currentOffset = 0;
      armed = false;
      return;
    }
    const reg = activeReg;
    const shouldTrigger = !cancelled && lockedAxis === "x" && currentOffset >= TRIGGER_PX;
    activeWrap = null;
    activeReg = null;
    lockedAxis = null;
    const hadOffset = currentOffset > 0;
    currentOffset = 0;
    armed = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (hadOffset) {
      applyVisual(reg, 0, true);
    }
    if (shouldTrigger) {
      reg.onReply();
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("input, textarea, [data-no-swipe-reply='true']")) {
      return;
    }
    const wrap = target.closest(".swipe-reply-wrap") as HTMLElement | null;
    if (!wrap) return;
    const reg = swipeRegistry.get(wrap);
    if (!reg) return;

    const t = e.touches[0];
    activeWrap = wrap;
    activeReg = reg;
    startX = t.clientX;
    startY = t.clientY;
    lockedAxis = null;
    currentOffset = 0;
    armed = false;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!activeReg || !activeWrap || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    if (!lockedAxis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (dx > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        lockedAxis = "x";
      } else {
        lockedAxis = "y";
        activeWrap = null;
        activeReg = null;
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
    const reg = activeReg;
    if (!rafId && reg) {
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        applyVisual(reg, currentOffset, false);
      });
    }
  };

  const onTouchEnd = () => resetActive(false);
  const onTouchCancel = () => resetActive(true);

  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
  document.addEventListener("touchcancel", onTouchCancel, { passive: true });
}

/**
 * Mobile-only left-to-right swipe wrapper for message bubbles using a single delegated
 * passive listener on `document` and zero idle GPU layers (`badge` stays `display: none`
 * until an actual horizontal swipe locks in).
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

  useLayoutEffect(() => {
    onReplyRef.current = onReply;
  });

  useLayoutEffect(() => {
    if (!isMobile || disabled) return;
    ensureGlobalSwipeDelegator();
    const wrap = wrapRef.current;
    if (!wrap) return;
    swipeRegistry.set(wrap, {
      badgeEl: badgeRef.current,
      trackEl: trackRef.current,
      onReply: () => onReplyRef.current(),
    });
    return () => {
      swipeRegistry.delete(wrap);
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
        style={{ display: "none" }}
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
