import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const NEAR_BOTTOM_THRESHOLD_PX = 280;

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
  return (
    window.innerWidth <= 860 ||
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

/**
 * Keeps a `.messages` scroll container:
 * 1) Automatically scrolled to the newest message whenever new messages arrive at the bottom.
 * 2) Anchored at the very end of the chat line when clicking/focusing the mobile message
 *    text box and throughout the entire soft-keyboard slide-up animation.
 */
export function useChatAutoScrollAndKeyboard({
  conversationKey,
  messagesReady,
  messageCount,
  tailMessageKey,
  tailSenderId,
  myUserId,
  messagesRef,
  composerRef,
  onPinnedChange,
}: {
  conversationKey: string;
  messagesReady: boolean;
  messageCount: number;
  tailMessageKey: string;
  tailSenderId?: string;
  myUserId?: string;
  messagesRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onPinnedChange?: (pinned: boolean) => void;
}) {
  const wasPinnedRef = useRef(true);
  const onPinnedChangeRef = useRef(onPinnedChange);
  useEffect(() => {
    onPinnedChangeRef.current = onPinnedChange;
  }, [onPinnedChange]);

  const prevConvKeyRef = useRef<string | null>(null);
  const prevTailKeyRef = useRef<string>("");
  const prevCountRef = useRef<number>(0);

  const updatePinned = useCallback((pinned: boolean) => {
    wasPinnedRef.current = pinned;
    onPinnedChangeRef.current?.(pinned);
  }, []);

  const pinToBottomNow = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    updatePinned(true);
  }, [messagesRef, updatePinned]);

  const pinToBottomBurst = useCallback(() => {
    pinToBottomNow();
    const timers: number[] = [];
    const raf1 = window.requestAnimationFrame(() => {
      pinToBottomNow();
      const raf2 = window.requestAnimationFrame(() => pinToBottomNow());
      timers.push(-raf2);
    });
    for (const delay of [60, 140, 260, 420]) {
      timers.push(window.setTimeout(pinToBottomNow, delay));
    }
    return () => {
      window.cancelAnimationFrame(raf1);
      for (const id of timers) {
        if (id < 0) window.cancelAnimationFrame(-id);
        else window.clearTimeout(id);
      }
    };
  }, [pinToBottomNow]);

  // Track user manual scroll position via rAF-coalesced passive listener so reading far-up history
  // isn't hijacked AND fling scrolling never runs synchronous layout reads on every 120Hz touch tick.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    let scrollRaf = 0;
    const handleScroll = () => {
      if (scrollRaf) return;
      scrollRaf = window.requestAnimationFrame(() => {
        scrollRaf = 0;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const nextPinned = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
        if (wasPinnedRef.current !== nextPinned) {
          updatePinned(nextPinned);
        }
      });
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (scrollRaf) window.cancelAnimationFrame(scrollRaf);
      el.removeEventListener("scroll", handleScroll);
    };
  }, [conversationKey, messagesReady, messagesRef, updatePinned]);

  // Auto-scroll when opening conversation or when new tail messages appear
  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (!el) return;

    if (prevConvKeyRef.current !== conversationKey) {
      prevConvKeyRef.current = conversationKey;
      prevTailKeyRef.current = tailMessageKey;
      prevCountRef.current = messageCount;
      updatePinned(true);
      return pinToBottomBurst();
    }

    if (!messagesReady) return;

    const tailChanged = tailMessageKey !== "" && tailMessageKey !== prevTailKeyRef.current;
    const countGrew = messageCount > prevCountRef.current;
    const prevCountWasEmpty = prevCountRef.current === 0 && messageCount > 0;

    prevTailKeyRef.current = tailMessageKey;
    prevCountRef.current = messageCount;

    if (prevCountWasEmpty) {
      return pinToBottomBurst();
    }

    if (tailChanged || (countGrew && wasPinnedRef.current)) {
      const sentByMe = Boolean(myUserId && tailSenderId && tailSenderId === myUserId);
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const shouldAutoScroll =
        sentByMe || wasPinnedRef.current || distanceFromBottom <= 420;
      if (shouldAutoScroll) {
        return pinToBottomBurst();
      }
    }
  }, [
    conversationKey,
    messageCount,
    messagesReady,
    messagesRef,
    myUserId,
    pinToBottomBurst,
    tailMessageKey,
    tailSenderId,
    updatePinned,
  ]);

  // Keep bottom anchored whenever `.messages` height shrinks (soft keyboard opening) or visualViewport/IME changes
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    let lastHeight = el.clientHeight;

    const onContainerResize = () => {
      const node = messagesRef.current;
      if (!node) return;
      const nextHeight = node.clientHeight;
      const delta = lastHeight - nextHeight;
      lastHeight = nextHeight;
      if (delta <= 0) return;

      const composerFocused =
        typeof document !== "undefined" &&
        composerRef.current !== null &&
        document.activeElement === composerRef.current;

      if ((composerFocused && isMobileViewport()) || wasPinnedRef.current) {
        node.scrollTop = node.scrollHeight;
        updatePinned(true);
      } else {
        node.scrollTop = Math.min(
          node.scrollHeight - node.clientHeight,
          node.scrollTop + delta,
        );
      }
    };

    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(onContainerResize) : null;
    ro?.observe(el);

    const onImeEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<{ open?: boolean }>).detail;
      if (detail?.open) {
        const composerFocused =
          composerRef.current !== null && document.activeElement === composerRef.current;
        if (composerFocused || wasPinnedRef.current) {
          pinToBottomNow();
          window.requestAnimationFrame(pinToBottomNow);
        }
      }
    };

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const onVisualViewportResize = () => {
      if (!isMobileViewport()) return;
      const composerFocused =
        composerRef.current !== null && document.activeElement === composerRef.current;
      if (composerFocused || wasPinnedRef.current) {
        pinToBottomNow();
      }
    };

    window.addEventListener("jatext:ime-change", onImeEvent as EventListener);
    window.addEventListener("resize", onVisualViewportResize);
    vv?.addEventListener("resize", onVisualViewportResize);

    return () => {
      ro?.disconnect();
      window.removeEventListener("jatext:ime-change", onImeEvent as EventListener);
      window.removeEventListener("resize", onVisualViewportResize);
      vv?.removeEventListener("resize", onVisualViewportResize);
    };
  }, [composerRef, conversationKey, messagesReady, messagesRef, pinToBottomNow, updatePinned]);

  const handleMobileComposerActivate = useCallback(() => {
    if (!isMobileViewport()) return;
    pinToBottomBurst();
  }, [pinToBottomBurst]);

  return {
    wasPinnedRef,
    pinToBottomNow,
    pinToBottomBurst,
    handleMobileComposerActivate,
  };
}
