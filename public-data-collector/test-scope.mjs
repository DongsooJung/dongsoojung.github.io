import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler, {__test as server} from '../api/public-data-collector.js';

const sandbox={Intl,Date,URLSearchParams,setTimeout:fn=>fn(),localStorage:{getItem:()=>''}};
vm.runInNewContext(fs.readFileSync(new URL('./collector.js',import.meta.url),'utf8'),sandbox);
const browser=sandbox.StargatePublicDataCollector;
const payload=(items,totalCount)=>JSON.stringify({response:{header:{resultCode:'00'},body:{items:{item:items},...(totalCount===undefined?{}:{totalCount})}}});
for(const [name,collector] of [['browser',browser],['server',server]]){
 test(name+' rejects HTML and unrelated JSON instead of successful zero rows',()=>{
  for(const text of ['<!doctype html><html>blocked</html>','<html>login</html>','{}','null','{"error":"denied"}'])assert.throws(()=>collector.parseResponse(text));
 });
 test(name+' distinguishes an unknown source total from a reported zero',()=>{
  assert.equal(collector.parseResponse(payload([],undefined)).totalCount,null);
  assert.equal(collector.parseResponse(payload([],0)).totalCount,0);
  assert.equal(collector.parseResponse('[]').totalCount,null);
 });
 test(name+' marks a page-capped collection partial, and only matching totals complete',async()=>{
  const original=globalThis.fetch,api={url:'https://example.invalid/data',params:{DEAL_YMD:'202609'},maxPages:1,rowsPerPage:2};
  try{
   for(const [items,total,complete,termination] of [[[{},{}],5,false,'page_limit'],[[{},{}],2,true,'reported_total_reached'],[[{}],undefined,false,'short_page'],[[],0,true,'empty_page']]){
    let calls=0;const fake=async()=>{calls++;return {ok:true,status:200,text:async()=>payload(items,total)}};sandbox.fetch=fake;globalThis.fetch=fake;
    const result=await (name==='browser'?collector.paginate(api,'test-key'):collector.paginate(api,{},'test-key'));
    assert.equal(result.coverage.complete,complete);assert.equal(result.coverage.termination,termination);assert.equal(result.coverage.pagesFetched,1);assert.equal(calls,1);assert.equal(result.params.DEAL_YMD,'202609');
   }
  }finally{globalThis.fetch=original;}
 });
}
test('browser read-only collection preserves period, BOM and manifest fields without a storage write',async()=>{
 const methods=[];sandbox.fetch=async(url,options)=>{methods.push(options?.method||'GET');assert.ok(url.startsWith('https://apis.data.go.kr/'));return{ok:true,status:200,text:async()=>payload([{dealYear:2026,dealMonth:9}],1)}};
 const result=await browser.collect({apis:['apt_trade'],apiKey:'test-key',saveToSupabase:false});
 assert.deepEqual(methods,['GET']);assert.equal(result.savedToSupabase,false);assert.ok(result.results[0].csv.startsWith('\uFEFF'));assert.equal(result.results[0].dataReference.kind,'contract_month');assert.ok(result.results[0].collectedAt);assert.equal(result.results[0].collectorVersion,'20261106-scope-v1');
});
test('server read-only error and success paths never write Supabase',async()=>{
 const originalFetch=globalThis.fetch,old=process.env.DATA_GO_KR_API_KEY,storage=process.env.SUPABASE_ANON_KEY;
 process.env.DATA_GO_KR_API_KEY='test-key';process.env.SUPABASE_ANON_KEY='test-anon';
 try{for(const body of [payload([{value:1}],1),'<html>blocked</html>']){
  const calls=[];globalThis.fetch=async(url,options)=>{calls.push(options?.method||'GET');assert.ok(url.startsWith('https://apis.data.go.kr/'));return{ok:true,status:200,text:async()=>body}};
  const res={setHeader(){},status(){return this},json(x){this.body=x;return this}};
  await handler({method:'POST',headers:{},body:{apis:['apt_trade'],saveToSupabase:false}},res);
  assert.deepEqual(calls,['GET']);assert.equal(res.body.savedToSupabase,false);
  assert.equal(res.body.results[0].ok,!body.startsWith('<html>'));
 }}finally{globalThis.fetch=originalFetch;for(const [key,value]of [['DATA_GO_KR_API_KEY',old],['SUPABASE_ANON_KEY',storage]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
