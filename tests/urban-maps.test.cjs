const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),json=p=>JSON.parse(read(p));
const {validateCollection,chooseCollection}=require('../assets/election-boundaries.js');
const cities=['pyeongtaek','hwaseong','suwon','seongnam'];
for(const city of cities)test(`${city}: complete consistent layer only; partial APIs never mix with cache`,()=>{
 const d=json(`${city}-election/data/districts.json`),fc=json(`${city}-election/data/emd.geojson`),mapping=Object.fromEntries(Object.entries(d.districts).flatMap(([k,v])=>v.emd.map(n=>[n,k])));
 assert.ok(validateCollection(fc,mapping));
 const partial={...fc,features:fc.features.slice(1)};assert.equal(chooseCollection(partial,fc,mapping).sourceMode,'cache');assert.equal(chooseCollection(partial,fc,mapping).features.length,fc.features.length);
 const duplicate={...fc,features:[fc.features[0],...fc.features.slice(0,-1)]};assert.equal(validateCollection(duplicate,mapping),false);
 const wrongCode=structuredClone(fc);wrongCode.features[0].properties.emd_cd='41220101';assert.equal(validateCollection(wrongCode,mapping),false);
 const wrongDistrict=structuredClone(fc);wrongDistrict.features[0].properties.district='unverified';assert.equal(validateCollection(wrongDistrict,mapping),false);
 const badRing=structuredClone(fc);badRing.features[0].geometry={type:'Polygon',coordinates:[[[127,37],[128,37],[128,38],[126,38]]]};assert.equal(validateCollection(badRing,mapping),false);
 assert.throws(()=>chooseCollection(partial,null,mapping),/unavailable/);assert.equal(chooseCollection(fc,null,mapping).sourceMode,'api');
 const html=read(`${city}-election/index.html`),inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');new vm.Script(inline);
 const config=inline.slice(inline.indexOf('const DISTRICTS ='),inline.indexOf('const el ='));const ctx=vm.createContext({});vm.runInContext(config+';globalThis.map=nameToDistrict;',ctx);assert.deepEqual(JSON.parse(JSON.stringify(ctx.map)),mapping);
 assert.match(html,/原資料|원자료 버전/);assert.doesNotMatch(html,/mergeBoundaries/);
 const meta=json(`${city}-election/data/source-review.json`);assert.equal(meta.boundary.sourceVersion,null);assert.equal(meta.basis.monthlyBasisApplicable,false);assert.deepEqual(meta.boundary.coverageCheck.apiCodeLengths,[8]);
});
test('published tables, map arrays and downloads reconcile to source aggregates without invented months',()=>{
 for(const [region,total,n] of [['seoul',25507,25],['gyeonggi',39150,31]]){
  const d=json(`data/academy/${region}.json`);assert.equal(d.totals.total,total);assert.equal(d.districts.length,n);
  for(const k of ['academyCount','teachingRoomCount','total'])assert.equal(d.districts.reduce((sum,g)=>sum+g[k],0),d.totals[k]);
  const html=read(`${region}-academy-map/index.html`);for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
  const counts=JSON.parse(html.match(/const counts=(\{.*?\});/)[1]);assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),total);assert.equal(Object.keys(counts).length,n);
  assert.equal((read(`data/academy/${region}.csv`).trim().split('\n')).length,n+1);assert.match(html,/2013/);assert.match(html,/download/);
  assert.ok(d.districts.every(r=>Object.keys(r).every(k=>['name','academyCount','teachingRoomCount','total'].includes(k))));
 }
 const s=json('data/academy/seoul.json');assert.equal(s.dataAsOf,null);assert.equal(s.dataPeriod,null);assert.equal(s.sourceLatestRowLoadedAt,'2026-10-11');assert.equal(s.validation.districtsRecoveredFromRoadAddress,43);
 const g=json('data/academy/gyeonggi.json');assert.equal(g.dataAsOf,'2026-09-30');assert.equal(g.validation.inputRows,g.validation.duplicateCourseRows+g.totals.total);assert.equal(g.validation.correctedAddressPrefixRows,4);
 assert.equal(json('data/academy/seoul-legacy-model.json').verified,false);
 const cap=read('sudogwon-academy-map/index.html');for(const [name,total] of [['seoul',25507],['gg',39150]])assert.equal(Object.values(JSON.parse(cap.match(new RegExp('const '+name+'=(\\{.*?\\});'))[1])).reduce((a,b)=>a+b,0),total);
});
