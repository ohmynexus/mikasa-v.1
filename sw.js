const CACHE='utang-wifi-mikasa-v8';
const CORE=['./','./index.html','./manifest.json','./assets/icon-192.png','./assets/icon-512.png','./assets/mikasa-bg.png','./assets/mikasa-bg.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok&&new URL(req.url).origin===location.origin){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res}).catch(()=>caches.match('./index.html'))))});
