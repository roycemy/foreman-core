/* Alter app shell service worker.
   Caches static shell files as an offline fallback; the network always wins when online.
   /api is always live network: no work state, approval or receipt is ever served from cache. */
const CACHE = 'alter-shell-v20';
const SHELL = [
  '/hq', '/app.html', '/brand.js', '/manifest.webmanifest',
  '/styles/tokens.css', '/styles/app.css',
  '/js/core.js', '/js/floor.js', '/js/inbox.js', '/js/inspector.js', '/js/connect.js', '/js/pop.js',
  '/js/cmdk.js', '/js/card.js', '/js/receipt-doc.js', '/js/business.js', '/js/receipts.js', '/js/share.js', '/js/app.js',
  '/styles/components/dock.css', '/styles/components/bot-status.css', '/styles/components/estimate.css', '/styles/components/bot-work.css', '/styles/components/meeting.css', '/styles/components/receipt-ship.css', '/styles/components/reconnect-flag.css',
  '/js/components/motion.js', '/styles/components/motion.css', '/js/components/dock.js', '/js/components/bot-status.js', '/js/components/estimate.js', '/js/components/bot-work.js', '/js/components/meeting.js', '/js/components/receipt-ship.js', '/js/components/reconnect-flag.js',
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
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(() => caches.match('/hq')));
    return;
  }
  // Network-first: always the newest files when online, cache only as the offline fallback.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
