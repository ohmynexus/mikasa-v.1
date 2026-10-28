const CACHE = 'mikasa-v01-premium-cache-v3';
const CORE = ['./', './index.html', './manifest.json', './customer-avatar.jpg', './icon-192.png', './icon-512.png', './mikasa-bg.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && new URL(req.url).origin === location.origin) {
      const cp = res.clone();
      caches.open(CACHE).then(c => c.put(req, cp));
    }
    return res;
  }).catch(() => caches.match('./index.html'))));
});