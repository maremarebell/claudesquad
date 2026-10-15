// Network first, cache as the offline fallback. Same-origin GETs only, so
// the check-in server and the CDNs are never served stale.
const CACHE = 'squad';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => clients.claim())
));

// Gym signal is often up but not answering: after 3s, serve the cached copy.
const timeout = ms => new Promise((_, reject) => setTimeout(reject, ms));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  let saved = Promise.resolve();
  const network = fetch(req).then(res => {
    // only whole, good responses replace what's cached; a 500 never does
    if (res.ok && res.status !== 206) {
      const copy = res.clone();
      saved = caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  });
  // registered now, while the event is live, so a slow response still gets saved
  e.waitUntil(network.then(() => saved).catch(() => {}));
  e.respondWith(
    Promise.race([network, timeout(3000)])
      .catch(() => caches.match(req).then(hit => hit || network))
  );
});
