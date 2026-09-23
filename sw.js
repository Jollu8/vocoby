const CACHE = 'vocoby-shell-v23';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './dictionary.js', './engine.js',
  './sources.html', './data/manifest.json', './data/most-1000/manifest.json',
  './data/a1-vocabden/manifest.json', './data/a2-user/manifest.json', './data/b1-user/manifest.json', './data/b2-user/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key !== CACHE).map(key => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const request = event.request;
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && new URL(request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
