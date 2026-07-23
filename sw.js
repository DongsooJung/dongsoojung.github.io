/* Stargate PWA service worker — network-first with offline fallback. */
const CACHE = 'stargate-v4';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/assets/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function addPortalEnhancements(html) {
  let output = html;
  if (!output.includes('/admin/visitors/')) {
    const link = `\n    <a class="chip" style="border-color:#7aa2ff;color:#dbe6ff;background:rgba(79,127,255,.14);font-family:'JetBrains Mono',monospace;font-weight:800" href="/admin/visitors/" rel="nofollow">📈 방문자</a>`;
    const shopLink = /(<a class="chip"[^>]*href="https:\/\/shop\.stargateedu\.co\.kr\/"[^>]*>[^<]*<\/a>)/;
    output = shopLink.test(output) ? output.replace(shopLink, `$1${link}`) : output.replace('</nav>', `</nav><div style="margin-top:14px">${link}</div>`);
  }

  if (!output.includes('stargateVisitorCounted')) {
    const counterScript = `<script>
(() => {
  const namespace = 'stargateedu-co-kr';
  const base = 'https://api.counterapi.dev/v1/' + namespace;
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const v = Object.fromEntries(parts.map(({type,value}) => [type,value]));
  const day = v.year + '-' + v.month + '-' + v.day;
  const key = 'stargateVisitorCounted:' + day;
  if (!localStorage.getItem(key)) {
    Promise.allSettled([
      fetch(base + '/total-visitors/up', {cache:'no-store', mode:'cors'}),
      fetch(base + '/daily-' + day + '/up', {cache:'no-store', mode:'cors'})
    ]).then((results) => {
      if (results.some((result) => result.status === 'fulfilled' && result.value.ok)) localStorage.setItem(key, '1');
    });
  }
})();
</script>`;
    output = output.replace('</body>', `${counterScript}</body>`);
  }
  return output;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, {cache:'no-store'});
    if (!response.ok) return response;
    const url = new URL(request.url);
    const contentType = response.headers.get('content-type') || '';
    const isMainPage = request.mode === 'navigate' && url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html');
    if (isMainPage && contentType.includes('text/html')) {
      return new Response(addPortalEnhancements(await response.text()), {
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
