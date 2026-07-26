/* Offline cache for the app shell.
 *
 * Currently NOT registered — see OFFLINE_CACHE in app.js. Kept ready for
 * when the app goes on a phone.
 *
 * Bump CACHE whenever any listed file changes. */
const CACHE = 'marvista-v8';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './2k-map.webp',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Only these paths are ever served from cache. Earlier this worker cached any
// same-origin GET, which meant the dev pages (calibrate.html, vectorize.html)
// got frozen at whatever version was first loaded.
const cacheable = new Set(ASSETS.map(a => new URL(a, self.registration.scope).pathname));

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // never touch third parties

  const isShell = req.mode === 'navigate' || cacheable.has(url.pathname);
  if (!isShell) return;                                        // dev pages stay on the network

  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).catch(() => caches.match('./index.html'))
    )
  );
});
