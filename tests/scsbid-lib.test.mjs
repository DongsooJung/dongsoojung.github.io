import assert from 'node:assert/strict';
import test from 'node:test';
import { OPERATIONS, buildUrl, encodeServiceKey, normalize, parsePayload } from '../scripts/scsbid-lib.mjs';

test('maps all four official award operations', () => { assert.equal(OPERATIONS.servc.path, 'getScsbidListSttusServc'); assert.equal(Object.keys(OPERATIONS).length, 4); });
test('keeps an encoded service key from being double encoded', () => assert.equal(encodeServiceKey('abc%2Fdef%3D'), 'abc%2Fdef%3D'));
test('normalizes a partially encoded service key safely', () => assert.equal(encodeServiceKey('abc%2Fdef+='), 'abc%2Fdef%2B%3D'));
test('uses the exact uppercase ServiceKey parameter', () => { const url = buildUrl('getScsbidListSttusServc', { pageNo: 1 }, 'abc'); assert.match(url, /\?ServiceKey=abc&/); });
test('normalizes without exposing business contact fields', () => { const parsed = parsePayload(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: [{ bidNtceNo: 'R26', bidNtceNm: 'AI 용역', bidwinnrNm: '테스트사', bidwinnrBizno: 'secret', bidwinnrTelNo: 'secret', sucsfbidAmt: '12,000' }] } } })); const item = normalize(parsed.items[0], 'servc'); assert.equal(item.amount, 12000); assert.equal('bidwinnrBizno' in item, false); assert.equal('bidwinnrTelNo' in item, false); });
