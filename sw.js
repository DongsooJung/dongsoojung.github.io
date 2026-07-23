/* Stargate PWA service worker - network-first with offline fallback. */
const CACHE = 'stargate-v5';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/assets/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function addPortalEnhancements(html) {
  let output = html;

  if (!output.includes('/admin/visitors/')) {
    const link = `\n    <a class="chip" style="border-color:#7aa2ff;color:#dbe6ff;background:rgba(79,127,255,.14);font-family:'JetBrains Mono',monospace;font-weight:800" href="/admin/visitors/" rel="nofollow">📈 방문자</a>`;
    const shopLink = /(<a class="chip"[^>]*href="https:\/\/shop\.stargateedu\.co\.kr\/"[^>]*>[^<]*<\/a>)/;
    output = shopLink.test(output)
      ? output.replace(shopLink, `$1${link}`)
      : output.replace('</nav>', `</nav><div style="margin-top:14px">${link}</div>`);
  }

  if (!output.includes('stargateSupabaseVisitorV1')) {
    const trackingScript = `<script>
(() => {
  const marker = 'stargateSupabaseVisitorV1';
  const supabaseUrl = 'https://inftexpcnfinglwlrvsj.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZnRleHBjbmZpbmdsd2xydnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTMyMzgsImV4cCI6MjA4ODQ4OTIzOH0.HONuULp0L3B5T0gTiwJMnowjJonJzzNHhUV_LtpDQoI';

  function koreaDay() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({type, value}) => [type, value]));
    return values.year + '-' + values.month + '-' + values.day;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const random = Math.random() * 16 | 0;
      const value = char === 'x' ? random : (random & 3 | 8);
      return value.toString(16);
    });
  }

  const day = koreaDay();
  const countedKey = marker + ':counted:' + day;
  if (localStorage.getItem(countedKey)) return;

  let visitorId = localStorage.getItem(marker + ':visitorId');
  if (!visitorId) {
    visitorId = uuid();
    localStorage.setItem(marker + ':visitorId', visitorId);
  }

  fetch(supabaseUrl + '/rest/v1/blog_reactions?on_conflict=target_type,target_id,visitor_id', {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: 'Bearer ' + anonKey,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal'
    },
    body: JSON.stringify({
      target_type: 'site_visit',
      target_id: day,
      visitor_id: visitorId,
      liked: false
    })
  }).then((response) => {
    if (response.ok) localStorage.setItem(countedKey, '1');
  }).catch(() => {});
})();
</script>`;
    output = output.replace('</body>', `${trackingScript}</body>`);
  }

  return output;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, {cache: 'no-store'});
    if (!response.ok) return response;

    const url = new URL(request.url);
    const contentType = response.headers.get('content-type') || '';
    const isMainPage = request.mode === 'navigate'
      && url.origin === self.location.origin
      && (url.pathname === '/' || url.pathname === '/index.html');

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
