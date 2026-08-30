import assert from 'node:assert/strict';
import test from 'node:test';
import { OPERATIONS, buildUrl, newestNotices, normalize, parsePayload } from '../scripts/bidpublic-lib.mjs';

test('maps all four official bid notice operations', () => { assert.equal(OPERATIONS.servc.path, 'getBidPblancListInfoServc'); assert.equal(Object.keys(OPERATIONS).length, 4); });
test('uses the documented lowercase serviceKey parameter', () => assert.match(buildUrl(OPERATIONS.servc.path, { pageNo: 1 }, 'abc'), /\?serviceKey=abc&/));
test('normalizes useful notice fields without contact data', () => { const parsed = parsePayload(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: [{ bidNtceNo: 'R26', bidNtceNm: 'AI 시스템', ntceInsttNm: '기관', presmptPrce: '10,000', ntceInsttOfclTelNo: 'secret' }] } } })); const item = normalize(parsed.items[0], 'servc'); assert.equal(item.estimatedPrice, 10000); assert.equal(item.agency, '기관'); assert.equal('ntceInsttOfclTelNo' in item, false); });
test('filters unsafe detail URLs', () => assert.equal(normalize({ bidNtceNo: '1', bidNtceNm: 'x', bidNtceDtlUrl: 'javascript:alert(1)' }, 'servc').detailUrl, ''));
test('keeps blank monetary values as null', () => assert.equal(normalize({ bidNtceNo: '1', bidNtceNm: 'x', presmptPrce: '' }, 'servc').estimatedPrice, null));
test('allows only G2B detail links', () => { assert.equal(normalize({ bidNtceNo: '1', bidNtceNm: 'x', bidNtceDtlUrl: 'https://evil.example/x' }, 'servc').detailUrl, ''); assert.match(normalize({ bidNtceNo: '1', bidNtceNm: 'x', bidNtceDtlUrl: 'https://www.g2b.go.kr/x' }, 'servc').detailUrl, /g2b\.go\.kr/); });
test('keeps the newest order and sorts latest notices first', () => { const items = newestNotices([{ noticeNo: 'A', noticeOrder: '0', title: 'old', noticeAt: '2026-08-01' }, { noticeNo: 'A', noticeOrder: '1', title: 'new order', noticeAt: '2026-08-02' }, { noticeNo: 'B', noticeOrder: '0', title: 'latest', noticeAt: '2026-08-03' }]); assert.deepEqual(items.map((item) => item.title), ['latest', 'new order']); });
