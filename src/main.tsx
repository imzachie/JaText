import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { LandingHeroPage } from "./components/LandingHeroPage";
import { useJaTextWebRoute } from "./lib/webRoute";
import {
  registerSlotCleanupHandler,
  syncNativeActiveSlotTokens,
  useMultiAccountState,
} from "./lib/accountManager";
import { clearSlotChatCache, preloadSlotChatCache } from "./lib/chatCache";
import { DemoStoreProvider } from "./lib/store";
import { PUBLIC_TURSO_API_ORIGIN } from "./lib/tursoClient";
import { TursoStoreProvider } from "./lib/tursoStore";
import { setThemeUserScope } from "./lib/themeEngine";
import "./index.css";

// Initialize saved device theme before first React paint
setThemeUserScope(null);

const forceDemoMode = import.meta.env.VITE_DEMO_MODE === "1";

registerSlotCleanupHandler((slotId, mode) => {
  if (mode === "full") {
    void clearSlotChatCache(slotId);
  }
});

export function Root() {
  const webRoute = useJaTextWebRoute();
  const { activeSlotId } = useMultiAccountState();

  // Warm IndexedDB chat & group message caches immediately for this account slot
  void preloadSlotChatCache(activeSlotId);

  useEffect(() => {
    void preloadSlotChatCache(activeSlotId);
    if (!forceDemoMode) {
      void syncNativeActiveSlotTokens(activeSlotId, PUBLIC_TURSO_API_ORIGIN);
    }
  }, [activeSlotId]);

  if (webRoute === "landing") {
    return <LandingHeroPage />;
  }

  if (forceDemoMode) {
    return (
      <DemoStoreProvider key={activeSlotId} slotId={activeSlotId}>
        <App />
      </DemoStoreProvider>
    );
  }

  return (
    <TursoStoreProvider key={activeSlotId}>
      <App />
    </TursoStoreProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <Root />
    </AppErrorBoundary>
  </StrictMode>,
);
