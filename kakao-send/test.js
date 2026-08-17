const test = require('node:test');
const assert = require('node:assert/strict');
const { _private } = require('./api/send');

test('send input accepts safe links and text', () => {
  const result = _private.validate({ message: '테스트', linkUrl: 'https://stargateedu.co.kr/a' }, 'https://app.test');
  assert.equal(result.text, '테스트');
  assert.equal(result.linkUrl, 'https://stargateedu.co.kr/a');
});

test('send input rejects empty and oversized messages', () => {
  assert.match(_private.validate({ message: '' }, 'https://app.test').error, /1자/);
  assert.match(_private.validate({ message: '가'.repeat(1001) }, 'https://app.test').error, /1,000자/);
});

test('send input replaces unsafe link schemes', () => {
  const result = _private.validate({ message: '테스트', linkUrl: 'javascript:alert(1)' }, 'https://app.test');
  assert.equal(result.linkUrl, 'https://www.stargateedu.co.kr/');
});
