const CACHE_NAME = 'jood-kids-cache-v6';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'firebase-config.js',
  'firebase-service.js',
  'manifest.json',
  'invoice-sample.html',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
