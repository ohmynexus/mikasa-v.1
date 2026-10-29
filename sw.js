'use strict';
const CACHE = 'mikasa-v01-cloud-local-backup-1';
const CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(async path => {
      try { await cache.add(path); } catch (_) { /* Optional during offline install. */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('mikasa-v01-') && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Do not cache range requests or opaque cross-origin assets.
  if (request.headers.has('range')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const isNavigation = request.mode === 'navigate';
    const refresh = fetch(request).then(async response => {
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
      }
      return response;
    });
    if (cached) {
      event.waitUntil(refresh.catch(() => {}));
      return cached;
    }
    try { return await refresh; }
    catch (_) {
      if (isNavigation) return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
