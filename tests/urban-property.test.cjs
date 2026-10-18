const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const {validateMonthly,joinDistricts}=require('../assets/property-quality.js');
const {readChanges,applyChanges}=require('../court-auction/source-status.cjs');
test('latest data month is not assumed to be the current or an incomplete calendar month',()=>{
 const d={months:['2026-06','2026-07'],types:['아파트'],series:{아파트:[10,11]},total:[10,11],meta:{partialMonths:[]}};
 assert.equal(validateMonthly(d).referenceIndex,1);d.meta.partialMonths=['2026-07'];assert.equal(validateMonthly(d).referenceIndex,0);
 const wrong=structuredClone(d);wrong.total[0]=9;assert.throws(()=>validateMonthly(wrong),/합계/);
 wrong.total[0]=10;wrong.series.아파트[0]=null;assert.throws(()=>validateMonthly(wrong),/거래량/);
});
test('published price and monthly aggregates reconcile without treating sample counts as transaction counts',()=>{
 const d=json('assets/seoul_monthly_type.json'),p=json('assets/gu_prices.json'),geo=json('assets/seoul_gu.json');
 assert.equal(validateMonthly(d).referenceIndex,d.months.indexOf('2026-09'));assert.equal(d.total[d.months.indexOf('2026-09')],6534);assert.equal(d.total.at(-1),1481);assert.equal(d.months.length,22);
 assert.equal(d.total.reduce((a,b)=>a+b),d.meta.validation.includedRows);
 assert.equal(d.meta.validation.inputRows,d.meta.validation.includedRows+d.meta.validation.cancelledRows+d.meta.validation.outsideContractYears);
 assert.equal(d.meta.validation.identicalValueExtraRowsRetained,3702);assert.deepEqual(d.meta.certifiedCompleteMonths,[]);
 assert.ok(joinDistricts(geo.features,p.districts));assert.equal(p.meta.boundaryVersion,'2013');
 assert.equal(Object.values(p.districts).reduce((a,r)=>a+r.vol,0),d.months.reduce((a,m,i)=>a+(m.startsWith('2026')?d.series.아파트[i]:0),0));
 const bad=structuredClone(p.districts);bad['Gangnam-gu'].price=null;assert.throws(()=>joinDistricts(geo.features,bad),/조인/);delete bad['Gangnam-gu'];assert.throws(()=>joinDistricts(geo.features,bad),/범위/);
});
test('withdrawal identity includes court, sale date, case and item; it wins over correction',()=>{
 const record={법원코드:'B000210',매각기일:'2026-10-20',사건번호:'2025타경1',물건번호:'1',비고:''};
 const source={data:{result:{inputData:{cortOfcCd:'B000210',dspslDxdyYmd:'20261020'},rtrcnPbancLst:[{csNo:'<b>2025타경1</b>',dspslSeq:1}],crrctPbancLst:[{csNo:'2025타경1',dspslSeq:1,crrctPbancCtt:'withdrawn correction'},{csNo:'2025타경2',dspslSeq:1,crrctPbancCtt:'가격 정정'}]}}};
 const result=applyChanges([record,{...record,사건번호:'2025타경2'},{...record,법원코드:'B000211'},{...record,매각기일:'2026-10-21'},{...record,물건번호:'2'}],readChanges(source));
 assert.equal(result.excluded,1);assert.equal(result.records.length,4);assert.equal(result.corrected,1);assert.match(result.records[0].비고,/가격 정정/);
 assert.throws(()=>readChanges({data:{result:{inputData:{}}}}),/missing/);
});
test('court output excludes withdrawals and declares returned coverage; pages parse',()=>{
 let count=0;const keys=new Set();for(const f of ['data.json','data_commercial.json']){
  const d=json('court-auction/'+f);assert.equal(d.meta.withdrawnExcluded,7);assert.equal(d.meta.partial,true);assert.deepEqual(d.meta.courts,['서울중앙지방법원']);assert.match(d.meta.coverage,/전수 미확인/);assert.equal(d.meta.count,d.records.length);
  for(const r of d.records){const key=[r.법원코드,r.매각기일,r.사건번호,r.물건번호].join(':');assert.ok(!keys.has(key));keys.add(key);assert.ok(r.최저매각가>=0&&r.감정가>0);}count+=d.records.length;
 }assert.equal(count,195);
 for(const f of ['volume/index.html','choropleth/index.html']){const html=fs.readFileSync(path.join(root,f),'utf8');for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);assert.match(html,/download/);assert.doesNotMatch(html,/月間|月間自動|月間自動更新/);}
});
