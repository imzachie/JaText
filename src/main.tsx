import { StrictMode, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { LandingHeroPage } from "./components/LandingHeroPage";
import { useJaTextWebRoute } from "./lib/webRoute";
import {
  SLOT_AUTH_INVALIDATED_EVENT,
  clearDeadSlotTokensOnAuthFailure,
  getConvexAuthKeysForSlot,
  getConvexStorageNamespaceForSlot,
  registerSlotCleanupHandler,
  syncNativeActiveSlotTokens,
  useMultiAccountState,
} from "./lib/accountManager";
import { clearSlotChatCache, preloadSlotChatCache } from "./lib/chatCache";
import { ConvexStoreProvider } from "./lib/convexStore";
import { createNativeSyncedAuthStorage } from "./lib/nativeBridge";
import { DemoStoreProvider } from "./lib/store";
import { setThemeUserScope } from "./lib/themeEngine";
import "./index.css";

// Initialize saved device theme before first React paint
setThemeUserScope(null);

/**
 * If VITE_CONVEX_URL is set (run `npx convex dev`, which writes it to
 * .env.local), JaText talks to your real Convex deployment: Convex Auth
 * (Google + email/password), Convex database and Convex file storage.
 *
 * Without it, JaText runs in demo mode with an identical API implemented
 * in the browser, so every feature works out of the box.
 */
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const nativeAuthStorage =
  convexUrl && Capacitor.isNativePlatform()
    ? createNativeSyncedAuthStorage(convexUrl)
    : undefined;

const slotClients = new Map<string, ConvexReactClient>();
const slotAuthEpochs = new Map<string, number>();
let authEpochStoreVersion = 0;
const authEpochListeners = new Set<() => void>();

function bumpSlotAuthEpoch(slotId: string): void {
  slotAuthEpochs.set(slotId, (slotAuthEpochs.get(slotId) ?? 0) + 1);
  authEpochStoreVersion += 1;
  for (const listener of authEpochListeners) {
    listener();
  }
}

function subscribeAuthEpoch(listener: () => void): () => void {
  authEpochListeners.add(listener);
  return () => {
    authEpochListeners.delete(listener);
  };
}

function useSlotAuthEpoch(slotId: string): number {
  const version = useSyncExternalStore(
    subscribeAuthEpoch,
    () => authEpochStoreVersion,
    () => 0,
  );
  void version;
  return slotAuthEpochs.get(slotId) ?? 0;
}

function isLikelyNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|aborted/i.test(
    msg,
  );
}

function isJwtStillValid(jwt: string | null | undefined, minRemainingMs = 10_000): boolean {
  if (!jwt) return false;
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return false;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(window.atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now() + minRemainingMs;
  } catch {
    return false;
  }
}

function createResilientSlotClient(url: string, slotId: string): ConvexReactClient {
  // Prune any already-expired JWT from localStorage before client creation (keeping refreshKey
  // intact!) so @convex-dev/auth refreshes immediately instead of failing an expired JWT first.
  let reuseInitialJwt = true;
  if (typeof window !== "undefined") {
    try {
      const { jwtKey, refreshKey } = getConvexAuthKeysForSlot(url, slotId);
      const existingJwt = window.localStorage.getItem(jwtKey);
      if (existingJwt && !isJwtStillValid(existingJwt, 15_000)) {
        reuseInitialJwt = false;
        if (window.localStorage.getItem(refreshKey)) {
          window.localStorage.removeItem(jwtKey);
        }
      }
    } catch {
      reuseInitialJwt = false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new ConvexReactClient(url, { initialAuthTokenReuse: reuseInitialJwt } as any);
  const origSetAuth = client.setAuth.bind(client);
  client.setAuth = (fetchToken, onChange, onRefreshChange) => {
    const safeFetchToken: typeof fetchToken = async (args) => {
      try {
        return await fetchToken(args);
      } catch (err) {
        // 1. Always check localStorage directly first: another tab may have just rotated
        //    @convex-dev/auth's single-use refreshToken and stored a fresh valid JWT!
        const readLatestStoredJwt = (): string | null => {
          if (typeof window === "undefined") return null;
          try {
            const { jwtKey } = getConvexAuthKeysForSlot(url, slotId);
            return window.localStorage.getItem(jwtKey);
          } catch {
            return null;
          }
        };

        let candidateJwt = readLatestStoredJwt();
        if (isJwtStillValid(candidateJwt, 5_000)) {
          return candidateJwt;
        }

        try {
          const inMemoryJwt = (await fetchToken({ forceRefreshToken: false })) ?? null;
          if (isJwtStillValid(inMemoryJwt, 5_000)) {
            return inMemoryJwt;
          }
        } catch {
          // ignore
        }

        // Wait briefly in case a sibling tab is mid-flight saving its rotated JWT
        await new Promise((resolve) => setTimeout(resolve, 380));
        candidateJwt = readLatestStoredJwt();
        if (isJwtStillValid(candidateJwt, 5_000)) {
          return candidateJwt;
        }

        // 2. Never wipe verifier/tokens while an OAuth ?code= exchange or network drop is active.
        const oauthCodePending =
          typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).has("code");
        if (!isLikelyNetworkFailure(err) && !oauthCodePending) {
          await clearDeadSlotTokensOnAuthFailure(slotId, url).catch(() => undefined);
        }
        return null;
      }
    };
    return origSetAuth(safeFetchToken, onChange, onRefreshChange);
  };
  return client;
}

function getOrCreateSlotConvexClient(url: string, slotId: string): ConvexReactClient {
  let client = slotClients.get(slotId);
  if (!client) {
    client = createResilientSlotClient(url, slotId);
    slotClients.set(slotId, client);
  }
  return client;
}

function closeSlotConvexClient(slotId: string): void {
  const existing = slotClients.get(slotId);
  if (existing) {
    slotClients.delete(slotId);
    void existing.close().catch(() => undefined);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(SLOT_AUTH_INVALIDATED_EVENT, (event) => {
    const slotId = (event as CustomEvent<string>).detail;
    if (typeof slotId === "string" && slotId) {
      closeSlotConvexClient(slotId);
      bumpSlotAuthEpoch(slotId);
    }
  });
}

registerSlotCleanupHandler((slotId, mode) => {
  closeSlotConvexClient(slotId);
  if (mode === "full") {
    void clearSlotChatCache(slotId);
  }
});

export function Root() {
  const webRoute = useJaTextWebRoute();
  const { activeSlotId } = useMultiAccountState();
  const authEpoch = useSlotAuthEpoch(activeSlotId);

  // Warm IndexedDB chat & group message caches immediately for this account slot
  void preloadSlotChatCache(activeSlotId);

  useEffect(() => {
    void preloadSlotChatCache(activeSlotId);
    if (convexUrl) {
      void syncNativeActiveSlotTokens(activeSlotId, convexUrl);
    }
  }, [activeSlotId]);

  if (webRoute === "landing") {
    return <LandingHeroPage />;
  }

  if (convexUrl) {
    const slotClient = getOrCreateSlotConvexClient(convexUrl, activeSlotId);
    const slotNamespace = getConvexStorageNamespaceForSlot(convexUrl, activeSlotId);
    const providerKey = `${activeSlotId}:${authEpoch}`;
    return (
      <ConvexAuthProvider
        key={providerKey}
        client={slotClient}
        storage={nativeAuthStorage}
        storageNamespace={slotNamespace}
        replaceURL={(relativeUrl) => {
          if (Capacitor.isNativePlatform()) {
            window.history.replaceState({}, "", relativeUrl);
            return;
          }
          const normalized =
            relativeUrl === "/" || relativeUrl.startsWith("/?") || relativeUrl.startsWith("/#")
              ? `/chats${relativeUrl.slice(1)}`
              : relativeUrl;
          window.history.replaceState({}, "", normalized);
        }}
        shouldHandleCode={() =>
          !Capacitor.isNativePlatform() &&
          new URLSearchParams(window.location.search).has("code")
        }
      >
        <ConvexStoreProvider key={providerKey}>
          <App />
        </ConvexStoreProvider>
      </ConvexAuthProvider>
    );
  }
  return (
    <DemoStoreProvider key={activeSlotId} slotId={activeSlotId}>
      <App />
    </DemoStoreProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Root />
    </AppErrorBoundary>
  </StrictMode>,
);
