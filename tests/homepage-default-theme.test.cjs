const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('homepage defaults to the white theme without overriding saved choices', () => {
  assert.match(html, /<html lang="ko" data-theme="light">/);
  assert.match(html, /<meta name="theme-color" content="#ffffff">/);
  assert.match(html, /themes\.includes\(saved\) \? saved : 'light'/);
  assert.match(html, /document\.documentElement\.dataset\.theme = 'light'/);
  assert.match(html, /themes\.includes\(theme\) \? theme : 'light'/);
  assert.doesNotMatch(html, /prefers-color-scheme: light/);
});
