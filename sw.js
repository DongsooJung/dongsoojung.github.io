/* Stargate PWA service worker - network-first with offline fallback. */
const CACHE = 'stargate-v6';
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

  if (!output.includes('visitor-summary-link')) {
    const summary = `\n    <a id="visitor-summary-link" class="chip" style="border-color:#7aa2ff;color:#dbe6ff;background:rgba(79,127,255,.14);font-family:'JetBrains Mono',monospace;font-weight:800" href="/admin/visitors/" rel="nofollow" aria-label="방문자 통계 대시보드">📈 오늘 <strong id="visitor-today-count" style="color:#fff">-</strong> · 누적 <strong id="visitor-total-count" style="color:#fff">-</strong></a>`;
    const oldVisitorLink = /<a class="chip"[^>]*href="\/admin\/visitors\/"[^>]*>[^<]*<\/a>/;
    const shopLink = /(<a class="chip"[^>]*href="https:\/\/shop\.stargateedu\.co\.kr\/"[^>]*>[^<]*<\/a>)/;

    if (oldVisitorLink.test(output)) {
      output = output.replace(oldVisitorLink, summary.trim());
    } else {
      output = shopLink.test(output)
        ? output.replace(shopLink, `$1${summary}`)
        : output.replace('</nav>', `</nav><div style="margin-top:14px">${summary}</div>`);
    }
  }

  if (!output.includes('stargateSupabaseVisitorV2')) {
    const trackingScript = `<script>
(() => {
  const marker = 'stargateSupabaseVisitorV2';
  const supabaseUrl = 'https://inftexpcnfinglwlrvsj.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJpbmZ0ZXhwY25maW5nbHdscnZzaiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcyOTEzMjM4LCJleHAiOjIwODg0ODkyMzh9.HONuULp0L3B5T0gTiwJMnowjJonJzzNHhUV_LtpDQoI';
  const headers = {
    apikey: anonKey,
    Authorization: 'Bearer ' + anonKey
  };

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

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('ko-KR');
  }

  async function countRows(query) {
    const response = await fetch(supabaseUrl + '/rest/v1/blog_reactions?' + query + '&select=id&limit=1', {
      method: 'GET',
      cache: 'no-store',
      headers: Object.assign({}, headers, {
        Prefer: 'count=exact',
        Range: '0-0'
      })
    });
    if (!response.ok) throw new Error('COUNT_' + response.status);
    const range = response.headers.get('content-range') || '';
    const total = range.includes('/') ? range.split('/').pop() : '0';
    return total === '*' ? 0 : Number(total || 0);
  }

  async function recordVisit(day) {
    const countedKey = marker + ':counted:' + day;
    if (localStorage.getItem(countedKey)) return;

    let visitorId = localStorage.getItem(marker + ':visitorId');
    if (!visitorId) {
      visitorId = uuid();
      localStorage.setItem(marker + ':visitorId', visitorId);
    }

    const response = await fetch(supabaseUrl + '/rest/v1/blog_reactions?on_conflict=target_type,target_id,visitor_id', {
      method: 'POST',
      headers: Object.assign({}, headers, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal'
      }),
      body: JSON.stringify({
        target_type: 'site_visit',
        target_id: day,
        visitor_id: visitorId,
        liked: false
      })
    });

    if (response.ok) localStorage.setItem(countedKey, '1');
  }

  async function updateSummary() {
    const day = koreaDay();
    try {
      await recordVisit(day);
      const results = await Promise.all([
        countRows('target_type=eq.site_visit&target_id=eq.' + encodeURIComponent(day)),
        countRows('target_type=eq.site_visit')
      ]);
      const todayElement = document.getElementById('visitor-today-count');
      const totalElement = document.getElementById('visitor-total-count');
      if (todayElement) todayElement.textContent = formatNumber(results[0]);
      if (totalElement) totalElement.textContent = formatNumber(results[1]);
    } catch (_) {
      const link = document.getElementById('visitor-summary-link');
      if (link) link.title = '방문자 숫자를 불러오지 못했습니다. 클릭하면 상세 대시보드로 이동합니다.';
    }
  }

  updateSummary();
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
