
const BASE = '/sroki-bandy/';
const VERSION = new URL(self.location.href).searchParams.get('v') || 'legacy';
// Change this marker when publishing a recovery so existing installations detect it.
const RELEASE = 'disposal-status-clarity-1';
const CACHE = `sroki-bandy-${RELEASE}-${VERSION}`;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll([
        BASE,
        `${BASE}index.html`,
        `${BASE}manifest.webmanifest`
      ])
    )
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key =>
              key.startsWith('sroki-bandy-') && key !== CACHE
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(event.request);

      if (cached) return cached;

      try {
        const response = await fetch(event.request);

        if (response.ok) {
          await cache.put(event.request, response.clone());
        }

        return response;
      } catch (error) {
        if (event.request.mode === 'navigate') {
          const fallback = await cache.match(`${BASE}index.html`);
          if (fallback) return fallback;
        }

        throw error;
      }
    })
  );
});
