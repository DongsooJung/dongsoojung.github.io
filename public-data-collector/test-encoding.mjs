import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Vercel ESM handler 파일에서 테스트 훅을 가져온다.
const require = createRequire(import.meta.url);

// api/*.js 는 export default 를 쓰므로 dynamic import 사용
const mod = await import('../api/public-data-collector.js');
const { buildUrl, toCsv, parseResponse, encodeServiceKey } = mod.__test;

test('인코딩 키는 재인코딩하지 않는다', () => {
  const encoded = 'aB3xY%2FzQ9k%2BLm7n%3D%3D';
  assert.equal(encodeServiceKey(encoded), encoded);
  const url = buildUrl('https://apis.data.go.kr/example', { LAWD_CD: '11680' }, encoded);
  assert.match(url, /serviceKey=aB3xY%2FzQ9k%2BLm7n%3D%3D/);
  assert.doesNotMatch(url, /%252F/);
});

test('디코딩 키는 1회만 인코딩한다', () => {
  const raw = 'aB3xY/zQ9k+Lm7n==';
  const url = buildUrl('https://apis.data.go.kr/example', { LAWD_CD: '11680' }, raw);
  assert.match(url, /serviceKey=aB3xY%2FzQ9k%2BLm7n%3D%3D/);
});

test('CSV는 BOM과 이종 필드를 병합한다', () => {
  const csv = toCsv([{ a: 1, b: 2 }, { a: 3, c: 'x,y' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(csv.split('\n')[0], '\uFEFFa,b,c');
  assert.match(csv, /"x,y"/);
});

test('JSON 래핑 차이를 흡수한다', () => {
  const a = parseResponse(JSON.stringify({
    response: { header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' }, body: { items: { item: [{ id: 1 }] }, totalCount: 1, pageNo: 1, numOfRows: 1 } },
  }));
  assert.equal(a.items.length, 1);

  const b = parseResponse(JSON.stringify({
    header: { resultCode: '00' },
    body: { items: [{ id: 2 }], totalCount: 1 },
  }));
  assert.equal(b.items[0].id, 2);
});

// require 미사용 경고 방지
void require;
