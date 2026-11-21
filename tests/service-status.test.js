import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/service-status.js';

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

test('OPTIONS returns 204 with CORS headers', async () => {
  const res = mockRes();
  await handler({ method: 'OPTIONS', query: {} }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
});

test('rejects non-GET methods', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('GET returns OneNote and Notion status payload without live network probes', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(String(url));
    assert.equal(options?.headers?.Authorization, undefined);
    if (String(url).endsWith('/api/v2/summary.json')) {
      return { ok: true, json: async () => ({ status: { indicator: 'none' }, components: [], incidents: [] }) };
    }
    return { status: new URL(String(url)).hostname === 'api.notion.com' ? 401 : 200, url: String(url) };
  });
  const res = mockRes();
  await handler({ method: 'GET', query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.checkedAt);
  assert.ok(res.body.services.onenote);
  assert.ok(res.body.services.notion);
  assert.ok(Array.isArray(res.body.services.onenote.probes));
  assert.ok(Array.isArray(res.body.services.notion.probes));
  assert.ok(['operational', 'degraded', 'down', 'unknown'].includes(res.body.services.onenote.overall));
  assert.ok(['operational', 'degraded', 'down', 'unknown'].includes(res.body.services.notion.overall));
  assert.equal(res.body.services.onenote.probes.length, 3);
  assert.equal(res.body.services.notion.probes.length, 2);
  assert.equal(calls.length, 6);
  assert.equal(res.body.services.notion.overall, 'operational');
});

test('authentication and failed probes do not become provider incidents', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => String(url).endsWith('/summary.json')
    ? { ok: true, json: async () => ({ status: { indicator: 'none' }, components: [] }) }
    : { status: new URL(String(url)).hostname === 'api.notion.com' ? 401 : 503, url: String(url) });
  const res = mockRes(); await handler({ method: 'GET' }, res);
  assert.equal(res.body.services.notion.overall, 'operational');
  assert.equal(res.body.services.onenote.overall, 'unknown');
  const auth = res.body.services.notion.probes.find(p => p.id === 'notion-api');
  assert.equal(auth.ok, false); assert.equal(auth.state, 'unknown');
  assert.equal(auth.reachability, 'auth_required');
  assert.equal(res.body.services.notion.summary.avgLatencyMs, null);
});

test('provider incident and original update time survive reachable endpoints', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => String(url).endsWith('/summary.json')
    ? { ok: true, json: async () => ({ page: { updated_at: '2026-10-26T17:50:43Z' }, status: { indicator: 'major' }, components: Array.from({ length: 19 }, (_, i) => ({ id: String(i), name: 'Component ' + i, status: 'operational' })) }) }
    : { status: 200, url: String(url) });
  const res = mockRes(); await handler({ method: 'GET' }, res);
  assert.equal(res.body.services.notion.overall, 'down');
  assert.equal(res.body.services.notion.official.updatedAt, '2026-10-26T17:50:43Z');
  assert.equal(res.body.services.notion.official.components.length, 19);
});

test('network and malformed provider responses remain unknown', async (t) => {
  let malformed = false;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (!malformed) throw new TypeError('network unavailable');
    return String(url).endsWith('/summary.json') ? { ok: true, json: async () => ({}) } : { status: 200, url: String(url) };
  });
  let res = mockRes(); await handler({ method: 'GET' }, res);
  assert.equal(res.body.services.onenote.overall, 'unknown');
  assert.equal(res.body.services.notion.overall, 'unknown');
  assert.equal(res.body.services.onenote.summary.avgLatencyMs, null);
  malformed = true; res = mockRes(); await handler({ method: 'GET' }, res);
  assert.equal(res.body.services.notion.overall, 'unknown');
  assert.equal(res.body.services.notion.official.ok, false);
});
