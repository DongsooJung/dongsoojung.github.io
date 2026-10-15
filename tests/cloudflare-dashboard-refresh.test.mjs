import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DashboardStore, DASHBOARD_COLLECTOR_VERSION, DASHBOARD_UPSTREAMS, parseEcbHistory, parseCustomsMonth, tradeMonths } from '../cloudflare/dashboard-refresh.mjs';

const now = Date.parse('2026-10-15T11:30:00Z');
const DAY = 86400000;
function database() {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: { exec(sql, ...bindings) {
      if (sql.includes('CREATE TABLE')) { db.exec(sql); return { toArray: () => [] }; }
      const rows = db.prepare(sql).all(...bindings).map(row => ({ ...row }));
      return { toArray: () => rows };
    } },
    transactionSync(fn) { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } },
  };
  return { db, storage, store: new DashboardStore(storage) };
}
function ecbXML() {
  const rows = [];
  for (let time = Date.parse('2026-07-17T00:00:00Z'); time <= Date.parse('2026-10-14T00:00:00Z'); time += DAY) {
    const day = new Date(time);
    if ([0, 6].includes(day.getUTCDay())) continue;
    rows.push(`<Cube time="${day.toISOString().slice(0, 10)}"><Cube currency="USD" rate="1.2"/><Cube currency="JPY" rate="180"/><Cube currency="CNY" rate="8"/><Cube currency="KRW" rate="1500"/></Cube>`);
  }
  return `<Cube>${rows.reverse().join('')}</Cube>`;
}
const baselineFx = { sourceMode: 'ecb', latest: { date: '2026-10-13' }, series: [{ ym: '1999-01', days: 20, rates: { USD: { avg: 1000, min: 990, max: 1010 } } }, { ym: '2026-07', days: 23, rates: { USD: { avg: 777, min: 777, max: 777 } } }] };
const baselineTrade = { sourceMode: 'official', latestYm: '2026-08', updatedAt: '2026-09-23', series: [{ ym: '2026-06', exp: 100, imp: 80, bal: 20 }], countries: { '2026-06': [{ cd: 'CN', name: '중국', exp: 90, imp: 70, bal: 20 }] } };
const urban = { meta: { source_mode: 'api', data_updated_at: '2026-10-15 19:55', generated_at: '2026-10-15T20:25+09:00' }, ranking: [{ area: '강남역', population: 100 }] };
const customsXML = '<response><header><resultCode>00</resultCode></header><body><totalCount>2</totalCount><items><item><statCd>총계</statCd><expDlr>100000000</expDlr><impDlr>80000000</impDlr><balPayments>20000000</balPayments></item><item><statCd>CN</statCd><statCdCntnKor1>중국</statCdCntnKor1><expDlr>90000000</expDlr><impDlr>70000000</impDlr><balPayments>20000000</balPayments></item></items></body></response>';
function fetcher(calls = []) {
  return async (input, options) => {
    const url = String(input); calls.push({ url, options });
    if (url === DASHBOARD_UPSTREAMS.fxSnapshot) return Response.json(baselineFx);
    if (url === DASHBOARD_UPSTREAMS.fx) return new Response(ecbXML());
    if (url === DASHBOARD_UPSTREAMS.tradeSnapshot) return Response.json(baselineTrade);
    if (url === DASHBOARD_UPSTREAMS.urban) return Response.json(urban);
    if (url.startsWith('https://proxy.example/api/customs?')) return new Response(customsXML);
    throw new Error('unexpected upstream');
  };
}

test('ECB cross-rates preserve JPY100 and exact daily-to-monthly aggregation', () => {
  const parsed = parseEcbHistory(ecbXML(), now);
  assert.equal(parsed.latest.date, '2026-10-14');
  assert.deepEqual(parsed.latest.rates, { USD: 1250, JPY: 833.33, EUR: 1500, CNY: 187.5 });
  assert.equal(parsed.series.at(-1).rates.USD.avg, 1250);
  assert.throws(() => parseEcbHistory('<Cube/>', now), /ECB_EMPTY_DATA/);
  assert.throws(() => parseEcbHistory(ecbXML(), now - 120 * DAY), /UPSTREAM_FUTURE_DATE/);
});

test('scheduled refresh collects official FX/trade and labels urban as published synchronization', async () => {
  const { db, storage, store } = database();
  try {
    const calls = [];
    await store.refresh({ CUSTOMS_API_KEY: 'local-test-only', CUSTOMS_PROXY_BASE: 'https://proxy.example/api/customs' }, { now, fetchFn: fetcher(calls) });
    const fx = store.get('exchange-rate', now), trade = store.get('trade', now), seoul = store.get('urban', now);
    assert.equal(fx.payload.series.find(row => row.ym === '2026-07').rates.USD.avg, 777, 'partial leading month must preserve full baseline');
    assert.equal(fx.payload.series[0].ym, '1999-01');
    assert.equal(fx.meta.mode, 'official_collection');
    assert.equal(fx.meta.source_at, '2026-10-14');
    assert.equal(trade.payload.latestYm, '2026-09');
    assert.equal(trade.payload.countryLatestYm, '2026-09');
    assert.equal(trade.payload.series.find(row => row.ym === '2026-09').exp, 100);
    assert.equal(trade.meta.source_at, '2026-09');
    assert.equal(trade.meta.mode, 'official_collection');
    assert.equal(seoul.meta.mode, 'published_snapshot');
    assert.equal(seoul.meta.source_at, '2026-10-15T19:55:00+09:00');
    assert.notEqual(seoul.meta.source_at, seoul.meta.refreshed_at);
    assert.ok(calls.filter(row => row.url.includes('proxy.example')).every(row => !row.url.includes('local-test-only') && row.options.headers['x-data-key'] === 'local-test-only' && row.options.redirect === 'manual'));
    const before = calls.length;
    await store.refresh({}, { now: now + 1000, fetchFn: fetcher(calls) });
    assert.equal(calls.length, before, 'public bootstrap must not bypass due throttling');
    assert.deepEqual(new DashboardStore(storage).get('trade', now), trade, 'data survives store reinitialization');
  } finally { db.close(); }
});

test('failure preserves last good payload, upstream date and successful refresh timestamp', async () => {
  const { db, store } = database();
  try {
    await store.refresh({}, { now, fetchFn: fetcher() });
    const before = store.get('exchange-rate', now);
    await store.refresh({}, { now: now + DAY, fetchFn: async () => { throw new Error('request secret must never be serialized'); } });
    const after = store.get('exchange-rate', now + DAY);
    assert.deepEqual(after.payload, before.payload);
    assert.equal(after.meta.refreshed_at, before.meta.refreshed_at);
    assert.equal(after.meta.source_at, before.meta.source_at);
    assert.equal(after.meta.status, 'degraded');
    assert.equal(after.meta.checked_at, new Date(now + DAY).toISOString());
    assert.ok(!JSON.stringify(after).includes('request secret'));
    assert.equal(store.get('trade', now).meta.mode, 'published_snapshot');
    assert.equal(store.get('trade', now).meta.error, 'CUSTOMS_KEY_NOT_CONFIGURED');
  } finally { db.close(); }
});

test('run completion records actual elapsed collection time rather than copying the start timestamp', async () => {
  const { db, store } = database();
  try {
    const regular = fetcher();
    await store.refresh({}, { now, fetchFn: async (url, options) => {
      await new Promise(resolve => setTimeout(resolve, 3));
      return regular(url, options);
    } });
    const run = store.status(now).last_run;
    assert.equal(run.started_at, new Date(now).toISOString());
    assert.ok(Date.parse(run.completed_at) > Date.parse(run.started_at));
  } finally { db.close(); }
});

test('first official API failure keeps the real published trade snapshot with explicit degraded status', async () => {
  const { db, store } = database();
  try {
    const regular = fetcher();
    await store.refresh({ CUSTOMS_API_KEY: 'local-test-only', CUSTOMS_PROXY_BASE: 'https://proxy.example/api/customs' }, { now, fetchFn: async (url, options) => String(url).includes('proxy.example') ? new Response('blocked', { status: 403 }) : regular(url, options) });
    const value = store.get('trade', now);
    assert.deepEqual(value.payload, baselineTrade);
    assert.equal(value.meta.mode, 'published_snapshot');
    assert.equal(value.meta.status, 'degraded');
    assert.equal(value.meta.error, 'UPSTREAM_HTTP_403');
    assert.equal(value.meta.source_at, '2026-08');
  } finally { db.close(); }
});

test('failed collection retries after fifteen minutes without bypassing the normal success interval', async () => {
  const { db, store } = database();
  try {
    const calls = [];
    await store.refresh({}, { now, fetchFn: fetcher(calls), trigger: 'bootstrap' });
    assert.equal(store.get('trade', now).meta.next_refresh_at, new Date(now + 15 * 60000).toISOString());
    const before = calls.length;
    const env = { CUSTOMS_API_KEY: 'local-test-only', CUSTOMS_PROXY_BASE: 'https://proxy.example/api/customs' };
    await store.refresh(env, { now: now + 14 * 60000, fetchFn: fetcher(calls) });
    assert.equal(calls.length, before);
    await store.refresh(env, { now: now + 16 * 60000, fetchFn: fetcher(calls) });
    assert.equal(calls.length, before + 3, 'only the failed trade job should retry');
    assert.equal(store.get('trade', now + 16 * 60000).meta.status, 'ok');
    assert.equal(store.get('trade', now + 16 * 60000).meta.next_refresh_at, new Date(now + 16 * 60000 + DAY).toISOString());
    assert.equal(store.status(now).last_run.last_trigger, 'scheduled');
    assert.equal(store.status(now).last_run.last_scheduled_at, new Date(now + 16 * 60000).toISOString());
  } finally { db.close(); }
});

test('a repaired collector version retries old failures once without exposing a public force option', async () => {
  const { db, store } = database();
  try {
    for (const name of ['exchange-rate', 'trade', 'urban']) store.write(name, {
      checked_at: new Date(now).toISOString(), collector_version: '20261015-1', status: 'error', error: 'UPSTREAM_INVALID_JSON',
    });
    const calls = [];
    await store.refresh({}, { now: now + 1000, fetchFn: fetcher(calls) });
    assert.ok(calls.length >= 4, 'recent old-version failures must retry immediately after a code repair');
    assert.ok(store.status(now).datasets.every(row => row.collector_version === DASHBOARD_COLLECTOR_VERSION));
    const attempted = calls.length;
    await store.refresh({}, { now: now + 2000, fetchFn: fetcher(calls) });
    assert.equal(calls.length, attempted, 'the same repaired version must still honor retry throttling');
  } finally { db.close(); }
});

test('manual upstream redirects are rejected before a credential-bearing request can follow them', async () => {
  const { db, store } = database();
  try {
    const calls = [], regular = fetcher(calls);
    await store.refresh({ CUSTOMS_API_KEY: 'local-test-only', CUSTOMS_PROXY_BASE: 'https://proxy.example/api/customs' }, {
      now, fetchFn: async (url, options) => {
        assert.equal(options.redirect, 'manual', 'workerd supports follow/manual only');
        if (String(url).includes('proxy.example')) { calls.push({ url: String(url), options }); return new Response(null, { status: 302, headers: { Location: 'https://unexpected.example/collect' } }); }
        return regular(url, options);
      },
    });
    assert.equal(store.get('trade', now).meta.error, 'UPSTREAM_REDIRECT_REJECTED');
    assert.ok(calls.every(row => !row.url.includes('unexpected.example')));
    assert.ok(!JSON.stringify(store.get('trade', now)).includes('local-test-only'));
  } finally { db.close(); }
});

test('fetch, body and JSON failures have separate safe stages instead of all claiming invalid JSON', async () => {
  for (const [expected, fetchFn] of [
    ['UPSTREAM_FETCH_FAILED', async () => { throw new TypeError('request details and secrets must stay private'); }],
    ['UPSTREAM_BODY_FAILED', async () => ({ ok: true, status: 200, headers: new Headers(), body: { getReader() { throw new Error('broken reader'); } } })],
    ['UPSTREAM_INVALID_JSON', async () => new Response('<html>not JSON</html>')],
  ]) {
    const { db, store } = database();
    try {
      await store.refresh({}, { now, fetchFn });
      const status = store.status(now);
      assert.ok(status.datasets.every(row => row.error === expected));
      assert.ok(!JSON.stringify(status).includes('request details'));
    } finally { db.close(); }
  }
});

test('SQL chunk storage preserves large Unicode payloads atomically and avoids oversized rows', () => {
  const { db, storage, store } = database();
  try {
    const payload = { content: '가😀'.repeat(170000) };
    store.write('urban', { source_at: urban.meta.data_updated_at, status: 'ok' }, payload);
    assert.deepEqual(new DashboardStore(storage).get('urban', now).payload, payload);
    assert.ok(db.prepare('SELECT MAX(length(CAST(content AS BLOB))) AS n FROM dashboard_chunks').get().n < 240000);
  } finally { db.close(); }
});

test('monthly publication schedule and Customs validation preserve missing data as errors', () => {
  assert.deepEqual(tradeMonths(now), ['2026-09', '2026-08', '2026-07']);
  assert.deepEqual(tradeMonths(Date.parse('2026-10-14T11:00:00Z')), ['2026-08', '2026-07', '2026-06']);
  assert.equal(parseCustomsMonth(customsXML).total.exp, 100);
  assert.throws(() => parseCustomsMonth(customsXML.replace('<resultCode>00</resultCode>', '<resultCode>30</resultCode>')), /CUSTOMS_API_REJECTED/);
  assert.throws(() => parseCustomsMonth(customsXML.replace('<totalCount>2</totalCount>', '<totalCount>501</totalCount>')), /CUSTOMS_TRUNCATED_PAGE/);
  assert.throws(() => parseCustomsMonth(customsXML.replace('100000000', 'not-a-number')), /CUSTOMS_INVALID_AMOUNT/);
});
