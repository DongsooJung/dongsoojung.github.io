import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { __test } from '../server/api/airport-congestion.js';

function forecastTable(columnCount) {
  const rows = Array.from({ length: 24 }, (_, hour) => {
    const time = `${String(hour).padStart(2, '0')}~${String((hour + 1) % 24).padStart(2, '0')}시`;
    const cells = Array.from({ length: columnCount }, (_, index) => `<td>${hour * 100 + index + 1}</td>`).join('');
    return `<tr><th>${time}</th>${cells}</tr>`;
  }).join('');
  return `<table id="userEx"><tbody>${rows}</tbody></table>`;
}

test('parses 24 hourly rows for both terminals and merges them', () => {
  const t1 = __test.parseForecastHtml(forecastTable(11), 'T1');
  const t2 = __test.parseForecastHtml(forecastTable(6), 'T2');
  const merged = __test.mergeTerminalRows(t1, t2);
  assert.equal(merged.length, 24);
  assert.equal(merged[0].t1sumset2, 11);
  assert.equal(merged[0].t2sumset2, 6);
  assert.equal(merged[23].atime, '23_00');
});

test('rejects incomplete forecasts', () => {
  assert.throws(() => __test.parseForecastHtml('<table id="userEx"></table>', 'T1'), /table was not found/);
});

test('marks data stale only after 20 minutes', () => {
  const snapshot = { generated_at: '2026-08-29T08:00:00.000Z' };
  assert.deepEqual(__test.freshness(snapshot, Date.parse('2026-08-29T08:20:00.000Z')), {
    age_minutes: 20, stale_after_minutes: 20, stale: false,
  });
  assert.equal(__test.freshness(snapshot, Date.parse('2026-08-29T08:21:00.000Z')).stale, true);
});

test('validates snapshot contract', () => {
  const valid = {
    status: 'ok', forecast: { today: Array(24).fill({}), tomorrow: Array(24).fill({}) }, waiting: [{}],
  };
  assert.equal(__test.validateSnapshot(valid), valid);
  assert.throws(() => __test.validateSnapshot({ ...valid, waiting: [] }), /waiting data is empty/);
});

test('serves the static last-good snapshot when live collection fails', async () => {
  const originalFetch = globalThis.fetch;
  const fallback = {
    status: 'ok',
    generated_at: new Date().toISOString(),
    forecast: { today: Array(24).fill({}), tomorrow: Array(24).fill({}) },
    waiting: [{}],
  };
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://www.stargateedu.co.kr/')) {
      return { ok: true, json: async () => fallback };
    }
    throw new Error('simulated upstream outage');
  };
  let statusCode;
  let body;
  const response = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; },
    end() { return this; },
  };
  try {
    await handler({ method: 'GET', query: {} }, response);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(statusCode, 200);
  assert.equal(body.delivery.mode, 'static_fallback');
  assert.equal(body.delivery.fallback, true);
});
