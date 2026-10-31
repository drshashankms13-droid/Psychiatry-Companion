/* Psychiatry Companion service worker.
   Network first for everything on this site, so a new deploy is picked up
   immediately when online; the cached copy is used only when the network
   fails (offline, or a very weak signal). Supabase and Google requests are
   never touched. Bump VERSION to drop old caches. */
const VERSION = 'pc-v1';
const SHELL = [
  '/', '/app.js', '/landing.js', '/theme-init.js', '/qid.js',
  '/vendor/supabase-2.45.4.js', '/manifest.json',
  '/icons/icon-192.png', '/icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Google, fonts: straight to the network

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        // One cached copy per file: the address bar's ?code=… etc. is ignored.
        const key = req.mode === 'navigate' ? '/' : url.pathname;
        caches.open(VERSION).then(cache => cache.put(key, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req.mode === 'navigate' ? '/' : url.pathname);
      if (cached) return cached;
      throw err;
    }
  })());
});
