
const BASE = '/sroki-bandy/';
const BUILD = '__SROKI_BUILD__';
const VERSION = BUILD.startsWith('__') ? new URL(self.location.href).searchParams.get('v') || 'dev' : BUILD;
// Change this marker when publishing a recovery so existing installations detect it.
const RELEASE = 'versioned-updates-2';
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
    await cache.addAll([...assets,`${BASE}manifest.webmanifest`,`${BASE}brand/mascot-loading.webp`,`${BASE}brand/mascot-welcome.webp`,`${BASE}brand/mascot-update.webp`,`${BASE}brand/mascot-scenes.webp`,`${BASE}icon-192.png`]);
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

// Task capabilities are scoped server-side to one assigned task/day/device.
self.addEventListener('push', event => {
 let payload={};try{payload=event.data?.json()||{}}catch{}
 const task=payload.type==='store-task'&&Number.isInteger(payload.task?.id)&&payload.task.id>=1&&payload.task.id<=14&&/^\d{4}-\d{2}-\d{2}$/.test(payload.task?.day||'')&&/^[0-9a-f]{64}$/i.test(payload.task?.token||'')?payload.task:null;
 const options={body:typeof payload.body==='string'?payload.body.slice(0,500):'Откройте приложение, чтобы проверить данные.',tag:typeof payload.tag==='string'?payload.tag.slice(0,100):'expiry-summary',icon:BASE+'icon-192.png',data:{url:BASE,...(task?{task}:{})}};
 if(task)options.actions=[{action:'task-done',title:'Выполнено'},{action:'task-snooze',title:'Отложить'}];
 event.waitUntil(self.registration.showNotification(typeof payload.title==='string'?payload.title.slice(0,100):'Сроки годности',options));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const task=event.notification.data?.task;
  let path=BASE;
  if(task&&Number.isInteger(task.id)&&task.id>=1&&task.id<=14&&/^\d{4}-\d{2}-\d{2}$/.test(task.day||''))path+=`?view=tasks&task=${task.id}&day=${task.day}`;
  if(task&&['task-done','task-snooze'].includes(event.action)&&/^[0-9a-f]{64}$/i.test(task.token||'')){
   try{
    const response=await fetch('https://sbsekvjjpxjpdootbsjt.supabase.co/functions/v1/push-notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'task-notification-action',operation:event.action==='task-done'?'done':'snooze',token:task.token}),signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Task action failed');const result=await response.json();
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows)if(client.url.startsWith(new URL(BASE,self.location.origin).href))client.postMessage({type:'STORE_TASKS_CHANGED'});
    if(result.status==='done'||result.status==='snoozed')return;
   }catch{
    await self.registration.showNotification('Действие не подтверждено',{body:'Откройте задачи и проверьте интернет. Повторите действие в приложении.',icon:BASE+'icon-192.png',tag:'task-action-error',data:{url:BASE,task}});
   }
  }
  const url=new URL(path,self.location.origin).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>client.url.startsWith(new URL(BASE,self.location.origin).href));
  if(existing){if(task){existing.postMessage({type:'OPEN_STORE_TASKS',taskId:task.id});}return existing.focus();}
  return self.clients.openWindow(url);
 })());
});
