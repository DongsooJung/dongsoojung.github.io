import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../strategy/ai-financials/data.json', import.meta.url), 'utf8'));
const numericKeys = ['revenue','operatingIncome','netIncome','totalAssets','totalLiabilities','totalEquity','cashAndEquivalents','operatingCashFlow','capex'];
const sources = new Map(data.sources.map(source => [source.id, source]));

test('ten operators preserve complete quarters, missing values, sources and cutoff', () => {
  assert.equal(data.companies.length, 10);
  assert.equal(new Set(data.companies.map(c => c.id)).size, 10);
  assert.equal(sources.size, data.sources.length);
  for (const source of sources.values()) {
    assert.equal(new URL(source.url).protocol, 'https:');
    if (source.publishedAt) assert.ok(source.publishedAt <= data.asOf, source.id);
  }
  for (const company of data.companies) {
    assert.equal(company.quarters.length, 12, company.id);
    assert.equal(new Set(company.quarters.map(q => q.quarter)).size, 12);
    for (const quarter of company.quarters) {
      for (const id of quarter.sourceIds) assert.ok(sources.has(id), `${company.id} ${id}`);
      for (const key of numericKeys) {
        assert.ok(quarter[key] === null || Number.isFinite(quarter[key]), `${company.id} ${quarter.quarter} ${key}`);
        if (quarter[key] !== null) {
          assert.equal(quarter.status, 'reported');
          assert.ok(quarter.sourceIds.length, 'A financial value needs an official source');
        }
      }
      if (quarter.periodEnd) assert.ok(quarter.periodEnd <= data.asOf);
      if (quarter.status !== 'reported') assert.ok(numericKeys.every(key => quarter[key] === null));
      if (quarter.quarter === '2026Q4') assert.equal(quarter.status, 'future');
      if ([quarter.totalAssets,quarter.totalLiabilities,quarter.totalEquity].every(Number.isFinite)) {
        const balance = quarter.totalLiabilities + quarter.totalEquity + (quarter.redeemablePreferredStock || 0);
        assert.ok(Math.abs(quarter.totalAssets - balance) < .001, `${company.id} ${quarter.quarter} balance identity`);
      }
    }
    for (const highlight of company.highlights) {
      assert.ok(highlight.date <= data.asOf);
      assert.ok(highlight.sourceIds.length);
      highlight.sourceIds.forEach(id => assert.ok(sources.has(id)));
    }
  }
});

test('derived SEC quarters retain matched annual starts and exact arithmetic', () => {
  for (const company of data.companies) for (const quarter of company.quarters) {
    for (const [key, metric] of Object.entries(quarter.provenance || {})) {
      metric.sources.forEach(source => assert.ok(source.filed <= data.asOf));
      assert.equal(quarter[key], metric.value);
      if (metric.method === 'derived_ytd_difference') {
        const [later,earlier] = metric.sources;
        assert.equal(later.periodStart, earlier.periodStart);
        assert.equal(later.tag, earlier.tag);
        assert.ok(later.periodEnd > earlier.periodEnd);
        assert.equal(metric.value, (later.valueUsd - earlier.valueUsd) / 1e6);
      }
    }
  }
});

test('fiscal dates and SpaceX restatement scope remain explicit', () => {
  const microsoft = data.companies.find(c => c.id === 'microsoft');
  assert.equal(microsoft.quarters.find(q => q.quarter === '2024Q1').fiscalQuarter, 'FY2024Q3');
  const adobe = data.companies.find(c => c.id === 'adobe');
  assert.equal(adobe.quarters.find(q => q.quarter === '2026Q3').periodEnd, '2026-08-28');
  const grok = data.companies.find(c => c.id === 'xai');
  const q1 = grok.quarters.find(q => q.quarter === '2026Q1');
  assert.equal(q1.reportingScope, 'parent_consolidated');
  assert.equal(q1.redeemablePreferredStock, 7049);
  assert.equal(grok.quarters.find(q => q.quarter === '2026Q2').operatingCashFlow, 2419);
  assert.ok(data.companies.find(c => c.id === 'cursor').quarters.every(q => q.revenue === null));
});
