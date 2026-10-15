import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const cloudflareHost = 'stargate.stargate8225.workers.dev';
const visitStats = { source: 'cloudflare', started_at: '2026-10-15T03:00:00Z', today: 0, total: 0, period: 0, daily: [] };
const usageStats = { source: 'cloudflare', started_at: visitStats.started_at, page_views: 0, clicks: 0, clicking_visitors: 0, engagement_rate: 0, pages: [], buttons: [] };

function browser(hostname, initial = {}, fail = false) {
  class Element {
    constructor() { this.dataset = {}; this.style = {}; this.children = []; this.textContent = ''; this.classList = { add() {} }; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    matches() { return false; }
    getAttribute() { return null; }
    setAttribute() {}
    addEventListener() {}
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
      if (fail) throw new Error('offline');
      const data = url.endsWith('get_site_visit_stats') ? visitStats
        : url.endsWith('get_site_usage_stats') ? usageStats
          : url.endsWith('get_site_button_click_counts') ? [] : { ok: true };
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
  assert.match(env.nodes.get('collection-scope').textContent, /수집 시작:.*2026.*한국시간/);
  assert.match(env.nodes.get('collection-scope').textContent, /기존 Supabase 누적 통계는 포함하지 않습니다/);
  const snapshot = JSON.parse(env.storage.get('stargate-cloudflare-analytics-snapshot-v1'));
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
  const snapshot = JSON.stringify({ source: 'cloudflare', visits: visitStats, usage: usageStats, at: '2026-10-15T03:00:00Z' });
  const env = browser(cloudflareHost, { 'stargate-cloudflare-analytics-snapshot-v1': snapshot }, true);
  runInNewContext(dashboard, env.context);
  await settle();
  assert.equal(env.nodes.get('total').textContent, '0');
  assert.match(env.nodes.get('status-text').textContent, /Cloudflare.*2026.*한국시간 저장본/);
  assert.equal(env.nodes.get('status').className, 'status warn');
});
