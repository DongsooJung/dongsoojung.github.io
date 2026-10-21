const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('homepage defaults to the white theme without overriding saved choices', () => {
  // 다른 속성(예: data-font)이 추가되어도 기본 테마가 light 인지만 확인합니다.
  assert.match(html, /<html lang="ko" data-theme="light"(?:\s[^>]*)?>/);
  assert.match(html, /<meta name="theme-color" content="#ffffff">/);
  assert.match(html, /themes\.includes\(saved\) \? saved : 'light'/);
  assert.match(html, /document\.documentElement\.dataset\.theme = 'light'/);
  assert.match(html, /themes\.includes\(theme\) \? theme : 'light'/);
  assert.doesNotMatch(html, /prefers-color-scheme: light/);
});
