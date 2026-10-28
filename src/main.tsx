import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
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
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;
const nativeAuthStorage =
  convexUrl && Capacitor.isNativePlatform()
    ? createNativeSyncedAuthStorage(convexUrl)
    : undefined;

export function Root() {
  if (convexClient) {
    return (
      <ConvexAuthProvider client={convexClient} storage={nativeAuthStorage}>
        <ConvexStoreProvider>
          <App />
        </ConvexStoreProvider>
      </ConvexAuthProvider>
    );
  }
  return (
    <DemoStoreProvider>
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
