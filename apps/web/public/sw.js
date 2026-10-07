// VinStay AI — PWA Service Worker (v1.0.0)
const CACHE_NAME = "vinstay-pwa-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
];

// Install: pre-cache shell icons and root
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[VinStay SW] Pre-cache partial warning:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up older cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network-first for dynamic and API routes; cache-first for static icons
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and API calls from cache interception
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // Static images and icons: Cache-first
  if (url.pathname.startsWith("/icons/") || url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // HTML and dynamic routes: Network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkRes) => {
        return networkRes;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          return caches.match("/");
        });
      })
  );
});
