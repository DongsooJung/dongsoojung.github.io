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

test('GET returns OneNote and Notion status payload', async () => {
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
});
