const CACHE_NAME = 'apontamentos-v4-mobile-pwa';
const STATIC_ASSETS = [
  './',
  './manifest.json',
  './assets/css/main.css',
  './assets/css/duvidas.css',
  './assets/js/app.js',
  './assets/js/duvidas.js',
  './assets/css/fa/all.min.css',
  './assets/fonts/fa-solid-900.woff2',
  './assets/fonts/fa-regular-400.woff2',
  './assets/fonts/fa-brands-400.woff2',
  './assets/fonts/fa-v4compatibility.woff2',
  './icons/logo progeral azul.png',
  './icons/app-icon.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png'
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
  if (url.includes('/icons/') || url.includes('/fonts/') || url.includes('/css/fa/')) {
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
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
          return response;
        } else {
          return caches.match(event.request).then(function(cached) {
            return cached || response;
          });
        }
      })
      .catch(function () {
        return caches.match(event.request);
      })
  );
});
