/* Alter app shell service worker.
   Caches only static shell files so the floor, inbox and type box open offline.
   /api is always live network: no work state, approval or receipt is ever served from cache. */
const CACHE = 'alter-shell-v1';
const SHELL = [
  '/app', '/app.html', '/brand.js', '/manifest.webmanifest',
  '/styles/tokens.css', '/styles/app.css',
  '/js/core.js', '/js/floor.js', '/js/inbox.js', '/js/inspector.js', '/js/connect.js', '/js/pop.js',
  '/js/cmdk.js', '/js/card.js', '/js/receipt-doc.js', '/js/receipts.js', '/js/share.js', '/js/app.js',
  '/brand/favicon.svg', '/brand/alter-icon-light-180.png', '/brand/alter-icon-light-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/oauth/') || u.pathname.startsWith('/receipt/')) return; // always live
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/app')));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => {
      const fresh = fetch(e.request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});
