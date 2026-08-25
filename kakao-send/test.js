const test = require('node:test');
const assert = require('node:assert/strict');
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
