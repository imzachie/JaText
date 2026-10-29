import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import {
  clearDeadSlotTokensOnAuthFailure,
  getConvexStorageNamespaceForSlot,
  registerSlotCleanupHandler,
  syncNativeActiveSlotTokens,
  useMultiAccountState,
} from "./lib/accountManager";
import { clearSlotChatCache, preloadSlotChatCache } from "./lib/chatCache";
import { ConvexStoreProvider } from "./lib/convexStore";
import { createNativeSyncedAuthStorage } from "./lib/nativeBridge";
import { DemoStoreProvider } from "./lib/store";
import "./index.css";

/**
 * If VITE_CONVEX_URL is set (run `npx convex dev` — it writes it to
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

function isLikelyNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|aborted/i.test(
    msg,
  );
}

function createResilientSlotClient(url: string, slotId: string): ConvexReactClient {
  const client = new ConvexReactClient(url);
  const origSetAuth = client.setAuth.bind(client);
  client.setAuth = (fetchToken, onChange, onRefreshChange) => {
    const safeFetchToken: typeof fetchToken = async (args) => {
      try {
        return await fetchToken(args);
      } catch (err) {
        // Prevent @convex-dev/auth refresh exceptions from crashing Convex's
        // AuthenticationManager after stopSocket() (which otherwise leaves
        // isConvexAuthenticated === null / "Loading JaText…" stuck forever).
        if (!isLikelyNetworkFailure(err)) {
          await clearDeadSlotTokensOnAuthFailure(slotId, url).catch(() => undefined);
          await clearSlotChatCache(slotId).catch(() => undefined);
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

registerSlotCleanupHandler((slotId, mode) => {
  closeSlotConvexClient(slotId);
  if (mode === "full") {
    void clearSlotChatCache(slotId);
  }
});

export function Root() {
  const { activeSlotId } = useMultiAccountState();

  // Warm IndexedDB chat & group message caches immediately for this account slot
  void preloadSlotChatCache(activeSlotId);

  useEffect(() => {
    void preloadSlotChatCache(activeSlotId);
    if (convexUrl) {
      void syncNativeActiveSlotTokens(activeSlotId, convexUrl);
    }
  }, [activeSlotId]);

  if (convexUrl) {
    const slotClient = getOrCreateSlotConvexClient(convexUrl, activeSlotId);
    const slotNamespace = getConvexStorageNamespaceForSlot(convexUrl, activeSlotId);
    return (
      <ConvexAuthProvider
        key={activeSlotId}
        client={slotClient}
        storage={nativeAuthStorage}
        storageNamespace={slotNamespace}
        shouldHandleCode={() =>
          !Capacitor.isNativePlatform() &&
          new URLSearchParams(window.location.search).has("code")
        }
      >
        <ConvexStoreProvider key={activeSlotId}>
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
