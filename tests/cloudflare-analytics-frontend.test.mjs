import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const cloudflareHost = 'stargate.stargate8225.workers.dev';
const visitStats = { source: 'cloudflare', started_at: '2026-10-15T03:00:00Z', today: 0, total: 0, period: 0, daily: [] };
const usageStats = { source: 'cloudflare', started_at: visitStats.started_at, page_views: 0, clicks: 0, clicking_visitors: 0, engagement_rate: 0, pages: [], buttons: [] };
const historicalImport = { source: 'supabase:inftexpcnfinglwlrvsj', visits: 23, events: 47, first_date: '2026-07-25', last_date: '2026-10-11', completed_at: '2026-10-16T01:00:00Z', manifest_sha256: 'a'.repeat(64) };
const snapshotKey = 'stargate-cloudflare-analytics-snapshot-v2:days:30';
const snapshot90Key = 'stargate-cloudflare-analytics-snapshot-v2:days:90';

function browser(hostname, initial = {}, fail = false, responses = {}) {
  class Element {
    constructor() { this.dataset = {}; this.style = {}; this.children = []; this.textContent = ''; this.classList = { add() {} }; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    matches() { return false; }
    getAttribute() { return null; }
    setAttribute() {}
    addEventListener(name,listener) { (this.listeners ||= {})[name] = listener; }
  }
  class Anchor extends Element {
    constructor(href) { super(); this.href = href; this.tagName = 'A'; this.textContent = '메일 문의'; }
    closest() { return this; }
  }
  const nodes = new Map();
  const listeners = new Map();
  const storage = new Map(Object.entries(initial));
  const sessionStorage = new Map();
  const requests = [];
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  getNode('status').querySelector = () => getNode('status-text');
  const asStorage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) });
  const location = { hostname, pathname: '/', origin: 'https://' + hostname, href: 'https://' + hostname + '/' };
  const context = {
    window: { location }, location, URL, Intl, Date, Map, Set, Promise, Element, HTMLAnchorElement: Anchor,
    crypto: { randomUUID: () => 'b0322242-65b6-4a2c-9863-d35ba6e3248a' },
    localStorage: asStorage(storage), sessionStorage: asStorage(sessionStorage),
    matchMedia: () => ({ matches: false }),
    MutationObserver: class { observe() {} }, CustomEvent: class {},
    console: { error() {} },
    document: {
      title: 'STARGATE', head: new Element(), body: new Element(),
      getElementById: getNode, createElement: () => new Element(), querySelectorAll: () => [],
      addEventListener: (name, listener) => listeners.set(name, listener), dispatchEvent() {},
    },
    fetch: async (url, options) => {
      requests.push({ url, options, payload: JSON.parse(options.body) });
      const name = url.split('/').at(-1);
      if (fail || responses[name] instanceof Error) throw new Error('offline');
      const data = responses[name] ?? (url.endsWith('get_site_visit_stats') ? visitStats
        : url.endsWith('get_site_usage_stats') ? usageStats
          : url.endsWith('get_site_button_click_counts') ? [] : { ok: true });
      return { ok: true, json: async () => data };
    },
  };
  return { context, nodes, storage, requests, listeners, Anchor };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
function assertCloudflareTransport(requests) {
  assert.ok(requests.length > 0);
  for (const request of requests) {
    assert.match(request.url, /^\/api\/analytics\//);
    assert.deepEqual(Object.keys(request.options.headers).sort(), ['Accept', 'Content-Type']);
  }
}

test('Cloudflare visitor counter uses native RPC and isolated daily marker', async () => {
  const env = browser(cloudflareHost, { 'stargateVisitorV3:counted:2026-10-15': '1' });
  runInNewContext(read('assets/visitor-counter.js'), env.context);
  await settle();
  assertCloudflareTransport(env.requests);
  assert.deepEqual(env.requests.map(row => row.url), ['/api/analytics/record_site_visit', '/api/analytics/get_site_visit_stats']);
  assert.ok(env.storage.has('stargateCloudflareVisitorV1:visitorId'));
  assert.ok([...env.storage.keys()].some(key => key.startsWith('stargateCloudflareVisitorV1:counted:')));
  assert.equal(env.nodes.get('visitor-total-count').textContent, '0');
  assert.match(env.nodes.get('visitor-summary-link').title, /Cloudflare 수집 시작 이후 누적/);
});

test('Cloudflare visitor summary tooltip identifies finalized imported totals', async () => {
  const env = browser(cloudflareHost, {}, false, { get_site_visit_stats: { ...visitStats, total: 25, historical_import: historicalImport } });
  runInNewContext(read('assets/visitor-counter.js'), env.context);
  await settle();
  assert.equal(env.nodes.get('visitor-total-count').textContent, '25');
  assert.match(env.nodes.get('visitor-summary-link').title, /Supabase 이전 기록 포함 통합 누적/);
  assert.doesNotMatch(env.nodes.get('visitor-summary-link').title, /수집 시작 이후 누적/);
});

test('other hosts keep existing Supabase analytics transport and visitor key', async () => {
  const env = browser('stargateedu.co.kr');
  runInNewContext(read('assets/visitor-counter.js'), env.context);
  runInNewContext(read('assets/usage-analytics.js'), env.context);
  await settle();
  assert.ok(env.requests.every(row => row.url.startsWith('https://inftexpcnfinglwlrvsj.supabase.co/rest/v1/rpc/')));
  assert.ok(env.requests.every(row => row.options.headers.apikey));
  assert.ok(env.storage.has('stargateVisitorV3:visitorId'));
  assert.ok(!env.storage.has('stargateCloudflareVisitorV1:visitorId'));
});

test('Cloudflare usage loads and records locally, sharing the native visitor ID', async () => {
  const env = browser(cloudflareHost);
  runInNewContext(read('assets/visitor-counter.js'), env.context);
  runInNewContext(read('assets/usage-analytics.js'), env.context);
  await settle();
  env.listeners.get('click')({ isTrusted: true, target: new env.Anchor('mailto:hello@example.com') });
  await settle();
  assertCloudflareTransport(env.requests);
  assert.equal(env.context.window.StargateUsage.getLoadState().views, 'ready');
  const events = env.requests.filter(row => row.url.endsWith('record_site_usage_event'));
  assert.equal(events.length, 2);
  assert.ok(events.every(row => row.payload.p_visitor_id === env.storage.get('stargateCloudflareVisitorV1:visitorId')));
  assert.equal(events[1].payload.p_target_url, null);
  assert.equal(events[1].payload.p_element_label, '메일 문의');
});

const dashboard = read('admin/visitors/index.html').match(/<script>\s*([\s\S]*?)<\/script>/)[1];

test('Cloudflare dashboard displays persisted source, start time and real zero counts', async () => {
  const env = browser(cloudflareHost);
  runInNewContext(dashboard, env.context);
  await settle();
  assertCloudflareTransport(env.requests);
  assert.equal(env.nodes.get('total').textContent, '0');
  assert.equal(env.nodes.get('usage-views').textContent, '0');
  assert.match(env.nodes.get('total-label').textContent, /Cloudflare 누적/);
  assert.match(env.nodes.get('collection-scope').textContent, /Cloudflare 신규 수집 시작:.*2026.*한국시간/);
  assert.match(env.nodes.get('collection-scope').textContent, /기존 Supabase 누적 통계는 포함하지 않습니다/);
  const snapshot = JSON.parse(env.storage.get(snapshotKey));
  assert.equal(snapshot.source, 'cloudflare');
});

test('Cloudflare failure does not show old Supabase cached totals as current data', async () => {
  const oldSnapshot = JSON.stringify({ visits: { ...visitStats, total: 999 }, usage: usageStats, at: '2026-10-01T00:00:00Z' });
  const env = browser(cloudflareHost, { 'stargate-analytics-snapshot-v2': oldSnapshot }, true);
  runInNewContext(dashboard, env.context);
  await settle();
  assert.equal(env.nodes.get('total').textContent, '—');
  assert.match(env.nodes.get('status-text').textContent, /Cloudflare.*연결에 실패/);
});

test('Cloudflare cached data is explicitly marked with source and saved time', async () => {
  const snapshot = JSON.stringify({ source: 'cloudflare', days: 30, visits: visitStats, usage: usageStats, at: '2026-10-15T03:00:00Z' });
  const env = browser(cloudflareHost, { [snapshotKey]: snapshot }, true);
  runInNewContext(dashboard, env.context);
  await settle();
  assert.equal(env.nodes.get('total').textContent, '0');
  assert.match(env.nodes.get('status-text').textContent, /Cloudflare.*2026.*한국시간 저장본/);
  assert.equal(env.nodes.get('status').className, 'status warn');
});

test('finalized historical metadata enables integrated total and discloses exact imported coverage', async () => {
  const visits = { ...visitStats, total: 25, historical_import: historicalImport };
  const usage = { ...usageStats, historical_import: historicalImport };
  const env = browser(cloudflareHost, {}, false, { get_site_visit_stats: visits, get_site_usage_stats: usage });
  runInNewContext(dashboard, env.context);
  await settle();
  assert.equal(env.nodes.get('total').textContent, '25');
  assert.equal(env.nodes.get('total-label').textContent, 'TOTAL · 통합 누적');
  const scope = env.nodes.get('collection-scope').textContent;
  assert.match(scope, /기존 Supabase 기록과 Cloudflare 신규 수집을 합산/);
  assert.match(scope, /2026-07-25 ~ 2026-10-11 한국시간 · 방문 23건 · 사용 이벤트 47건/);
  assert.match(scope, /가져오기 완료:.*한국시간/);
  assert.match(scope, /Cloudflare 신규 수집 시작:.*2026/);
  assert.match(scope, /누락 기간은 복원하지 않습니다/);
  assert.doesNotMatch(scope, /누적 통계는 포함하지 않습니다/);
});

test('incomplete or wrong-source import metadata cannot claim history is integrated', async () => {
  for (const historical_import of [
    { ...historicalImport, completed_at: null },
    { ...historicalImport, source: 'other-project' },
    { ...historicalImport, manifest_sha256: '' },
  ]) {
    const env = browser(cloudflareHost, {}, false, {
      get_site_visit_stats: { ...visitStats, historical_import },
      get_site_usage_stats: { ...usageStats, historical_import },
    });
    runInNewContext(dashboard, env.context);
    await settle();
    assert.equal(env.nodes.get('total-label').textContent, 'TOTAL · Cloudflare 누적');
    assert.match(env.nodes.get('collection-scope').textContent, /기존 Supabase 누적 통계는 포함하지 않습니다/);
  }
});

test('cached finalized history keeps its range and warns with the cached timestamp', async () => {
  const snapshot = JSON.stringify({ source: 'cloudflare', days: 30, visits: { ...visitStats, historical_import: historicalImport }, usage: { ...usageStats, historical_import: historicalImport }, at: '2026-10-16T02:00:00Z' });
  const env = browser(cloudflareHost, { [snapshotKey]: snapshot }, true);
  runInNewContext(dashboard, env.context);
  await settle();
  assert.equal(env.nodes.get('total-label').textContent, 'TOTAL · 통합 누적');
  assert.match(env.nodes.get('collection-scope').textContent, /2026-07-25 ~ 2026-10-11/);
  assert.match(env.nodes.get('status-text').textContent, /Cloudflare.*한국시간 저장본/);
  assert.equal(env.nodes.get('status').className, 'status warn');
});

test('pre-import cached usage is discarded when live visits confirm finalized history', async () => {
  const snapshot = JSON.stringify({ source: 'cloudflare', days: 30, visits: visitStats, usage: { ...usageStats, clicks: 999 }, at: '2026-10-15T03:00:00Z' });
  const env = browser(cloudflareHost, { [snapshotKey]: snapshot }, false, {
    get_site_visit_stats: { ...visitStats, historical_import: historicalImport },
    get_site_usage_stats: new Error('offline'),
  });
  runInNewContext(dashboard, env.context);
  await settle();
  assert.equal(env.nodes.get('total-label').textContent, 'TOTAL · 통합 누적');
  assert.equal(env.nodes.get('usage-clicks').textContent, '—');
  assert.match(env.nodes.get('status-text').textContent, /확인 가능한 통계만 표시/);
});

test('pre-import cached visits are discarded when live usage confirms finalized history', async () => {
  const snapshot = JSON.stringify({ source: 'cloudflare', days: 30, visits: { ...visitStats, total: 999 }, usage: usageStats, at: '2026-10-15T03:00:00Z' });
  const env = browser(cloudflareHost, { [snapshotKey]: snapshot }, false, {
    get_site_visit_stats: new Error('offline'),
    get_site_usage_stats: { ...usageStats, historical_import: historicalImport },
  });
  runInNewContext(dashboard, env.context);
  await settle();
  assert.equal(env.nodes.get('total').textContent, '—');
  assert.match(env.nodes.get('collection-scope').textContent, /기존 Supabase 기록과 Cloudflare 신규 수집을 합산/);
  assert.match(env.nodes.get('status-text').textContent, /확인 가능한 통계만 표시/);
});

test('previous Cloudflare snapshot schema cannot supply counts for the imported-history dashboard', async () => {
  const snapshot = JSON.stringify({ source: 'cloudflare', days: 30, visits: { ...visitStats, total: 999 }, usage: usageStats, at: '2026-10-15T03:00:00Z' });
  const env = browser(cloudflareHost, { 'stargate-cloudflare-analytics-snapshot-v1': snapshot }, true);
  runInNewContext(dashboard, env.context);
  await settle();
  assert.equal(env.nodes.get('total').textContent, '—');
  assert.equal(env.nodes.get('status').className, 'status error');
});

test('responses crossing import finalization cannot cache or present mismatched totals', async () => {
  const env = browser(cloudflareHost, {}, false, {
    get_site_visit_stats: { ...visitStats, total: 1 },
    get_site_usage_stats: { ...usageStats, historical_import: historicalImport },
  });
  runInNewContext(dashboard, env.context);
  await settle();
  assert.equal(env.nodes.get('total').textContent, '—');
  assert.equal(env.nodes.get('total-label').textContent, 'TOTAL · 통합 누적');
  assert.equal(env.nodes.get('status').className, 'status warn');
  assert.equal(env.storage.has(snapshotKey), false);
});

test('finalized Cloudflare history enables a 90-day query with matching labels and separate cache', async () => {
  const responses = {
    get_site_visit_stats: { ...visitStats, period: 3, historical_import: historicalImport },
    get_site_usage_stats: { ...usageStats, historical_import: historicalImport },
  };
  const env = browser(cloudflareHost, {}, false, responses);
  runInNewContext(dashboard, env.context);
  await settle();
  assert.equal(env.nodes.get('period-control').hidden, false);
  assert.equal(env.nodes.get('period-days').disabled, false);
  assert.ok(env.requests.every(row => row.payload.p_days === 30));
  responses.get_site_visit_stats = { ...responses.get_site_visit_stats, period: 23 };
  env.nodes.get('period-days').value = '90';
  env.nodes.get('period-days').listeners.change();
  await settle();
  assert.ok(env.requests.slice(-2).every(row => row.payload.p_days === 90));
  assert.equal(env.nodes.get('period-label').textContent, '90 DAYS · 최근 90일');
  assert.equal(env.nodes.get('visits-title').textContent, '최근 90일 방문 추이');
  assert.equal(env.nodes.get('usage-title').textContent, '버튼 사용 분석 · 최근 90일');
  assert.equal(env.nodes.get('monthly').textContent, '23');
  assert.equal(JSON.parse(env.storage.get(snapshotKey)).visits.period, 3);
  assert.equal(JSON.parse(env.storage.get(snapshot90Key)).visits.period, 23);
  assert.equal(JSON.parse(env.storage.get(snapshot90Key)).days, 90);
});

test('90-day failures cannot reuse a successful 30-day snapshot', async () => {
  const responses = {
    get_site_visit_stats: { ...visitStats, period: 3, historical_import: historicalImport },
    get_site_usage_stats: { ...usageStats, historical_import: historicalImport },
  };
  const env = browser(cloudflareHost, {}, false, responses);
  runInNewContext(dashboard, env.context);
  await settle();
  responses.get_site_visit_stats = responses.get_site_usage_stats = new Error('offline');
  env.nodes.get('period-days').value = '90';
  env.nodes.get('period-days').listeners.change();
  await settle();
  assert.equal(env.nodes.get('monthly').textContent, '—');
  assert.equal(env.nodes.get('status').className, 'status error');
  assert.equal(env.nodes.get('period-control').hidden, false);
  assert.equal(env.nodes.get('period-days').disabled, false);
  assert.match(env.nodes.get('collection-scope').textContent, /기존 Supabase 기록과 Cloudflare 신규 수집을 합산/);
});

test('90-day cached fallback displays only the matching period and its saved timestamp', async () => {
  const visits = { ...visitStats, period: 23, historical_import: historicalImport };
  const usage = { ...usageStats, historical_import: historicalImport };
  const snapshot90 = JSON.stringify({ source: 'cloudflare', days: 90, visits, usage, at: '2026-10-16T02:00:00Z' });
  const responses = { get_site_visit_stats: visits, get_site_usage_stats: usage };
  const env = browser(cloudflareHost, { [snapshot90Key]: snapshot90 }, false, responses);
  runInNewContext(dashboard, env.context);
  await settle();
  responses.get_site_visit_stats = responses.get_site_usage_stats = new Error('offline');
  env.nodes.get('period-days').value = '90';
  env.nodes.get('period-days').listeners.change();
  await settle();
  assert.equal(env.nodes.get('monthly').textContent, '23');
  assert.equal(env.nodes.get('usage-title').textContent, '버튼 사용 분석 · 최근 90일');
  assert.match(env.nodes.get('status-text').textContent, /Cloudflare.*한국시간 저장본/);
  assert.equal(env.nodes.get('status').className, 'status warn');
});

test('90-day control stays hidden on original hosts and before historical import', async () => {
  for (const hostname of [cloudflareHost, 'stargateedu.co.kr']) {
    const env = browser(hostname);
    runInNewContext(dashboard, env.context);
    await settle();
    assert.equal(env.nodes.get('period-control').hidden, true);
    assert.equal(env.nodes.get('period-days').disabled, true);
    env.nodes.get('period-days').value = '90';
    env.nodes.get('period-days').listeners.change();
    await settle();
    assert.equal(env.requests.length, 2);
    assert.ok(env.requests.every(row => row.payload.p_days === 30));
  }
});
