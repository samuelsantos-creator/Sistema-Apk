const CACHE_NAME = 'apontamentos-v3-mobile-pwa';
const STATIC_ASSETS = [
  './',
  './manifest.json',
  './assets/css/main.css',
  './assets/css/duvidas.css',
  './assets/js/app.js',
  './assets/js/duvidas.js',
  './icons/logo progeral azul.png',
  './icons/app-icon.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); })
      );
    })
  );
});

self.addEventListener('fetch', function (event) {
  // Never cache non-GET requests (POST, PUT, DELETE, etc.)
  if (event.request.method !== 'GET') return;

  var url = event.request.url;

  // Static assets: cache-first
  if (url.includes('icons/') || url.includes('font-awesome') || url.includes('/webfonts/') || url.includes('cdnjs.cloudflare.com/ajax/libs/font-awesome') || url.includes('fonts.googleapis') || url.includes('fonts.gstatic')) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        return cached || fetch(event.request);
      })
    );
    return;
  }

  // HTML, CSS, JS, PHP, data files: network-first (sempre buscar atualizado)
  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(function () {
        return caches.match(event.request);
      })
  );
});
