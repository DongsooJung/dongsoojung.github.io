import test from 'node:test';
import assert from 'node:assert/strict';
import { __test } from '../server/api/used-car-registration.js';

test('documents the four official vehicle type codes', () => {
  assert.deepEqual(__test.VEHICLE_TYPES, [['1', '승용'], ['2', '승합'], ['3', '화물'], ['4', '특수']]);
});

test('parses a normal XML count and rejects API errors', () => {
  assert.equal(__test.parseCount('<response><header><resultCode>00</resultCode><resultMsg>NORMAL_CODE</resultMsg></header><body><dtaCo>146860</dtaCo></body></response>'), 146860);
  assert.throws(() => __test.parseCount('<response><header><resultCode>30</resultCode><resultMsg>KEY ERROR</resultMsg></header></response>'), /KEY ERROR/);
});

test('uses the previous completed Seoul month and validates overrides', () => {
  const now = new Date('2026-08-29T02:00:00Z');
  assert.deepEqual(__test.previousSeoulMonth(now), { year: 2026, month: 7 });
  assert.deepEqual(__test.validatePeriod('2025', '12', now), { year: 2025, month: 12 });
  assert.throws(() => __test.validatePeriod('2026', '8', now), /완료되지 않은 월/);
});

test('buildUrl keeps an encoded service key from being double encoded', () => {
  const url = __test.buildUrl('abc%2Fdef%3D', { year: 2026, month: 7 }, { hmmdImpSeNm: '국산' });
  assert.match(url, /serviceKey=abc%2Fdef%3D&/);
  assert.doesNotMatch(url, /%252F/);
  assert.match(url, /registYy=2026/);
  assert.match(url, /registMt=07/);
});

test('computes period shifts and month-over-month changes', () => {
  assert.deepEqual(__test.shiftPeriod({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  assert.equal(__test.pctChange(110, 100), 10);
  assert.equal(__test.pctChange(1, 0), null);
});
