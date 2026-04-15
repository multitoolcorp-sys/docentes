const CACHE_NAME = 'docentetime-v1';
const ASSETS = [
  '/',
  '/static/style.css',
  '/static/script.js',
  '/static/logo.png',
  '/static/alarma.wav'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
