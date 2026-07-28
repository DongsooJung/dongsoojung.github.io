/**
 * 나라장터 공사 입찰공고 파서·정규화 단위 테스트
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../api/bid-pblanc-cnstwk.js');
const { parseBidPayload, normalizeItem, buildUrl, encodeServiceKey, PAGE_SIZE } = mod.__test;

test('PAGE_SIZE is 100', () => {
  assert.equal(PAGE_SIZE, 100);
});

test('encodeServiceKey encodes raw decoding key once', () => {
  const key = 'abc+def=';
  assert.equal(encodeServiceKey(key), encodeURIComponent(key));
  assert.equal(encodeServiceKey(encodeURIComponent(key)), encodeURIComponent(key));
});

test('buildUrl keeps serviceKey outside URLSearchParams', () => {
  const url = buildUrl({ pageNo: 1, numOfRows: 100, inqryDiv: 1, type: 'json' }, 'raw+key');
  assert.match(url, /serviceKey=raw%2Bkey/);
  assert.match(url, /numOfRows=100/);
  assert.match(url, /getBidPblancListInfoCnstwk/);
});

test('parseBidPayload reads JSON list and totalCount', () => {
  const payload = JSON.stringify({
    response: {
      header: { resultCode: '00', resultMsg: '정상' },
      body: {
        totalCount: 2,
        items: [
          {
            bidNtceNo: '20260100001',
            bidNtceOrd: '00',
            bidNtceNm: '도로 포장 공사',
            ntceInsttNm: '서울특별시',
            dminsttNm: '강남구청',
            cntrctCnclsMthdNm: '일반경쟁',
            bidMethdNm: '전자입찰',
            ntceDt: '2026-07-21 09:00:00',
            bidClseDt: '2026-07-28 18:00:00',
            presmptPrce: '150000000',
            bidNtceDtlUrl: 'https://example.com/1',
          },
          {
            bidNtceNo: '20260100002',
            bidNtceNm: '학교 증축 공사',
            ntceInsttNm: '경기도교육청',
            dminsttNm: '수원시',
            cntrctCnclsMthdNm: '제한경쟁',
            presmptPrce: '980000000',
          },
        ],
      },
    },
  });
  const parsed = parseBidPayload(payload);
  assert.equal(parsed.totalCount, 2);
  assert.equal(parsed.items.length, 2);
  const row = normalizeItem(parsed.items[0], 1);
  assert.equal(row.bid_ntce_no, '20260100001');
  assert.equal(row.ntce_instt_nm, '서울특별시');
  assert.equal(row.presmpt_prce, 150000000);
  assert.equal(row.page_no, 1);
});

test('parseBidPayload wraps single item object', () => {
  const payload = JSON.stringify({
    response: {
      header: { resultCode: '00', resultMsg: '정상' },
      body: {
        totalCount: 1,
        items: {
          bidNtceNo: '20260100009',
          bidNtceNm: '단일 공고',
          ntceInsttNm: '조달청',
        },
      },
    },
  });
  const parsed = parseBidPayload(payload);
  assert.equal(parsed.items.length, 1);
  assert.equal(normalizeItem(parsed.items[0], 3).bid_ntce_nm, '단일 공고');
});

test('parseBidPayload rejects API error codes', () => {
  const payload = JSON.stringify({
    response: {
      header: { resultCode: '30', resultMsg: '서비스키 오류' },
      body: {},
    },
  });
  assert.throws(() => parseBidPayload(payload), /서비스키/);
});

test('parseBidPayload handles forbidden text', () => {
  assert.throws(() => parseBidPayload('Forbidden'), /403/);
});
