/* Stargate PWA service worker — network-first with offline fallback. */
const CACHE = 'stargate-v3';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/assets/icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function addVisitorAdminLink(html) {
  if (html.includes('/admin/visitors/')) return html;

  const link = `
    <a class="chip" style="border-color:#7aa2ff;color:#dbe6ff;background:rgba(79,127,255,.14);font-family:'JetBrains Mono',monospace;font-weight:800" href="/admin/visitors/" rel="nofollow">📈 방문자</a>`;

  const shopLink = /(<a class="chip"[^>]*href="https:\/\/shop\.stargateedu\.co\.kr\/"[^>]*>[^<]*<\/a>)/;
  if (shopLink.test(html)) return html.replace(shopLink, `$1${link}`);

  return html.replace('</nav>', `</nav><div style="margin-top:14px">${link}</div>`);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!response.ok) return response;

    const url = new URL(request.url);
    const contentType = response.headers.get('content-type') || '';
    const isMainPage = request.mode === 'navigate' && url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html');

    if (isMainPage && contentType.includes('text/html')) {
      const html = addVisitorAdminLink(await response.text());
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
    return response;
  } catch (_) {
    return caches.match(request).then((hit) => hit || (request.mode === 'navigate' ? caches.match(OFFLINE_URL) : undefined));
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(networkFirst(event.request));
});
