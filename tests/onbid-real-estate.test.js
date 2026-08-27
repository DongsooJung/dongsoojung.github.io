import test from 'node:test';
import assert from 'node:assert/strict';
import { __test } from '../api/onbid-real-estate.js';

test('uses a fixed page size of 100', () => assert.equal(__test.PAGE_SIZE, 100));
test('accepts every documented property code including 0004', () => assert.equal(__test.PROPERTY_CODES.has('0004'), true));
test('does not double encode an encoded service key', () => {
  const url=__test.buildUrl('https://example.test/api',{pageNo:1},'abc%2Fdef%3D');
  assert.match(url,/serviceKey=abc%2Fdef%3D&/);assert.doesNotMatch(url,/%252F/);
});
test('parses the standard data.go.kr response shape', () => {
  const parsed=__test.parsePayload(JSON.stringify({response:{header:{resultCode:'00',resultMsg:'NORMAL SERVICE.'},body:{pageNo:2,numOfRows:100,totalCount:321,items:{item:[{cltrMngNo:'A-1'}]}}}}));
  assert.equal(parsed.pageNo,2);assert.equal(parsed.numOfRows,100);assert.equal(parsed.totalCount,321);assert.equal(parsed.items[0].cltrMngNo,'A-1');
});
test('normalizes list data without exposing arbitrary detail fields', () => {
  const item=__test.normalizeListItem({cltrMngNo:'2026-1',onbidCltrNm:'테스트 토지',zadrNm:'서울특별시 강남구',apslEvlAmt:'1200000000',cltrInprNm:'공개하지 않을 이름'});
  assert.equal(item.id,'2026-1');assert.equal(item.appraisalAmount,1200000000);assert.equal('cltrInprNm' in item,false);
});
test('detail normalization filters unsafe photo URLs and personal sublists', () => {
  const detail=__test.normalizeDetail({cltrMngNo:'2026-2',potoUrlList:[{urlAdr:'https://example.test/photo.jpg'},{urlAdr:'javascript:alert(1)'}],leasInfList:[{cltrInprNm:'임차인 이름'}]});
  assert.deepEqual(detail.photos,['https://example.test/photo.jpg']);assert.equal('leasInfList' in detail,false);
});
