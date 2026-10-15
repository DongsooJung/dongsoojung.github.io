(() => {
  'use strict';
  const workerHost = 'stargate.stargate8225.workers.dev';
  const enabled = [workerHost, 'stargateedu.co.kr', 'www.stargateedu.co.kr'].includes(location.hostname);
  const base = location.hostname === workerHost ? '' : `https://${workerHost}`;
  const meta = new Map();
  function describe(value) {
    if (!value) return 'Cloudflare 수집 상태 확인 중';
    const mode = value.mode === 'published_snapshot' ? '게시본 동기화' : '공식 원본 수집';
    const state = value.status === 'pending' ? '첫 수집 대기' : value.status === 'error' ? '수집 실패'
      : value.error ? '갱신 실패 · 보관본' : value.stale ? '기준 자료 지연' : '정상';
    const observed = value.source_at ? ` · 자료 기준 ${value.source_at}` : '';
    const checkedDate = new Date(value.checked_at || value.refreshed_at || NaN);
    const checked = Number.isFinite(checkedDate.getTime())
      ? ` · 확인 ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(checkedDate)} 한국시간` : '';
    return `${state} · ${mode}${observed}${checked}`;
  }
  async function load(name) {
    if (!enabled) return null;
    const response = await fetch(`${base}/api/dashboards/${name}`, {
      cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Dashboard data unavailable');
    const result = await response.json();
    if (result?.meta?.name !== name || !result.payload) throw new Error('Dashboard first collection is pending');
    meta.set(name, result.meta);
    return result.payload;
  }
  window.StargateDashboardData = { enabled, load, describe, meta: name => meta.get(name) || null };
  if (!enabled) return;
  async function refreshCards() {
    const paths = { 'exchange-rate': '/exchange-rate/', trade: '/trade/', urban: '/ds-research-urban-analytics/' };
    const cards = new Map();
    for (const [name, path] of Object.entries(paths)) {
      const matching = [...document.querySelectorAll('a.proj[href],a.project[href],a.hub-card[href]')].filter(anchor => {
        try { return new URL(anchor.href, location.href).pathname.replace(/\/?$/, '/') === path; } catch { return false; }
      });
      for (const anchor of matching) {
        let badge = anchor.querySelector('[data-cloudflare-refresh-status]');
        if (!badge) {
          badge = document.createElement('small');
          badge.dataset.cloudflareRefreshStatus = name;
          badge.style.cssText = 'display:block;margin-top:7px;font-size:10px;line-height:1.5;opacity:.78';
          badge.textContent = 'Cloudflare 수집 상태 확인 중';
          anchor.appendChild(badge);
        }
        if (!cards.has(name)) cards.set(name, []);
        cards.get(name).push(badge);
      }
    }
    if (!cards.size) return;
    try {
      const response = await fetch(`${base}/api/dashboards/status`, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const result = await response.json();
      for (const row of result.datasets || []) for (const badge of cards.get(row.name) || []) badge.textContent = describe(row);
    } catch {
      for (const badges of cards.values()) for (const badge of badges) badge.textContent = 'Cloudflare 수집 상태를 확인하지 못했습니다';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshCards, { once: true });
  else refreshCards();
})();
