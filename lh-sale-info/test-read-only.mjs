import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/lh-sale-info.js';

async function run(req, upstream, { key = 'fixture-key', dbReadFails = false } = {}) {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.DATA_GO_KR_API_KEY;
  const calls = [];
  if (key) process.env.DATA_GO_KR_API_KEY = key;
  else delete process.env.DATA_GO_KR_API_KEY;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body });
    if (new URL(url).hostname === 'apis.data.go.kr') {
      if (upstream instanceof Error) throw upstream;
      return new Response(upstream.body, { status: upstream.status || 200 });
    }
    if (dbReadFails) throw new Error('database read failed');
    return new Response(JSON.stringify([{ id: 'log-fixture' }]));
  };
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() {} };
  try { await handler({ headers: {}, ...req }, res); }
  finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DATA_GO_KR_API_KEY;
    else process.env.DATA_GO_KR_API_KEY = previousKey;
  }
  return { res, calls };
}

const success = { body: JSON.stringify([{ dsList: [{ PAN_ID: 'notice-1', PAN_NM: 'fixture', UPP_AIS_TP_CD: '05', PAN_NT_ST_DT: '2026.09.01', CLSG_DT: '2026.10.01', ALL_CNT: '1' }] }]) };
for (const [label, upstream] of [
  ['success', success],
  ['HTTP error', { status: 401, body: 'unauthorized' }],
  ['parse error', { body: 'invalid upstream payload' }],
  ['network failure', new Error('fixture network failure')],
]) test(`read-only POST never writes notices or logs after ${label}`, async () => {
  const { res, calls } = await run({ method: 'POST', body: { saveToSupabase: false } }, upstream);
  assert.equal(res.code, label === 'success' ? 200 : 502);
  assert.equal(calls.length, 1);
  assert.ok(calls.every(c => new URL(c.url).hostname === 'apis.data.go.kr'));
  if (label === 'success') { assert.equal(res.body.savedToSupabase, false); assert.equal(res.body.logId, null); }
});
test('missing source key in read-only mode makes no database calls', async () => {
  const { res, calls } = await run({ method: 'POST', body: { saveToSupabase: false } }, success, { key: '' });
  assert.equal(res.code, 502); assert.equal(calls.length, 0);
});
test('GET collect string false remains read-only on upstream failure', async () => {
  const { calls } = await run({ method: 'GET', query: { action: 'collect', saveToSupabase: 'false' } }, { status: 401, body: 'unauthorized' });
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'GET');
});
test('serialized POST body respects explicit read-only mode', async () => {
  const { res, calls } = await run({ method: 'POST', body: JSON.stringify({ saveToSupabase: false }) }, success);
  assert.equal(res.body.savedToSupabase, false); assert.equal(calls.length, 1);
});
test('a status GET failure does not insert an error log', async () => {
  const { res, calls } = await run({ method: 'GET', query: {} }, success, { dbReadFails: true });
  assert.equal(res.code, 502); assert.ok(calls.length > 0); assert.ok(calls.every(c => c.method === 'GET'));
});
test('default save mode retains notice upsert and success log', async () => {
  const { res, calls } = await run({ method: 'POST', body: {} }, success);
  assert.equal(res.body.savedToSupabase, true);
  assert.equal(calls.filter(c => c.method === 'POST').length, 2);
});
test('error log in save mode excludes the supplied source credential', async () => {
  const { calls } = await run({ method: 'POST', body: { apiKey: 'sensitive-fixture', pageNo: 2 } }, { status: 401, body: 'unauthorized' });
  const log = calls.find(c => c.method === 'POST'); assert.ok(log);
  assert.deepEqual(JSON.parse(log.body).params, { pageNo: 2 });
  assert.ok(!log.body.includes('sensitive-fixture'));
});
