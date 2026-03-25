const CACHE_NAME = 'jood-kids-cache-v1';
const ASSETS = ['./','index.html','styles.css','app.js','firebase-config.js','manifest.json','assets/icons/icon-192.png','assets/icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
