/* JaText iOS Liquid Glass PWA Service Worker */
const SHELL_CACHE = "jatext-ios-shell-v1";
const PRECACHE_URLS = [
  "/jatext-logo-icon.png",
  "/jatext-logo-full.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Never intercept API calls, version manifests, or APK downloads
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/web-version.json" ||
    url.pathname === "/apk-version.json" ||
    url.pathname.startsWith("/downloads/")
  ) {
    return;
  }

  // Network-first for HTML navigations so fresh deploys always arrive immediately
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && res.status === 200) {
            const clone = res.clone();
            caches
              .open(SHELL_CACHE)
              .then((c) => c.put("/ios/chats", clone))
              .catch(() => undefined);
          }
          return res;
        })
        .catch(() =>
          caches.match("/ios/chats").then((cached) => cached || fetch(req)),
        ),
    );
    return;
  }

  // Stale-while-revalidate for static same-origin icons & sound assets
  if (
    url.pathname.startsWith("/sounds/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg")
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const clone = res.clone();
              caches
                .open(SHELL_CACHE)
                .then((c) => c.put(req, clone))
                .catch(() => undefined);
            }
            return res;
          })
          .catch(() => cached);
        return cached || net;
      }),
    );
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  } else if (data.type === "SHOW_UPDATE_NOTIFICATION") {
    const title = data.title || "JaText Update Ready";
    const body =
      data.body ||
      "New changes were deployed to JaText. Open the app and tap Refresh Now.";
    if (self.registration && typeof self.registration.showNotification === "function") {
      event.waitUntil(
        self.registration
          .showNotification(title, {
            body,
            icon: "/jatext-logo-icon.png",
            badge: "/jatext-logo-icon.png",
            tag: "jatext-pwa-update",
            renotify: false,
          })
          .catch(() => undefined),
      );
    }
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow("/ios/chats");
        }
        return undefined;
      }),
  );
});
