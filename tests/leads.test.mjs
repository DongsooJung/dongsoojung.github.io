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

async function runAlert(tag, solapi) {
  const calls = [];
  const env = {
    SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'service',
    SOLAPI_API_KEY: 'key', SOLAPI_API_SECRET: 'secret',
    SOLAPI_SENDER_NUMBER: '01011112222', SUPPORT_ADMIN_PHONE: '01033334444',
  };
  return withEnv(env, async () => {
    globalThis.fetch = async (url, options = {}) => {
      calls.push([options.method || 'GET', String(url)]);
      if (String(url).startsWith('https://api.solapi.com/')) return solapi();
      if ((options.method || 'GET') === 'GET') {
        return { ok: true, status: 200, json: async () => [{ id: LEAD_ID, name: '홍길동', submitted_at: '2026-11-12T00:00:00.000Z' }] };
      }
      return { ok: true, status: 201, json: async () => null, text: async () => '' };
    };
    const { default: alert } = await import(`../server/api/alert-uncontacted.js?${tag}`);
    const res = mockRes();
    await alert({ method: 'POST', headers: {} }, res);
    return { res, calls };
  });
}

test('lead alert leaves leads unalerted when the SMS does not go out', async () => {
  for (const [tag, solapi] of [
    ['rejected', async () => ({ ok: false, status: 400, json: async () => ({}) })],
    ['partial', async () => ({ ok: true, status: 200, json: async () => ({ failedMessageList: [{}] }) })],
    ['network', async () => { throw new Error('offline'); }],
  ]) {
    const { res, calls } = await runAlert(tag, solapi);
    assert.equal(res.statusCode, 502, tag);
    assert.equal(res.body.pending, 1, tag);
    assert.equal(calls.some(([method]) => method === 'PATCH'), false, tag);
  }
});

test('lead alert marks leads alerted once the SMS is accepted', async () => {
  const { res, calls } = await runAlert('sent', async () => ({ ok: true, status: 200, json: async () => ({ failedMessageList: [] }) }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.alerted, 1);
  assert.equal(calls.filter(([method, url]) => method === 'PATCH' && url.includes('/rest/v1/leads?id=in.')).length, 1);
});

test('consult form posts a category the support SMS endpoint accepts and never probes phone numbers', async () => {
  const { default: supportSms } = await import('../api/support-sms.js');
  const page = readFileSync(new URL('../consult/index.html', import.meta.url), 'utf8');
  const category = /category:"([^"]+)"/.exec(page)?.[1];
  assert.ok(supportSms._private.ALLOWED_CATEGORIES.has(category), category);
  const input = supportSms._private.validate({
    ticketId: 'SG-261114-AB12C', name: '홍길동', phone: '010-1234-5678', category, urgency: '일반',
    message: '상담 신청이 접수되었습니다.', submittedAt: new Date().toISOString(),
  });
  assert.equal(input.error, undefined);
  assert.doesNotMatch(page, /check_duplicate_lead|\/rest\/v1\/rpc\//);
});

test('leads SQL grants anon only a column-scoped insert and exposes no anon RPC', () => {
  const sql = readFileSync(new URL('../supabase/leads.sql', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../consult/index.html', import.meta.url), 'utf8');
  const grant = /grant insert \(([^)]+)\)\s+on table public\.leads to anon;/.exec(sql);
  assert.ok(grant, 'anon insert grant exists');
  assert.ok(sql.indexOf(grant[0]) > sql.indexOf('revoke all on table public.leads'), 'grant follows the revoke');
  const columns = grant[1].split(',').map(column => column.trim());
  const payload = /const payload=\{([\s\S]*?)\};/.exec(page)[1];
  const sent = [...payload.matchAll(/(?:^|[,\s])([a-z_]+)(?=[:,]|\s*$)/gm)].map(match => match[1]);
  assert.ok(sent.length >= 6, sent.join());
  for (const column of sent) assert.ok(columns.includes(column), `form sends ${column}`);
  assert.doesNotMatch(sql, /grant execute[^;]*\bto[^;]*\banon\b/);
  assert.doesNotMatch(sql, /grant (select|update|delete|all)[^;]*\bto[^;]*\banon\b/);
  assert.match(sql, /create trigger leads_skip_duplicate_open\s+before insert on public\.leads/);
});
