const test=require('node:test'),assert=require('node:assert/strict');
const {inspectSnapshot,snapshotFingerprint,reconcileSnapshot,publicationDue}=require('../scripts/review-research-snapshots.cjs');
test('changed snapshots retain historical audit links and official-source dates',()=>{
 const date='2026-10-17T00:00:00Z',old={sourceStatDate:'2026101724',articles:[{articleId:1,views:4}]};
 const entry={checkedAt:date,reviewStatus:'verified',source:{verification:'verified'},issues:[],verifiedDataHash:snapshotFingerprint(old),evidence:[{kind:'official-source',url:'https://apis.naver.com/',checkedAt:date},{kind:'audit-record',url:'/research/source-reviews/old.json',checkedAt:date}]};
 reconcileSnapshot(entry,'/naver-cafe-research/',{...old,articles:[{articleId:1,views:8}]},'2026-10-21T00:00:00Z','https://www.stargateedu.co.kr/naver-cafe-research/data/latest.json');
 assert.equal(entry.reviewStatus,'snapshot_checked');assert.equal(entry.previousVerification.checkedAt,date);assert.equal(entry.evidence.find(e=>e.kind==='official-source').checkedAt,date);assert.ok(entry.evidence.some(e=>e.kind==='audit-record'));
});
test('unchanged verified snapshots retain their already recorded check date',()=>{
 const data={latestYm:'2026-09',countryLatestYm:'2026-09',series:[{exp:3,imp:1,bal:2}]},date='2026-10-17T00:00:00Z';
 const entry={checkedAt:date,reviewStatus:'verified',verifiedDataHash:snapshotFingerprint(data),source:{verification:'verified'},issues:[],evidence:[]};
 reconcileSnapshot(entry,'/trade/',data,'2026-10-21T00:00:00Z','https://www.stargateedu.co.kr/trade/data.json');assert.equal(entry.checkedAt,date);
});
test('trend rows and listing candidate scores invalidate a previous version without inventing a date',()=>{
 for(const [key,data,next] of [['/google-trends/',{items:[{title:'A',volume:1}]},{items:[{title:'A',volume:2}]}],['/airbnb/',{candidates:[{id:1,score:80}]},{candidates:[{id:1,score:75}]}]]){
  assert.notEqual(snapshotFingerprint(data),snapshotFingerprint(next));const entry={checkedAt:'2026-10-17T00:00:00Z',reviewStatus:'verified',verifiedDataHash:snapshotFingerprint(data),source:{verification:'verified'},issues:[],evidence:[]};
  reconcileSnapshot(entry,key,next,'2026-10-21T00:00:00Z','https://www.stargateedu.co.kr/');assert.equal(entry.reviewStatus,'snapshot_checked');assert.equal(entry.dataAsOf,null);
 }
});
test('Korean calendar dates and publication gates handle UTC day boundaries',()=>{
 const data={nextPublication:{scheduledAt:'2026-10-26'}};assert.equal(publicationDue(data,'2026-10-25T14:59:59Z'),false);assert.equal(publicationDue(data,'2026-10-25T15:00:00Z'),true);
 const airport=inspectSnapshot('/research/airport-congestion/',{forecast_dates:{today:'20261021'},generated_at:'2026-10-20T22:00:00Z'},'2026-10-20T23:00:00Z');assert.equal(airport.dataAsOf,'2026-10-21');
 assert.throws(()=>inspectSnapshot('/research/airport-congestion/',{forecast_dates:{today:'20261022'}},'2026-10-20T23:00:00Z'),/Future date/);
});
