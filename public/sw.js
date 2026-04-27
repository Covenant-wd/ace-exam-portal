// ACE Exam Portal — Service Worker
// Caches the app shell so the site stays visible when the connection drops.
// Only static assets are cached; Supabase API calls are always network-first.

const CACHE_NAME = "ace-portal-v1";

// App-shell files that must be available offline
const APP_SHELL = [
  "/",
  "/index.html",
  "/favicon.ico",
];

// ── Install: pre-cache app shell ─────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ───────────────────────────────────────────────
// • Supabase / API calls  → network-only (never cache auth/data)
// • JS/CSS/font assets    → cache-first (fast loads after first visit)
// • Navigation requests   → network-first, fall back to cached /index.html
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept Supabase or third-party API requests
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in") ||
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/functions/") ||
    url.pathname.startsWith("/realtime/")
  ) {
    return; // Let the browser handle it
  }

  // Navigation (page loads) — network first, fall back to index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .catch(() =>
          caches.match("/index.html").then((r) => r || caches.match("/"))
        )
    );
    return;
  }

  // Static assets — cache first
  if (
    url.pathname.match(/\.(js|css|woff2?|png|svg|ico|jpg|jpeg|webp)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }
});
