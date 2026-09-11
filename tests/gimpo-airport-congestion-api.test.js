import test from 'node:test';
import assert from 'node:assert/strict';
import { __test } from '../server/api/gimpo-airport-congestion.js';

const sampleItem = {
  IATA_APCD: 'GMP', PRC_HR: '202609101430',
  CGDR_A_LVL: '1', CGDR_B_LVL: '2', CGDR_C_LVL: '3', CGDR_ALL_LVL: '2',
};

test('uses the approved B551178 gateway v1 endpoint', () => {
  const url = new URL(__test.buildUrl('test-key'));
  assert.equal(`${url.origin}${url.pathname}`, 'https://apis.data.go.kr/B551178/airport-congestion/v1');
  assert.equal(url.searchParams.get('pageNo'), '1');
  assert.equal(url.searchParams.get('numOfRows'), '100');
  assert.equal(url.searchParams.get('type'), 'json');
});

test('normalizes the GW response wrapper for Gimpo Airport', () => {
  const payload = { response: { body: { items: { item: [sampleItem] } } } };
  const result = __test.normalize(payload, __test.API_BASE, new Date('2026-09-10T05:30:00Z'));
  assert.equal(result.status, 'ok');
  assert.equal(result.airport.code, 'GMP');
  assert.equal(result.overall.text, '보통');
  assert.deepEqual(result.zones.map(zone => zone.text), ['원활', '보통', '혼잡']);
  assert.equal(result.source_endpoint, __test.API_BASE);
});

test('accepts a single item object from XML-to-JSON gateways', () => {
  assert.deepEqual(__test.extractRows({ body: { items: { item: sampleItem } } }), [sampleItem]);
});
