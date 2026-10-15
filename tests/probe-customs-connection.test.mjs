import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCustoms, runDiagnostics } from '../scripts/probe-customs-connection.mjs';

const key = 'MOCK-PRIVATE-KEY/+?%';
const proxy = 'https://private-proxy.invalid/api/customs';
function safe(value) {
  const output = JSON.stringify(value);
  for (const privateText of [key, encodeURIComponent(key), proxy, 'secret-body-marker', 'secret-error-marker', 'https://']) assert.equal(output.includes(privateText), false);
}
test('fixed read-only probes put credentials only in their intended transport and emit allowlisted summaries', async () => {
  const calls = [];
  const result = await runDiagnostics({ CUSTOMS_API_KEY: key, CUSTOMS_PROXY_BASE: proxy }, async (input, options) => {
    const url = new URL(input); calls.push({ url, options });
    return new Response('<response><resultCode>00</resultCode><private>secret-body-marker</private></response>', { headers: { 'content-type': 'text/xml; charset=utf-8', 'x-proxy-region': 'icn1', 'x-upstream-status': '200' } });
  });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.redirect, 'manual');
    assert.equal(call.url.searchParams.get('strtYymm'), '202609');
    assert.equal(call.url.searchParams.get('endYymm'), '202609');
    assert.equal(call.url.searchParams.get('numOfRows'), '500');
  }
  assert.equal(calls[0].options.headers['x-data-key'], key);
  assert.equal(calls[0].url.searchParams.has('serviceKey'), false);
  assert.equal(calls[1].url.searchParams.get('serviceKey'), key);
  assert.equal(calls[1].options.headers['x-data-key'], undefined);
  assert.equal(result[0].result_code, '00'); assert.equal(result[0].proxy_region, 'icn1');
  safe(result);
});
test('redirects never follow or read a body, with safe same-origin/login classification', async () => {
  let calls = 0;
  const result = await probeCustoms('proxy', proxy, key, async () => { calls++; return new Response('secret-body-marker', { status: 302, headers: { location: 'https://private-login.invalid/login?key=' + key, 'x-proxy-region': key, 'content-type': key } }); });
  assert.equal(calls, 1); assert.equal(result.classification, 'redirect_rejected');
  assert.equal(result.redirect_same_origin, false); assert.equal(result.login_classification, 'login_redirect');
  assert.equal(result.body_format, null); safe(result);
});
test('errors, denied bodies, arbitrary headers and oversized bodies cannot leak raw content', async () => {
  const failed = await probeCustoms('proxy', proxy, key, async () => { throw new Error('secret-error-marker ' + key + ' ' + proxy); });
  assert.equal(failed.classification, 'fetch_failed'); safe(failed);
  const denied = await probeCustoms('proxy', proxy, key, async () => new Response('<html>AccessDenied Forbidden SERVICE_KEY_IS_NOT_REGISTERED secret-body-marker</html>', { status: 403, headers: { 'x-upstream-status': key, 'x-proxy-region': key, 'content-type': key } }));
  assert.equal(denied.access_denied, true); assert.equal(denied.forbidden, true); assert.equal(denied.key_rejected, true); assert.equal(denied.upstream_status, null); safe(denied);
  const large = await probeCustoms('direct', '', key, async () => new Response('x'.repeat(40000) + key));
  assert.equal(large.body_truncated, true); assert.equal(large.classification, 'body_limit'); safe(large);
});
test('missing secrets and invalid proxy configuration make no network request', async () => {
  let calls = 0; const fetchFn = async () => { calls++; throw new Error('not expected'); };
  const missing = await runDiagnostics({}, fetchFn);
  assert.equal(missing.every(row => !row.configured), true);
  for (const invalid of ['http://private.invalid', proxy + '?key=' + key, 'https://user:password@private.invalid']) {
    const result = await probeCustoms('proxy', invalid, key, fetchFn);
    assert.equal(result.classification, 'invalid_configuration'); safe(result);
  }
  assert.equal(calls, 0);
});
test('encoded whitespace key gets exactly one normalized proxy retry without emitting input or key length', async () => {
  const input = '  ' + encodeURIComponent(key) + '  ', calls = [];
  const results = await runDiagnostics({ CUSTOMS_API_KEY: input, CUSTOMS_PROXY_BASE: proxy }, async (url, options) => {
    calls.push({ url: new URL(url), options });
    return new Response('<response><resultCode>00</resultCode></response>');
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.headers['x-data-key'], input);
  assert.equal(calls[2].options.headers['x-data-key'], key);
  assert.equal(calls[2].url.searchParams.has('serviceKey'), false);
  assert.equal(results[2].probe, 'normalized_proxy');
  assert.deepEqual(results[2].key_format, { trimmed: true, url_encoded: true });
  assert.equal(JSON.stringify(results).includes('length'), false);
  assert.equal(JSON.stringify(results).includes(input), false); safe(results);
});
test('unchanged keys and invalid encodings do not add a retry; whitespace alone retries only proxy', async () => {
  for (const [input, expectedCalls, format] of [
    [key, 2, { trimmed: false, url_encoded: false }],
    ['invalid%ZZprivate', 2, { trimmed: false, url_encoded: false }],
    ['  invalid%ZZprivate  ', 3, { trimmed: true, url_encoded: false }],
  ]) {
    let calls = 0;
    const results = await runDiagnostics({ CUSTOMS_API_KEY: input, CUSTOMS_PROXY_BASE: proxy }, async () => { calls++; throw new Error(input); });
    assert.equal(calls, expectedCalls); assert.deepEqual(results[0].key_format, format);
    assert.equal(JSON.stringify(results).includes(input), false); safe(results);
  }
});
