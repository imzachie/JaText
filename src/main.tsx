import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { ConvexStoreProvider } from "./lib/convexStore";
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

function Root() {
  if (convexUrl) {
    const client = new ConvexReactClient(convexUrl);
    return (
      <ConvexAuthProvider client={client}>
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
    <Root />
  </StrictMode>,
);
