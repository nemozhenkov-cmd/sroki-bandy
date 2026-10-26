
const BASE = '/sroki-bandy/';
const VERSION = new URL(self.location.href).searchParams.get('v') || 'legacy';
// Change this marker when publishing a recovery so existing installations detect it.
const RELEASE = 'offline-work-1';
const CACHE = `sroki-bandy-${RELEASE}-${VERSION}`;

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const response=await fetch(`${BASE}index.html`,{cache:'no-store'});
    if(!response.ok)throw new Error('Application shell unavailable');
    const html=await response.clone().text();
    const assets=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(m=>new URL(m[1],self.location.origin+BASE).href).filter(url=>url.startsWith(self.location.origin+BASE));
    if(!assets.some(url=>url.endsWith('.js')))throw new Error('Application script missing');
    // Install only succeeds when the complete application is available offline.
    await cache.addAll([...assets,`${BASE}manifest.webmanifest`,`${BASE}brand/mascot-loading.webp`,`${BASE}brand/mascot-welcome.webp`,`${BASE}brand/mascot-update.webp`,`${BASE}icon-192.png`]);
    await cache.put(BASE,response.clone());
    await cache.put(`${BASE}index.html`,response);
  })());
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
