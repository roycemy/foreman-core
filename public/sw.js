/* Alter app shell service worker.
   Offline fallback for navigation and brand assets only. Code (/js/*, /styles/*, /brand.js)
   is NEVER intercepted: a stale installed worker can never serve stale code, and the browser
   HTTP cache (max-age=0, must-revalidate on this deployment) always revalidates it.
   /api, /oauth and /receipt are always live network: no work state, approval or receipt is
   ever served from cache. */
const CACHE = 'alter-shell-v27';
const SHELL = [
  '/hq', '/app.html', '/manifest.webmanifest',
  '/brand/favicon.svg', '/brand/alter-icon-light-180.png', '/brand/alter-icon-light-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // Purge every older cache (including pre-v22 shells that cached code), then take control.
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/oauth/') || u.pathname.startsWith('/receipt/')) return; // always live
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(() => caches.match('/hq')));
    return;
  }
  // Code and styles: never intercepted - always live network, even offline (the offline
  // fallback page is navigation-only; a code file is never served from any cache by us).
  if (u.pathname.startsWith('/js/') || u.pathname.startsWith('/styles/') || u.pathname === '/brand.js') return;
  // Brand images and the manifest: network-first, cache only as the offline fallback.
  if (u.pathname.startsWith('/brand/') || u.pathname === '/manifest.webmanifest') {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Anything else: live network, not intercepted.
});
