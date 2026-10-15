/* Stargate PWA service worker - network-first with offline fallback. */
const CACHE = 'stargate-v8';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/assets/icons/icon-192.png'];

function isPrivateRequest(request) {
  let path = new URL(request.url).pathname;
  for (let count = 0; count < 16; count++) {
    const decoded = path.replace(/%([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (decoded === path) break;
    path = decoded;
  }
  path = new URL('https://path.invalid' + path.replaceAll('\\', '/')).pathname.replace(/\/+/g, '/').toLowerCase();
  return path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/');
}

function isNetworkOnlyRequest(request) {
  const url = new URL(request.url);
  return url.origin !== self.location.origin || url.pathname === '/api' || url.pathname.startsWith('/api/') || isPrivateRequest(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map(async (key) => {
        if (key !== CACHE) return caches.delete(key);
        const cache = await caches.open(key);
        const requests = await cache.keys();
        await Promise.all(requests.filter(isNetworkOnlyRequest).map((request) => cache.delete(request)));
      })))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!response.ok) return response;
    const directives = (response.headers.get('Cache-Control') || '').split(',').map((part) => part.split('=')[0].trim().toLowerCase());
    if (directives.includes('no-store') || directives.includes('private')) return response;

    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
    return response;
  } catch (_) {
    return caches.match(request).then(
      (hit) => hit || (request.mode === 'navigate' ? caches.match(OFFLINE_URL) : undefined),
    );
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (isNetworkOnlyRequest(event.request)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  event.respondWith(networkFirst(event.request));
});
