import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../server/api/gh-sale-info.js');
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

test('GH current data attributes and omitted cell end tags retain dates and regions', () => {
  const html = `<tr><td>1</td><td>행복주택</td>
    <td><a href="#a" data-pbancNo="811" data-previewYn="N" data-pbancKndCd="01" data-bizTyNm="행복주택">기업체 기숙사 추가모집</a></td>
    <td>연천군<td>pdf</td><td>2026-08-24</td><td>-<td>-<td>확인</td><td>18,153</td></tr>`;
  const [row] = parseGhListHtml(html, SOURCES[0]);
  assert.equal(row.pbanc_no, '811');
  assert.equal(row.region, '연천군');
  assert.equal(row.posted_at, '2026-08-24');
  assert.equal(row.closed_at, '');
  assert.equal(row.views, 18153);
  const detail = new URL(row.detail_url);
  assert.equal(detail.pathname, '/sb/sr/sr7150/selectPbancDetailView.do');
  assert.equal(detail.searchParams.get('pbancNo'), '811');
  assert.equal(detail.searchParams.get('pbancKndCd'), '01');
});

test('GH collection still runs when preceding daily collectors fail', async () => {
  const { __test: cron } = await import('../api/cron/daily-collect.js');
  const attempted = [];
  const results = await cron.runCollectors([
    ['lh', async () => { attempted.push('lh'); throw new Error('upstream unavailable'); }],
    ['gh', async () => { attempted.push('gh'); return { saved: 10 }; }],
  ]);
  assert.deepEqual(attempted, ['lh', 'gh']);
  assert.deepEqual(results, [
    { kind: 'lh', ok: false, error: 'upstream unavailable' },
    { kind: 'gh', ok: true, saved: 10 },
  ]);
});

test('GH notices map into the existing LH table shape', () => {
  const { toLhRow, fromLhRow } = mod.__test;
  const source = {
    source_type:'rent-house', source_label:'임대주택', pbanc_no:'801',
    notice_type:'행복주택', title:'테스트 공고', region:'연천군',
    posted_at:'2026-08-24', closed_at:'2026-09-10', status:'접수중',
    views:9422, detail_url:'https://apply.gh.or.kr/detail', source_url:'https://apply.gh.or.kr/list',
    raw:{cells:[]}, fetched_at:'2026-10-01T00:00:00.000Z'
  };
  const stored = toLhRow(source);
  assert.equal(stored.pan_id, 'gh:rent-house:801');
  assert.equal(stored.upp_ais_tp_cd, 'GH_RENT_HOUSE');
  assert.equal(fromLhRow(stored).title, '테스트 공고');
});
