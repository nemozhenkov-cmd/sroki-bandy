
const BASE = '/sroki-bandy/';
const VERSION = new URL(self.location.href).searchParams.get('v') || 'legacy';
// Change this marker when publishing a recovery so existing installations detect it.
const RELEASE = 'brand-design-3';
const CACHE = `sroki-bandy-${RELEASE}-${VERSION}`;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll([
        BASE,
        `${BASE}index.html`,
        `${BASE}manifest.webmanifest`,
        `${BASE}brand/mascot-loading.webp`,
        `${BASE}icon-192.png`
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

// Always show a visible notification, including when the application is closed.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Fall back to a generic visible notice. */ }
  event.waitUntil(self.registration.showNotification(
    typeof payload.title === 'string' ? payload.title.slice(0,100) : 'Сроки годности',
    {body:typeof payload.body === 'string' ? payload.body.slice(0,500) : 'Проверьте товары в приложении.',
     tag:typeof payload.tag === 'string' ? payload.tag.slice(0,100) : 'expiry-summary',
     icon:BASE+'icon-192.png',data:{url:BASE}}
  ));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const url = new URL(BASE,self.location.origin).href;
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = windows.find(client=>client.url.startsWith(url));
    if(existing) return existing.focus();
    return self.clients.openWindow(url);
  })());
});
