const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const handler = require('../private-gateway/api/private-monetization.js');
const CREDENTIAL = 'correct-horse-battery-staple-1234567890-ABCDEFGH';

const original = {
  MONETIZATION_PASSWORD_HASH: process.env.MONETIZATION_PASSWORD_HASH,
  MONETIZATION_SESSION_KEY: process.env.MONETIZATION_SESSION_KEY,
  MONETIZATION_HTML_GZIP_BASE64: process.env.MONETIZATION_HTML_GZIP_BASE64,
  MONETIZATION_ALLOWED_HOST: process.env.MONETIZATION_ALLOWED_HOST,
};

function setup() {
  const digest = crypto.createHash('sha256').update(CREDENTIAL).digest();
  process.env.MONETIZATION_PASSWORD_HASH = `sha256$${digest.toString('base64url')}`;
  process.env.MONETIZATION_SESSION_KEY = crypto.randomBytes(32).toString('base64url');
  process.env.MONETIZATION_HTML_GZIP_BASE64 = zlib.gzipSync('<!doctype html><html><body>PRIVATE_TOP_100</body></html>').toString('base64');
  process.env.MONETIZATION_ALLOWED_HOST = 'stargateedu.co.kr';
}

function request({ method = 'GET', path = '/strategy/monetization-opportunities/', headers = {}, body } = {}) {
  const req = { method, url: path, headers: { host: 'stargateedu.co.kr', ...headers }, body };
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
  process.env.MONETIZATION_PASSWORD_HASH = 'pbkdf2_sha256$310000$old$format';
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
  const form = { method: 'POST', headers: { origin: 'https://stargateedu.co.kr', 'content-type': 'application/x-www-form-urlencoded' } };
  assert.equal(request({ ...form, body: { password: 'wrong' } }).statusCode, 401);
  assert.equal(request({ ...form, body: { password: 'correct-horse' } }).statusCode, 401);
  assert.equal(request({ ...form, headers: { ...form.headers, origin: 'https://evil.example' }, body: { password: CREDENTIAL } }).statusCode, 403);
  assert.equal(request({ ...form, headers: { ...form.headers, host: 'attacker.example' }, body: { password: CREDENTIAL } }).statusCode, 404);
  assert.equal(request({ path: '/strategy/monetization-opportunities/other' }).statusCode, 404);
});

test('valid password establishes secure cookie; tampering, expiry and logout revoke browser access', () => {
  setup();
  const login = request({ method: 'POST', headers: { origin: 'https://stargateedu.co.kr', 'content-type': 'application/x-www-form-urlencoded' }, body: { password: CREDENTIAL } });
  assert.equal(login.statusCode, 303);
  assert.match(login.headers['set-cookie'], /^__Host-stargate_monetization=/);
  assert.match(login.headers['set-cookie'], /Secure; HttpOnly; SameSite=Strict/);
  const cookie = login.headers['set-cookie'].split(';')[0];
  const page = request({ headers: { cookie } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /PRIVATE_TOP_100/);
  assert.match(page.body, /로그아웃/);
  const direct = request({ path: '/api/private-monetization', headers: { cookie } });
  assert.equal(direct.statusCode, 302);
  assert.doesNotMatch(direct.body, /PRIVATE_TOP_100/);
  const altered = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
  assert.doesNotMatch(request({ headers: { cookie: altered } }).body, /PRIVATE_TOP_100/);
  const config = handler._test.readConfig(process.env);
  assert.equal(handler._test.hasSession(cookie, config, Date.now() + 9 * 60 * 60 * 1000), false);
  const logout = request({ method: 'POST', headers: { origin: 'https://stargateedu.co.kr', 'content-type': 'application/x-www-form-urlencoded', cookie }, body: { action: 'logout' } });
  assert.equal(logout.statusCode, 303);
  assert.match(logout.headers['set-cookie'], /Max-Age=0/);
});
