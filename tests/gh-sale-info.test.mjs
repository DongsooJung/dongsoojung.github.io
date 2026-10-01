import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../api/gh-sale-info.js');
const { parseGhListHtml, normalizeDate, SOURCES } = mod.__test;

test('GH sources include three public notice categories', () => {
  assert.equal(SOURCES.length, 3);
  assert.deepEqual(SOURCES.map((s) => s.sourceType), ['rent-house','rent-store','buy-rent']);
});

test('GH list parser extracts normalized notice fields', () => {
  const html = `
    <table><tbody><tr>
      <td>1</td><td>행복주택</td>
      <td><a href="/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=801">연천BIX 경기행복주택 추가모집</a></td>
      <td>연천군</td><td>pdf</td><td>2026-08-24</td><td>2026-09-10</td><td>접수중</td><td>확인</td><td>9,422</td>
    </tr></tbody></table>`;
  const rows = parseGhListHtml(html, SOURCES[0]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pbanc_no, '801');
  assert.equal(rows[0].title, '연천BIX 경기행복주택 추가모집');
  assert.equal(rows[0].region, '연천군');
  assert.equal(rows[0].posted_at, '2026-08-24');
  assert.equal(rows[0].closed_at, '2026-09-10');
  assert.equal(rows[0].status, '접수중');
  assert.equal(rows[0].views, 9422);
});

test('normalizeDate accepts dot/slash/dash separators', () => {
  assert.equal(normalizeDate('2026.8.4'), '2026-08-04');
  assert.equal(normalizeDate('2026/08/04'), '2026-08-04');
});
