const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('seasonal banner is injected only during its active date range', () => {
  const notice = html.match(/<aside class="chuseok-notice"[\s\S]*?<\/aside>/)?.[0] || '';
  assert.match(notice, /<button type="button" aria-label="추석 인사 닫기">/);
  assert.doesNotMatch(notice, /<img\b/i);
  assert.match(html, /if \(kstDate < '2026-09-24' \|\| kstDate > '2026-09-27'\) return;/);
  assert.match(html, /notice\.prepend\(picture\);/);
});

test('seasonal banner serves a modern image with an older-browser fallback', () => {
  assert.match(html, /source\.srcset = '\/assets\/chuseok-2026-greeting\.webp';/);
  assert.match(html, /source\.type = 'image\/webp';/);
  assert.match(html, /image\.src = '\/assets\/chuseok-2026-greeting\.jpg';/);
  assert.match(html, /image\.decoding = 'async';/);
});
