import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { IosPwaBanners } from "./components/IosPwaBanners";
import { IosUnauthorized404 } from "./components/IosUnauthorized404";
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
import { I18nProvider } from "./lib/i18n";
import { setThemeUserScope } from "./lib/themeEngine";
import "./index.css";
import "./iosLiquidGlass.css";

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

  useEffect(() => {
    const isIosGlass = webRoute === "ios_chats";
    document.documentElement.classList.toggle("jatext-ios-liquid-glass", isIosGlass);
    return () => {
      document.documentElement.classList.remove("jatext-ios-liquid-glass");
    };
  }, [webRoute]);

  useEffect(() => {
    if (webRoute === "ios_unauthorized_404" || webRoute === "landing") return;
    void preloadSlotChatCache(activeSlotId);
    if (!forceDemoMode) {
      void syncNativeActiveSlotTokens(activeSlotId, PUBLIC_TURSO_API_ORIGIN);
    }
  }, [activeSlotId, webRoute]);

  if (webRoute === "ios_unauthorized_404") {
    return <IosUnauthorized404 />;
  }

  if (webRoute === "landing") {
    return <LandingHeroPage />;
  }

  // Warm IndexedDB chat & group message caches immediately for this account slot
  void preloadSlotChatCache(activeSlotId);

  if (forceDemoMode) {
    return (
      <DemoStoreProvider key={activeSlotId} slotId={activeSlotId}>
        {webRoute === "ios_chats" && <IosPwaBanners />}
        <App />
      </DemoStoreProvider>
    );
  }

  return (
    <TursoStoreProvider key={activeSlotId}>
      {webRoute === "ios_chats" && <IosPwaBanners />}
      <App />
    </TursoStoreProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <I18nProvider>
        <Root />
      </I18nProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
