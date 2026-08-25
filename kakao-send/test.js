const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _private } = require('./api/send');

test('send input uses a registered fixed link', () => {
  const result = _private.validate({ message: '테스트', linkUrl: 'https://example.com/' });
  assert.equal(result.text, '테스트');
  assert.equal(result.linkUrl, 'https://stargateedu.co.kr/');
});

test('send input rejects empty and oversized messages', () => {
  assert.match(_private.validate({ message: '' }).error, /1자/);
  assert.match(_private.validate({ message: '가'.repeat(201) }).error, /200자/);
});

test('Kakao consent errors expose a re-consent code', () => {
  const result = _private.mapKakaoError({ code: -402, required_scopes: ['talk_message'] }, 403);
  assert.equal(result.code, 'KAKAO_CONSENT_REQUIRED');
  assert.equal(result.status, 403);
});

test('client-secret fallback keeps the Legacy SDK constrained', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /persistAccessToken:\s*false/);
  assert.match(html, /scope:\s*'talk_message'/);
  assert.match(html, /data:\s*\{\s*template_object:/);
  assert.match(html, /https:\/\/stargateedu\.co\.kr\//);
  assert.match(html, /https:\/\/t1\.kakaocdn\.net\/kakao_js_sdk\/v1\/kakao\.min\.js/);
  assert.match(html, /auth === 'client_secret_error' \|\| auth === 'state_error'/);
  assert.doesNotMatch(html, /console\.(?:log|debug|info)\s*\(/);
});
