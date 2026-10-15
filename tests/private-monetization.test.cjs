const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const handler = require('../private-gateway/api/private-monetization.js');
const CREDENTIAL = '0123';

const original = {
  MONETIZATION_PIN_HASH: process.env.MONETIZATION_PIN_HASH,
  MONETIZATION_SESSION_KEY: process.env.MONETIZATION_SESSION_KEY,
  MONETIZATION_HTML_GZIP_BASE64: process.env.MONETIZATION_HTML_GZIP_BASE64,
  MONETIZATION_ALLOWED_HOST: process.env.MONETIZATION_ALLOWED_HOST,
};

function setup() {
  const salt = crypto.randomBytes(16);
  const digest = crypto.scryptSync(CREDENTIAL, salt, 32, handler._test.SCRYPT_OPTIONS);
  process.env.MONETIZATION_PIN_HASH = `scrypt$${salt.toString('base64url')}$${digest.toString('base64url')}`;
  process.env.MONETIZATION_SESSION_KEY = crypto.randomBytes(32).toString('base64url');
  process.env.MONETIZATION_HTML_GZIP_BASE64 = zlib.gzipSync('<!doctype html><html><body>PRIVATE_TOP_100</body></html>').toString('base64');
  process.env.MONETIZATION_ALLOWED_HOST = 'stargate-private-gateway.vercel.app';
}

function request({ method = 'GET', path = '/strategy/monetization-opportunities/', headers = {}, body } = {}) {
  const req = { method, url: path, headers: { host: 'stargate-private-gateway.vercel.app', ...headers }, body };
  const result = { statusCode: 200, headers: {}, body: '' };
  const res = {
    setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
    status(code) { result.statusCode = code; return this; },
    send(data) { result.body = String(data); return result; },
    end() { return result; },
  };
  handler(req, res);
  return result;
}

test.after(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('fails closed without complete secrets', () => {
  setup();
  delete process.env.MONETIZATION_HTML_GZIP_BASE64;
  const response = request();
  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(response.body, /PRIVATE_TOP_100/);
  setup();
  process.env.MONETIZATION_PIN_HASH = 'sha256$old$format';
  assert.equal(request().statusCode, 503);
  setup();
});

test('unauthenticated page and direct API never serve private HTML', () => {
  setup();
  for (const path of ['/strategy/monetization-opportunities/', '/api/private-monetization']) {
    const response = request({ path });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /비공개 자료/);
    assert.doesNotMatch(response.body, /PRIVATE_TOP_100/);
    assert.match(response.headers['cache-control'], /no-store/);
    assert.match(response.headers['x-robots-tag'], /noindex/);
  }
});

test('wrong password, cross-origin post and wrong host are rejected', () => {
  setup();
  const form = { method: 'POST', path: '/api/private-monetization', headers: { origin: 'https://stargate-private-gateway.vercel.app', 'content-type': 'application/x-www-form-urlencoded' } };
  assert.equal(request({ ...form, body: { password: 'wrong' } }).statusCode, 401);
  assert.equal(request({ ...form, body: { password: '9999' } }).statusCode, 401);
  assert.equal(request({ ...form, body: { password: '01234' } }).statusCode, 401);
  assert.equal(request({ ...form, headers: { ...form.headers, origin: 'https://evil.example' }, body: { password: CREDENTIAL } }).statusCode, 403);
  assert.equal(request({ ...form, headers: { ...form.headers, host: 'attacker.example' }, body: { password: CREDENTIAL } }).statusCode, 404);
  assert.equal(request({ path: '/strategy/monetization-opportunities/other' }).statusCode, 404);
  assert.equal(request({ ...form, path: '/strategy/monetization-opportunities/', body: { password: CREDENTIAL } }).statusCode, 405);
  assert.equal(request({ ...form, path: '/strategy/monetization-opportunities', body: { password: CREDENTIAL } }).statusCode, 405);
});

test('valid password establishes secure cookie; tampering, expiry and logout revoke browser access', () => {
  setup();
  const login = request({ method: 'POST', path: '/api/private-monetization', headers: { origin: 'https://stargate-private-gateway.vercel.app', 'content-type': 'application/x-www-form-urlencoded' }, body: { password: CREDENTIAL } });
  assert.equal(login.statusCode, 303);
  assert.match(login.headers['set-cookie'], /^__Host-stargate_monetization=/);
  assert.match(login.headers['set-cookie'], /Secure; HttpOnly; SameSite=Strict/);
  const cookie = login.headers['set-cookie'].split(';')[0];
  const page = request({ headers: { cookie } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /PRIVATE_TOP_100/);
  assert.match(page.body, /로그아웃/);
  const direct = request({ path: '/api/private-monetization', headers: { cookie } });
  assert.equal(direct.statusCode, 200);
  assert.match(direct.body, /PRIVATE_TOP_100/);
  const altered = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
  assert.doesNotMatch(request({ headers: { cookie: altered } }).body, /PRIVATE_TOP_100/);
  const config = handler._test.readConfig(process.env);
  assert.equal(handler._test.hasSession(cookie, config, Date.now() + 9 * 60 * 60 * 1000), false);
  const logout = request({ method: 'POST', path: '/api/private-monetization', headers: { origin: 'https://stargate-private-gateway.vercel.app', 'content-type': 'application/x-www-form-urlencoded', cookie }, body: { action: 'logout' } });
  assert.equal(logout.statusCode, 303);
  assert.match(logout.headers['set-cookie'], /Max-Age=0/);
});

test('canonical public page can read private HTML only after valid cross-origin password', () => {
  setup();
  const path = '/api/private-monetization';
  const headers = { origin: 'https://stargateedu.co.kr', 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'cross-site' };
  const preflight = request({ method: 'OPTIONS', path, headers });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], 'https://stargateedu.co.kr');
  const wrong = request({ method: 'POST', path, headers, body: { password: 'invalid' } });
  assert.equal(wrong.statusCode, 401);
  assert.doesNotMatch(wrong.body, /PRIVATE_TOP_100/);
  assert.equal(wrong.headers['access-control-allow-origin'], 'https://stargateedu.co.kr');
  const right = request({ method: 'POST', path, headers, body: { password: CREDENTIAL } });
  assert.equal(right.statusCode, 200);
  assert.match(right.body, /PRIVATE_TOP_100/);
  assert.match(right.body, /location\.reload\(\)/);
  assert.equal(right.headers['access-control-allow-origin'], 'https://stargateedu.co.kr');
  assert.match(right.headers['cache-control'], /no-store/);
  assert.equal(right.headers['set-cookie'], undefined);
  const foreign = request({ method: 'POST', path, headers: { ...headers, origin: 'https://evil.example' }, body: { password: CREDENTIAL } });
  assert.equal(foreign.statusCode, 403);
  assert.equal(foreign.headers['access-control-allow-origin'], undefined);
});
