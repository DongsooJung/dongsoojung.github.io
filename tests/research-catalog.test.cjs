const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {inspectSnapshot}=require('../scripts/review-research-snapshots.cjs');
const catalog=JSON.parse(fs.readFileSync(require.resolve('../research/data-catalog.json'),'utf8'));
test('the catalog covers all projects once and does not call snapshot checks original-source verification',()=>{
 assert.equal(catalog.projects.length,63);
 assert.equal(new Set(catalog.projects.map(p=>p.key)).size,63);
 for(const p of catalog.projects){
  assert.ok(['urban','society','research','education','operations'].includes(p.primary));
  if(p.reviewStatus==='verified')assert.ok(p.evidence.some(e=>e.kind==='official-source'));
  if(p.checkedAt)assert.ok(p.evidence.length>0);
  if(p.source.url)assert.equal(new URL(p.source.url).protocol,'https:');
 }
 const plan=JSON.parse(fs.readFileSync(require.resolve('../research/refresh-plan.json'),'utf8'));
 assert.equal(plan.intervalMinutes,10);
 const queued=plan.steps.flatMap(s=>s.keys||[]);
 assert.equal(new Set(queued).size,63);
 assert.equal(queued.length,63);
});
test('a collection or file-update date never becomes a data period',()=>{
 const result=inspectSnapshot('/exchange-rate/',{updatedAt:'2026-10-16',observedAt:'2026-08-31',series:[{ym:'2026-08'}]},'2026-10-16T10:00:00Z');
 assert.equal(result.dataPeriod,'2026-08');assert.equal(result.collectedAt,null);
 assert.equal(result.snapshotUpdatedAt,'2026-10-16');
 assert.equal(result.freshness,'older_than_target');
 const gimpo=inspectSnapshot('/research/gimpo-airport-congestion/',{generated_at:'2026-10-16T09:00:00Z',observed_at:'18:00'},'2026-10-16T10:00:00Z');
 assert.equal(gimpo.dataAsOf,null);assert.equal(gimpo.dataPeriod,null);
 assert.throws(()=>inspectSnapshot('/exchange-rate/',{observedAt:'2026-11-01'},'2026-10-16T10:00:00Z'),/Future/);
 assert.throws(()=>inspectSnapshot('/korea-tourism/',{series:[{ym:'2026-11'}]},'2026-10-16T10:00:00Z'),/Future data period/);
});
test('mixed trade coverage and arithmetic inconsistencies require review',()=>{
 const p=inspectSnapshot('/trade/',{latestYm:'2026-09',countryLatestYm:'2026-06',series:[{exp:121052,imp:71074,bal:49965}]},'2026-10-16T10:00:00Z');
 assert.equal(p.reviewStatus,'needs_review');
 assert.ok(p.issues.some(i=>i.includes('국가별 기준 2026-06')));
 assert.ok(p.issues.some(i=>i.includes('일치하지 않아')));
});
