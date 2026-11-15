// ============================================================
// ACE Exam Portal — Service Worker (offline-first app shell)
// ============================================================
// Strategy:
//   • Navigation requests  → network-first, fall back to cached /index.html
//   • JS / CSS / fonts     → cache-first (instant loads after first visit)
//   • Images / icons       → cache-first with background revalidation
//   • Supabase API calls   → network-only (NEVER cache auth/data)
// ============================================================

const CACHE = "ace-portal-v2";

// Pre-cache these on install so the app shell is always available offline
const PRECACHE = ["/", "/index.html"];

// ── Install ──────────────────────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ──────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Helpers ──────────────────────────────────────────────────
function isSupabaseUrl(url) {
  return (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in") ||
    // Also skip any Edge Function / REST / Auth / Realtime paths
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/functions/") ||
    url.pathname.startsWith("/realtime/") ||
    url.pathname.startsWith("/storage/")
  );
}

function isStaticAsset(url) {
  return /\.(js|mjs|css|woff2?|ttf|eot|png|svg|ico|jpg|jpeg|webp|gif|json)(\?.*)?$/.test(url.pathname);
}

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // 1. Never intercept Supabase / API calls — always go to network
  if (isSupabaseUrl(url)) return;

  // 2. Only handle GET requests
  if (e.request.method !== "GET") return;

  // 3. Navigation (HTML pages) — network-first, offline fallback to shell
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          // Cache a fresh copy of the page
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(async () => {
          // Offline → serve cached shell so the React app can boot.
          // CRITICAL: must always return a Response — never undefined,
          // otherwise the browser throws "Failed to convert value to 'Response'"
          // and the page errors out instead of showing the cached shell.
          const shell =
            (await caches.match("/index.html")) ||
            (await caches.match("/"));
          if (shell) return shell;
          return new Response(
            "<h1>Offline</h1><p>Please reconnect and reload.</p>",
            { status: 503, headers: { "Content-Type": "text/html" } }
          );
        })
    );
    return;
  }

  // 4. Static assets — cache-first, update in background (stale-while-revalidate)
  if (isStaticAsset(url)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        const fetchPromise = fetch(e.request)
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(e.request, res.clone());
            }
            return res;
          })
          .catch(() => null);

        // Return cached immediately if available, otherwise wait for network
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 5. Everything else — network with offline fallback to cache
  e.respondWith(
    fetch(e.request)
      .catch(() => caches.match(e.request))
  );
});
