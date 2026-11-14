import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LEAD_ID = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: undefined, ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { this.ended = true; return this; },
  };
}

async function withEnv(values, run) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const realFetch = globalThis.fetch;
  try { return await run(); } finally {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

const { default: leads, __test } = await import('../server/api/leads.js');

test('lead target accepts exactly one uuid and the contact action', () => {
  assert.equal(__test.parseTarget({ url: `/api/leads?id=${LEAD_ID}&action=contact` }), LEAD_ID);
  for (const url of [
    '/api/leads',
    `/api/leads?id=${LEAD_ID}`,
    `/api/leads?id=${LEAD_ID}&action=delete`,
    `/api/leads?id=not-a-uuid&action=contact`,
    `/api/leads?id=${LEAD_ID}&id=${LEAD_ID}&action=contact`,
    `/api/leads?id=${LEAD_ID}&action=contact&action=contact`,
  ]) assert.equal(__test.parseTarget({ url }), null, url);
});

test('lead contact requires PATCH and the admin token before touching Supabase', async () => {
  await withEnv({ SMS_ADMIN_TOKEN: 'test-admin-token', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'service' }, async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error('must not be called'); };
    const url = `/api/leads?id=${LEAD_ID}&action=contact`;

    const get = mockRes();
    await leads({ method: 'GET', url, headers: {} }, get);
    assert.equal(get.statusCode, 405);

    const noToken = mockRes();
    await leads({ method: 'PATCH', url, headers: {} }, noToken);
    assert.equal(noToken.statusCode, 401);

    const wrongToken = mockRes();
    await leads({ method: 'PATCH', url, headers: { 'x-admin-token': 'test-admin-tokeX' } }, wrongToken);
    assert.equal(wrongToken.statusCode, 401);

    const badTarget = mockRes();
    await leads({ method: 'PATCH', url: '/api/leads?id=1&action=contact', headers: { 'x-admin-token': 'test-admin-token' } }, badTarget);
    assert.equal(badTarget.statusCode, 400);
    assert.equal(calls, 0);
  });
  await withEnv({ SMS_ADMIN_TOKEN: undefined }, async () => {
    const res = mockRes();
    await leads({ method: 'PATCH', url: `/api/leads?id=${LEAD_ID}&action=contact`, headers: { 'x-admin-token': 'x' } }, res);
    assert.equal(res.statusCode, 503);
  });
});

test('lead contact calls the Supabase RPC and reports missing leads', async () => {
  await withEnv({ SMS_ADMIN_TOKEN: 'test-admin-token', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'service' }, async () => {
    const req = { method: 'PATCH', url: `/api/leads?id=${LEAD_ID}&action=contact`, headers: { 'x-admin-token': 'test-admin-token' } };
    const seen = [];
    globalThis.fetch = async (url, options) => { seen.push([url, JSON.parse(options.body)]); return { ok: true, status: 200, json: async () => true }; };
    const ok = mockRes();
    await leads(req, ok);
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.leadId, LEAD_ID);
    assert.deepEqual(seen, [['https://db.example/rest/v1/rpc/mark_lead_contacted', { p_lead_id: LEAD_ID }]]);

    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => false });
    const missing = mockRes();
    await leads(req, missing);
    assert.equal(missing.statusCode, 404);
  });
});

test('router serves leads but never exposes the alert as a route', async () => {
  const { default: router } = await import('../api/[resource].js');
  await withEnv({ SMS_ADMIN_TOKEN: 'test-admin-token' }, async () => {
    const routed = mockRes();
    await router({ method: 'GET', url: '/api/leads', headers: {} }, routed);
    assert.equal(routed.statusCode, 405);
  });
  const hidden = mockRes();
  await router({ method: 'GET', url: '/api/alert-uncontacted', headers: {} }, hidden);
  assert.equal(hidden.statusCode, 404);
});

test('daily cron runs the lead alert and every cron fits the Hobby once-per-day limit', () => {
  const source = readFileSync(new URL('../api/cron/daily-collect.js', import.meta.url), 'utf8');
  assert.match(source, /import leadAlertHandler from '\.\.\/\.\.\/server\/api\/alert-uncontacted\.js'/);
  assert.match(source, /\['lead-alert',/);
  const { crons } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(crons.map(cron => cron.path), ['/api/cron/daily-collect']);
  for (const cron of crons) assert.match(cron.schedule, /^\d{1,2} \d{1,2} \* \* \*$/, cron.schedule);
});

test('lead alert reports missing Supabase settings instead of sending', async () => {
  await withEnv({ SUPABASE_URL: undefined, SUPABASE_SERVICE_KEY: undefined }, async () => {
    globalThis.fetch = async () => { throw new Error('must not be called'); };
    const { default: alert } = await import('../server/api/alert-uncontacted.js?missing-env');
    const res = mockRes();
    await alert({ method: 'POST', headers: {} }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.ok, false);
  });
});
