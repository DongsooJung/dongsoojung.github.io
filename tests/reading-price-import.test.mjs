import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPriceEnrichment, applyPriceRows, normalizePriceTitle, parseCsv } from '../scripts/import-reading-prices.mjs';

test('확정된 가격만 반영하고 CSV 따옴표와 판매처 링크를 처리한다', () => {
  const rows = parseCsv('도서명,정가(원),판매가(원),조회 상태,매칭된 도서명,링크\r\n책 A,"18,000","16,200",조회 완료,책 A,https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=123\r\n책 B,,,확인 필요(제목 유사),,\r\n');
  const payload = { books: [{ title: '책 A', listPrice: null }, { title: '책 B', listPrice: 12000 }] };
  const prices = applyPriceRows(payload, rows);
  assert.equal(prices.records.length, 1);
  const books = applyPriceEnrichment(payload.books, prices);
  assert.equal(books[0].listPrice, 18000);
  assert.equal(books[0].salePrice, 16200);
  assert.match(books[0].aladinUrl, /ItemId=123$/);
  assert.equal(books[1].listPrice, 12000);
});

test('정가가 없는 확정 결과는 판매가를 사용하고 잘못된 링크는 제외한다', () => {
  const payload = { books: [{ title: '책', listPrice: null }] };
  const prices = applyPriceRows(payload, [{
    도서명: '책', '정가(원)': '', '판매가(원)': '9,900', '조회 상태': '조회 완료',
    '매칭된 도서명': '책',
    링크: 'https://www.aladin.co.kr/shop/wproduct.aspx?ItemId=',
  }]);
  const books = applyPriceEnrichment(payload.books, prices);
  assert.equal(prices.records.length, 1);
  assert.equal(books[0].listPrice, null);
  assert.equal(books[0].salePrice, 9900);
  assert.equal(books[0].aladinUrl, undefined);
});

test('후속권 오매칭은 거부하고 대소문자·문장부호 차이만 있는 제목은 허용한다', () => {
  assert.equal(normalizePriceTitle('Clear Thinking (개정판)'), 'clearthinking개정판');
  const payload = { books: [{ title: '경제학 콘서트' }, { title: 'Clear-Thinking' }] };
  const prices = applyPriceRows(payload, [
    { 도서명: '경제학 콘서트', '정가(원)': '19,000', '판매가(원)': '17,100', '조회 상태': '조회 완료', '매칭된 도서명': '경제학 콘서트 2', 링크: '' },
    { 도서명: 'Clear-Thinking', '정가(원)': '22,000', '판매가(원)': '19,800', '조회 상태': '조회 완료', '매칭된 도서명': 'clear thinking', 링크: '' },
  ]);
  assert.deepEqual(prices.records.map((record) => record.title), ['Clear-Thinking']);
});
