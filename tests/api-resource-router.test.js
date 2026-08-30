import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/[resource].js';
import airportCongestion from '../server/api/airport-congestion.js';
import customs from '../server/api/customs.js';
import googleTrends from '../server/api/google-trends.js';
import naverCafePopular from '../server/api/naver-cafe-popular.js';
import portfolioNotion from '../server/api/portfolio-notion.js';
import usedCarRegistration from '../server/api/used-car-registration.js';

const implementations = new Map([
  ['airport-congestion', airportCongestion],
  ['customs', customs],
  ['google-trends', googleTrends],
  ['naver-cafe-popular', naverCafePopular],
  ['portfolio-notion', portfolioNotion],
  ['used-car-registration', usedCarRegistration],
]);

function responseRecorder() {
  return {
    statusCode: undefined, body: undefined, headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function snapshot(response) {
  return { status: response.statusCode, headers: response.headers, body: response.body };
}

test('all six paths preserve OPTIONS, unsupported methods, CORS and request contents', async () => {
  for (const [name, original] of implementations) {
    for (const method of ['OPTIONS', 'POST', 'DELETE']) {
      const request = Object.freeze({
        url: `/api/${name}`, method,
        query: Object.freeze({}), body: Object.freeze({ keep: 'body unchanged' }),
        headers: Object.freeze({ origin: 'https://stargateedu.co.kr' }),
      });
      const expected = responseRecorder();
      const actual = responseRecorder();
      await original(request, expected);
      await handler(request, actual);
      assert.deepEqual(snapshot(actual), snapshot(expected), `${name} ${method}`);
    }
  }
});

test('unknown, internal, malformed and encoded paths cannot select a handler', async () => {
  const paths = [
    undefined, null, {}, '', '/', '/api', '/api/', '/api/unknown', '/api/__proto__',
    '/api/constructor', '/api/prototype', '/api/sms', '/api/cron/daily-collect',
    '/api/[resource]', '/api/customs/extra', '/api/customs//', '/api/../api/customs',
    '/api/%63ustoms', '/api/customs%2f', '/api/customs%3Fresource=google-trends',
    '/api/%2e%2e/customs', '//api/customs', 'https://example.com/api/customs',
    '/api\\customs', '/server/api/customs.js', '/api/customs#fragment',
  ];
  for (const url of paths) {
    const response = responseRecorder();
    await handler({ url, query: { resource: 'customs' } }, response);
    assert.equal(response.statusCode, 404, String(url));
    assert.deepEqual(response.body, { ok: false, error: 'not_found' });
    assert.equal(response.headers['cache-control'], 'no-store');
  }
});

test('path, not spoofed scalar/array/resource query values, controls dispatch', async () => {
  for (const resource of ['customs', ['customs', 'portfolio-notion'], '__proto__']) {
    const response = responseRecorder();
    await handler({
      url: '/api/google-trends?resource=customs&resource=portfolio-notion',
      method: 'POST', headers: {}, query: { resource },
    }, response);
    assert.equal(response.statusCode, 405);
    assert.deepEqual(response.body, { error: 'method_not_allowed' });
  }
  const response = responseRecorder();
  await handler({ url: '/api/unknown?resource=customs', query: { resource: 'customs' } }, response);
  assert.equal(response.statusCode, 404);
});

test('trailing slash and untrusted origins preserve handler CORS policy', async () => {
  const response = responseRecorder();
  await handler({
    url: '/api/google-trends/?geo=KR', method: 'OPTIONS',
    headers: { origin: 'https://untrusted.example' }, query: { geo: 'KR' },
  }, response);
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  assert.equal(response.headers['access-control-allow-methods'], 'GET, OPTIONS');
});

test('customs preserves query/header credentials, XML and upstream HTTP status', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: new URL(url), options });
    return { status: 429, text: async () => '<error>rate_limit</error>' };
  });
  const query = Object.freeze({
    resource: 'google-trends', strtYymm: '2026-01', endYymm: '2026-02',
    pageNo: '2', numOfRows: '50', serviceKey: 'ignored-query-key',
  });
  const response = responseRecorder();
  await handler({
    url: '/api/customs?resource=google-trends', method: 'GET', query,
    headers: { 'x-data-key': 'test/header+key' },
  }, response);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get('serviceKey'), 'test/header+key');
  assert.equal(requests[0].url.searchParams.get('strtYymm'), '202601');
  assert.equal(requests[0].url.searchParams.get('endYymm'), '202602');
  assert.equal(requests[0].url.searchParams.get('pageNo'), '2');
  assert.equal(requests[0].url.searchParams.get('numOfRows'), '50');
  assert.equal(response.statusCode, 429);
  assert.equal(response.body, '<error>rate_limit</error>');
  assert.equal(response.headers['content-type'], 'text/xml; charset=utf-8');
  assert.equal(response.headers['x-upstream-status'], '429');
});

test('Google Trends retains multi-geo, period, limit and cache semantics', async (t) => {
  const urls = [];
  const rows = [['Example', null, null, [1700000000], null, null, 1234, null, null, ['related'], [7]]];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(new URL(url));
    return { ok: true, text: async () => `AF_initDataCallback({key: 'ds:0', data:${JSON.stringify([null, rows])}, sideChannel: {}});` };
  });
  const response = responseRecorder();
  await handler({
    url: '/api/google-trends?geo=KR,US&hours=24&limit=1&resource=customs',
    method: 'GET', headers: { origin: 'https://stargateedu.co.kr' },
    query: { geo: 'KR,US', hours: '24', limit: '1', resource: 'customs' },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(urls.map((url) => url.searchParams.get('geo')), ['KR', 'US']);
  assert.ok(urls.every((url) => url.searchParams.get('hours') === '24'));
  assert.equal(response.body.items.length, 1);
  assert.equal(response.body.items[0].volume, 1234);
  assert.match(response.headers['cache-control'], /s-maxage=300/);
  assert.equal(response.headers['access-control-allow-origin'], 'https://stargateedu.co.kr');
});

test('Naver Cafe still normalizes its public upstream articles', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ message: { result: { articleList: [{
      articleId: 12, subject: 'Example article', nickname: 'Writer',
      writeDateTimestamp: 1700000000000, statDate: '20260831',
    }] } } }),
  }));
  const response = responseRecorder();
  await handler({ url: '/api/naver-cafe-popular', method: 'GET', headers: {}, query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.articles[0].articleId, 12);
  assert.equal(response.body.articleCount, 1);
  assert.match(response.headers['cache-control'], /s-maxage=30/);
});

test('portfolio remains fail-closed when its Notion credential is missing', async () => {
  const keys = ['NOTION_API_KEY', 'NOTION_TOKEN'];
  const saved = keys.map((key) => process.env[key]);
  try {
    keys.forEach((key) => delete process.env[key]);
    const response = responseRecorder();
    await handler({ url: '/api/portfolio-notion', method: 'GET', headers: {}, query: {} }, response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.error, 'NOTION_API_KEY is not configured');
    assert.equal(response.headers['access-control-allow-origin'], '*');
  } finally {
    keys.forEach((key, i) => saved[i] == null ? delete process.env[key] : process.env[key] = saved[i]);
  }
});

test('used-car registration retains selected month and 18 upstream requests', async (t) => {
  const savedKey = process.env.DATA_GO_KR_API_KEY;
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(new URL(url));
    return { ok: true, text: async () => '<response><resultCode>00</resultCode><dtaCo>100</dtaCo></response>' };
  });
  try {
    process.env.DATA_GO_KR_API_KEY = 'test-key';
    const response = responseRecorder();
    await handler({
      url: '/api/used-car-registration?year=2025&month=12&resource=customs',
      method: 'GET', headers: {}, query: { year: '2025', month: '12', resource: 'customs' },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.period, '2025-12');
    assert.equal(response.body.total, 100);
    assert.equal(urls.length, 18);
    assert.equal(response.body.trend.length, 12);
    assert.equal(response.headers['cache-control'], 's-maxage=43200, stale-while-revalidate=86400');
  } finally {
    if (savedKey == null) delete process.env.DATA_GO_KR_API_KEY;
    else process.env.DATA_GO_KR_API_KEY = savedKey;
  }
});

test('airport route retains last-good static fallback on upstream failure', async (t) => {
  const fallback = {
    status: 'ok', generated_at: new Date().toISOString(),
    forecast: { today: Array(24).fill({}), tomorrow: Array(24).fill({}) }, waiting: [{}],
  };
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).startsWith('https://www.stargateedu.co.kr/')) {
      return { ok: true, json: async () => fallback };
    }
    throw new Error('simulated upstream failure');
  });
  const response = responseRecorder();
  await handler({ url: '/api/airport-congestion', method: 'GET', headers: {}, query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.delivery.mode, 'static_fallback');
  assert.equal(response.body.delivery.fallback, true);
  assert.match(response.headers['vercel-cdn-cache-control'], /max-age=60/);
});
