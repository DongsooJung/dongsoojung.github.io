import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, formatReport, loadManifest } from '../scripts/check-data-freshness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const now = Date.parse('2026-11-26T09:30:00Z');
const hoursAgo = (hours) => Math.floor((now - hours * 3600000) / 1000);

test('manifest entries point at real paths and workflows', () => {
  const { items } = loadManifest();
  assert.ok(items.length >= 10);
  assert.equal(new Set(items.map((item) => item.path)).size, items.length, 'duplicate path');
  for (const item of items) {
    assert.ok(existsSync(join(root, item.path)), `missing data path: ${item.path}`);
    assert.ok(existsSync(join(root, '.github', 'workflows', item.workflow)), `missing workflow: ${item.workflow}`);
  }
});

test('a path is stale only after its own limit and missing history is never treated as fresh', () => {
  const items = [
    { path: 'a.json', maxAgeHours: 24, workflow: 'a.yml' },
    { path: 'b.json', maxAgeHours: 24, workflow: 'b.yml' },
    { path: 'c.json', maxAgeHours: 168, workflow: 'c.yml' },
    { path: 'd.json', maxAgeHours: 24, workflow: 'd.yml' },
  ];
  const ages = { 'a.json': hoursAgo(23.9), 'b.json': hoursAgo(24.1), 'c.json': hoursAgo(100), 'd.json': null };
  const results = evaluate(items, (path) => ages[path], now);
  assert.deepEqual(results.map((r) => r.status), ['fresh', 'stale', 'fresh', 'missing']);
  assert.equal(results[1].ageHours, 24.1);
  assert.equal(results[3].lastCommit, null);
  const report = formatReport(results);
  assert.match(report, /\| STALE \| `b\.json` \| 24\.1h \| 24h \|/);
  assert.match(report, /\| MISSING \| `d\.json` \| no commit in fetched history \|/);
});

test('the nine-day stall of 2026-11-17 would have been reported on the first day', () => {
  const stalledAt = Date.parse('2026-11-17T11:26:16Z') / 1000;
  const item = { path: 'research/airport-congestion/data/latest.json', maxAgeHours: 24, workflow: 'update-airport-congestion.yml' };
  const dayOne = evaluate([item], () => stalledAt, Date.parse('2026-11-18T11:30:00Z'));
  assert.equal(dayOne[0].status, 'stale');
});

test('a shallow-clone boundary commit is never read as a fresh snapshot', () => {
  const item = { path: 'a.json', maxAgeHours: 168, workflow: 'a.yml' };
  // The clone only reaches back two hours, so the boundary commit says nothing about freshness.
  const tooShallow = evaluate([item], () => ({ seconds: hoursAgo(2), boundary: true }), now);
  assert.equal(tooShallow[0].status, 'unknown');
  assert.match(formatReport(tooShallow), /\| UNKNOWN \| `a\.json` \| at least 2h \(history too shallow\) \|/);
  // A boundary older than the limit already proves staleness.
  const provenStale = evaluate([item], () => ({ seconds: hoursAgo(500), boundary: true }), now);
  assert.equal(provenStale[0].status, 'stale');
  // A real commit within the limit is fresh.
  const real = evaluate([item], () => ({ seconds: hoursAgo(2), boundary: false }), now);
  assert.equal(real[0].status, 'fresh');
});
