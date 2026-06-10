/* ============================================================
   sw.js — Eggie's Creator Hub service worker
   Strategy: NETWORK-FIRST for every same-origin GET.
   - Online: you always get the freshest page (nothing ever stale).
   - Offline: falls back to the last good copy from cache.
   Supabase calls are cross-origin and never intercepted.
   Bump CACHE on shape changes to drop old entries.
   ============================================================ */
const CACHE = 'eggie-hub-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Best-effort precache of the core shell — failures are non-fatal.
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.allSettled([
        'index.html', 'hub-core.js?v=1', 'hub-nav.js?v=8', 'a11y-modes.js?v=4',
        'demo-mode.js', 'manifest.webmanifest', 'icon.svg'
      ].map((u) => c.add(u)))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   // never touch Supabase/CDNs

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          // Offline navigation with no cached copy → home shell as a fallback.
          if (req.mode === 'navigate') return caches.match('index.html');
          return Response.error();
        })
      )
  );
});
