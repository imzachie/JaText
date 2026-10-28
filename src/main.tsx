import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import {
  getActiveAccountSlotId,
  getConvexStorageNamespaceForSlot,
  syncNativeActiveSlotTokens,
  useMultiAccountState,
} from "./lib/accountManager";
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

function getOrCreateSlotConvexClient(url: string, slotId: string): ConvexReactClient {
  let client = slotClients.get(slotId);
  if (!client) {
    client = new ConvexReactClient(url);
    slotClients.set(slotId, client);
  }
  return client;
}

export function Root() {
  const { activeSlotId } = useMultiAccountState();
  const prevSlotRef = useRef<string>(activeSlotId);

  useEffect(() => {
    if (convexUrl) {
      void syncNativeActiveSlotTokens(activeSlotId, convexUrl);
    }
    const previousSlotId = prevSlotRef.current;
    prevSlotRef.current = activeSlotId;
    if (convexUrl && previousSlotId !== activeSlotId) {
      const timer = window.setTimeout(() => {
        if (getActiveAccountSlotId() !== previousSlotId) {
          const staleClient = slotClients.get(previousSlotId);
          if (staleClient) {
            slotClients.delete(previousSlotId);
            void staleClient.close().catch(() => undefined);
          }
        }
      }, 250);
      return () => window.clearTimeout(timer);
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
