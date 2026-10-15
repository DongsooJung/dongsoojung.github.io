import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const origin='https://stargate.stargate8225.workers.dev';
const key=request=>new URL(typeof request==='string'?request:request.url,origin).href;

function serviceWorker() {
  const handlers=new Map(),stores=new Map(),calls={fetch:[],put:[],match:[],claims:0};
  let offline=false,response=new Response('public page');
  function store(name){if(!stores.has(name))stores.set(name,new Map());return stores.get(name)}
  const caches={
    keys:async()=>[...stores.keys()],
    delete:async name=>stores.delete(name),
    open:async name=>({
      keys:async()=>[...store(name).keys()].map(url=>({url})),
      delete:async request=>store(name).delete(key(request)),
      put:async(request,value)=>{calls.put.push(key(request));store(name).set(key(request),value)},
      addAll:async paths=>paths.forEach(path=>store(name).set(key(path),new Response('offline fallback'))),
    }),
    match:async request=>{calls.match.push(key(request));for(const values of stores.values()){const value=values.get(key(request));if(value)return value.clone()}},
  };
  runInNewContext(source,{
    URL,caches,
    self:{location:{origin},addEventListener:(name,handler)=>handlers.set(name,handler),skipWaiting(){},clients:{claim:()=>{calls.claims++}}},
    fetch:async(request,options)=>{calls.fetch.push({url:key(request),options});if(offline)throw new Error('offline');return response.clone()},
  });
  return {
    stores,calls,seed:(name,path,text)=>store(name).set(key(path),new Response(text)),
    offline:()=>{offline=true},respond:value=>{response=value},
    async activate(){const waits=[];handlers.get('activate')({waitUntil:value=>waits.push(value)});await Promise.all(waits)},
    async fetch(path,mode='same-origin'){
      let result;
      handlers.get('fetch')({request:{url:key(path),method:'GET',mode},respondWith:value=>{result=value}});
      const resolved=await result;
      await new Promise(resolve=>setImmediate(resolve));
      return resolved;
    },
  };
}

test('admin requests use the network without reading or writing cached private pages',async()=>{
  for(const path of ['/admin','/admin/visitors/','/%61dmin/visitors/','/ad%6din/visitors/','/admin%2Fvisitors/','/%2561dmin/visitors/','/ADMIN//visitors/','/api/admin/analytics/get_site_visit_stats']){
    const worker=serviceWorker();
    worker.seed('stargate-v7',path,'old private content');
    worker.respond(new Response('authentication required',{status:401}));
    const response=await worker.fetch(path);
    assert.equal(response.status,401);
    assert.equal(worker.calls.fetch[0].options.cache,'no-store');
    assert.deepEqual(worker.calls.match,[]);
    assert.deepEqual(worker.calls.put,[]);
    worker.offline();
    await assert.rejects(worker.fetch(path),/offline/);
    assert.deepEqual(worker.calls.match,[],'private requests must never fall back to old CacheStorage');
  }
});

test('private and no-store response directives prevent public-path CacheStorage writes',async()=>{
  for(const cacheControl of ['no-store','public, no-store, max-age=0','PRIVATE','private="Set-Cookie", max-age=60']){
    const worker=serviceWorker();
    worker.respond(new Response('uncached content',{headers:{'Cache-Control':cacheControl}}));
    const response=await worker.fetch('/some-page/');
    assert.equal(await response.text(),'uncached content');
    assert.deepEqual(worker.calls.put,[],cacheControl);
  }
});

test('activation deletes old versions and private aliases retained in the current cache',async()=>{
  const worker=serviceWorker();
  worker.seed('stargate-v7','/admin/visitors/','old private content');
  worker.seed('stargate-v8','/%61dmin/visitors/','private alias');
  worker.seed('stargate-v8','/api/admin/analytics/get_site_visit_stats','private API');
  worker.seed('stargate-v8','/api/dashboards/status','stale dynamic API');
  worker.seed('stargate-v8','https://external.example/data.json','external data');
  worker.seed('stargate-v8','/offline.html','public offline page');
  await worker.activate();
  assert.equal(worker.stores.has('stargate-v7'),false);
  assert.deepEqual([...worker.stores.get('stargate-v8').keys()],[key('/offline.html')]);
  assert.equal(worker.calls.claims,1);
});

test('dynamic APIs and cross-origin resources never use cached successful responses as offline data',async()=>{
  for(const path of ['/api/dashboards/status','/api/dashboards/trade','https://external.example/data.json']){
    const worker=serviceWorker();
    worker.seed('stargate-v8',path,'stale successful data');
    worker.respond(new Response('fresh network data'));
    assert.equal(await(await worker.fetch(path)).text(),'fresh network data');
    assert.deepEqual(worker.calls.put,[]);
    worker.offline();
    await assert.rejects(worker.fetch(path),/offline/);
    assert.deepEqual(worker.calls.match,[]);
  }
});

test('public network-first pages and offline navigation fallback remain available',async()=>{
  const worker=serviceWorker();
  worker.seed('stargate-v8','/offline.html','offline page');
  worker.respond(new Response('fresh public page',{headers:{'Cache-Control':'public, max-age=600'}}));
  assert.equal(await (await worker.fetch('/research/')).text(),'fresh public page');
  assert.deepEqual(worker.calls.put,[key('/research/')]);
  worker.offline();
  assert.equal(await (await worker.fetch('/research/')).text(),'fresh public page');
  assert.equal(await (await worker.fetch('/uncached-page/','navigate')).text(),'offline page');
});
