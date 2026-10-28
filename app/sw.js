// Offline cache for the web build. The iOS shell serves files from the app
// bundle and does not use this.
const CACHE = 'vale-maker-v1';
const FILES = [
  './', 'index.html', 'app.css', 'manifest.webmanifest', 'icon.png',
  'js/main.js', 'js/storage.js', 'js/projects.js', 'js/player.js',
  'vendor/phaser-3.90.0.min.js',
  'templates/space-shooter/manifest.json', 'templates/space-shooter/game.js',
  'templates/space-shooter/ship.svg', 'templates/space-shooter/enemy.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first so updates arrive when online; cache when offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
