import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';

const source = readFileSync(new URL('../assets/dashboard-data-status.js', import.meta.url), 'utf8');
const worker = 'stargate.stargate8225.workers.dev';
function browser(host, fail = false) {
  const requests = [];
  const payload = { series: [{ ym: '2026-10' }] };
  const context = {
    window: {}, location: { hostname: host, href: `https://${host}/exchange-rate/` },
    URL, Map, Intl, Date, Number, AbortSignal,
    document: { documentElement: { lang: 'ko' }, readyState: 'complete', querySelectorAll: () => [] },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fail) throw new Error('offline');
      return { ok: true, json: async () => ({ payload, meta: { name: 'exchange-rate', status: 'ok', mode: 'official_collection', source_at: '2026-10-14', checked_at: '2026-10-15T12:23:00Z' } }) };
    },
  };
  runInNewContext(source, context);
  return { api: context.window.StargateDashboardData, requests, payload };
}

test('homepage and Worker use the same stored dashboard payload without changing upstream collection', async () => {
  for (const hostname of [worker, 'stargateedu.co.kr', 'www.stargateedu.co.kr']) {
    const { api, requests, payload } = browser(hostname);
    assert.equal(api.enabled, true);
    assert.equal(await api.load('exchange-rate'), payload);
    assert.equal(requests[0].url, (hostname === worker ? '' : `https://${worker}`) + '/api/dashboards/exchange-rate');
    assert.equal(requests[0].options.credentials, 'omit');
    assert.equal(requests[0].options.cache, 'no-store');
    const label = api.describe(api.meta('exchange-rate'));
    assert.match(label, /공식 원본 수집.*자료 기준 2026-10-14.*확인.*21:23.*한국시간/);
    assert.ok(!label.includes('2026-10-15T12:23:00Z'), 'fetch time should be formatted for the reader');
  }
});

test('status labels distinguish failed collection, source delay and published synchronization', () => {
  const { api } = browser(worker);
  assert.match(api.describe({ mode: 'published_snapshot', status: 'ok', source_at: '2026-10-15T19:55:00+09:00' }), /정상.*게시본 동기화/);
  assert.match(api.describe({ mode: 'published_snapshot', status: 'degraded', error: 'UPSTREAM_HTTP_403' }), /갱신 실패.*보관본/);
  assert.match(api.describe({ mode: 'official_collection', status: 'stale', stale: true }), /기준 자료 지연/);
  assert.match(api.describe({ status: 'pending' }), /첫 수집 대기/);
});

test('unsupported hosts do not contact the Cloudflare deployment and failed fetch cannot become a fresh zero', async () => {
  const other = browser('example.org');
  assert.equal(other.api.enabled, false);
  assert.equal(await other.api.load('trade'), null);
  assert.equal(other.requests.length, 0);
  const failed = browser(worker, true);
  await assert.rejects(failed.api.load('exchange-rate'), /offline/);
  assert.equal(failed.api.meta('exchange-rate'), null);
});

test('dashboard HTML loads the helper before its application and uses native data with a visible static fallback', () => {
  for (const [file, name] of [['exchange-rate/index.html', 'exchange-rate'], ['trade/index.html', 'trade']]) {
    const html = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.ok(html.indexOf('dashboard-data-status.js') < html.indexOf('let DATA = null'));
    assert.ok(html.includes(`StargateDashboardData.load('${name}')`));
    assert.ok(html.includes('정적 보관본'));
    for (const inline of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (inline[1].trim()) new Script(inline[1]);
  }
});
