const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'research/index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cards = [...html.matchAll(/<a\b[^>]*\bdata-card(?:\s|=|>)[\s\S]*?<\/a>/g)].map(m => m[0]);
const attr = (source, name) => source.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const key = href => {
  const url = new URL(href, 'https://www.stargateedu.co.kr');
  return /^(www\.)?stargateedu\.co\.kr$/.test(url.hostname)
    ? url.pathname.replace(/\/$/, '') : url.href.replace(/\/$/, '');
};

test('six research filters partition every unique project without losing the static math archive', () => {
  const filters = [...html.matchAll(/<button\b[^>]*data-filter="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(filters, ['all', 'urban', 'society', 'research', 'education', 'operations']);
  assert.equal(cards.length, 63);
  assert.equal(new Set(cards.map(card => key(attr(card, 'href')))).size, cards.length);
  for (const card of cards) assert.ok(filters.slice(1).includes(attr(card, 'data-primary')), attr(card, 'href'));
  const heroTotal = Number(html.match(/data-project-total[^>]*>(\d+)/)[1]);
  assert.equal(heroTotal, cards.length);
  assert.ok(home.includes(`관측·연구·교육·운영 · ${cards.length}개 프로젝트`));
});

test('education and research are selected by purpose rather than incidental topic tags', () => {
  const education = cards.filter(card => attr(card, 'data-primary') === 'education');
  assert.equal(education.length, 7);
  assert.equal(education.filter(card => attr(card, 'href').startsWith('/research/math/')).length, 4);
  assert.ok(education.some(card => attr(card, 'href') === '/math-grader/'));
  for (const route of ['climate-algebraic-geometry', 'korea-challenges', 'korean-unification-challenges', 'deep-earth-ocean-challenges']) {
    assert.equal(attr(cards.find(card => attr(card, 'href') === `/research/${route}/`), 'data-primary'), 'research');
  }
  assert.equal(attr(cards.find(card => attr(card, 'href') === '/strategy/weather-calendar/'), 'data-primary'), 'urban');
  assert.equal(attr(cards.find(card => attr(card, 'href') === '/onenote-notion-status/'), 'data-primary'), 'operations');
});

test('four lanes have stable addressable groups and preserve existing hub bookmarks', () => {
  const groups = [...html.matchAll(/<details\b[^>]*data-card-group[^>]*>/g)].map(m => m[0]);
  assert.equal(groups.length, 9);
  assert.deepEqual([...new Set(groups.map(g => attr(g, 'data-lane')))], ['observation', 'research', 'education', 'operations']);
  assert.ok(groups.every(g => attr(g, 'id')));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['information-economics', 'bukangi', 'kmo-training', 'education-research', 'researcher-vision', 'ai-ml', 'grand-challenges', 'urban-atlas', 'featured-policy', 'api-observatory', 'math-education']) assert.ok(ids.includes(id), id);
  assert.ok(html.includes('data-preserve-group-order="true"'));
});
