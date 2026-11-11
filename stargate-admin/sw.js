'use strict';
const CACHE='stargate-admin-shell-1.4.0';
const SHELL=['./','./index.html','./styles.css','./app.js','./data.mjs','./board.mjs','./catalog.json','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('stargate-admin-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url),scope=new URL(self.registration.scope);if(req.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;event.respondWith(fetch(req).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)));}return response;}).catch(async()=>{const cached=await caches.match(req,{ignoreSearch:true});if(cached)return cached;if(req.mode==='navigate')return caches.match(new URL('./index.html',self.registration.scope).href);return Response.error();}));});

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
