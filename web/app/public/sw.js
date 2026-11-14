/*
 * Etify's service worker: what makes the site installable as an app, and
 * lets it open with a page instead of the browser's offline error.
 *
 * It only ever answers this site's own page loads (navigations): network
 * first, the cached shell when the network is down. Everything else
 * (scripts, artwork, YouTube, audio, the extension) goes straight to the
 * network untouched. Assets are content-hashed, so nothing stale is kept.
 */
const CACHE = 'etify-shell-v1';
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(SHELL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
        }
        return response;
      })
      .catch(() => caches.match(SHELL).then((cached) => cached ?? Response.error())),
  );
});
