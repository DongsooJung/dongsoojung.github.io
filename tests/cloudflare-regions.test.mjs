import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AnalyticsStore,coarseRegion} from '../cloudflare/analytics.mjs';
const now=Date.parse('2026-10-29T05:00:00Z');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function database(){
 const db=new DatabaseSync(':memory:');
 const storage={sql:{exec(sql,...args){if(sql.includes('CREATE TABLE')){db.exec(sql);return {toArray:()=>[]}}const rows=db.prepare(sql).all(...args).map(row=>({...row}));return {toArray:()=>rows}}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};
 return {db,store:new AnalyticsStore(storage,now),storage};
}
const event=(n,type='click')=>({p_event_id:uid(n),p_visitor_id:uid(10),p_session_id:uid(20),p_event_type:type,p_page_path:'/',p_country:'US',p_region:'Spoofed'});
test('trusted coarse geography, retries, unknown coverage and click shares',()=>{
 const {db,store,storage}=database();
 store.call('record_site_usage_event',event(1),now,{country:'KR',region:'Seoul',ip:'203.0.113.1',city:'private'});
 store.call('record_site_usage_event',event(1),now,{country:'US',region:'California'});
 store.call('record_site_usage_event',event(2),now,{country:'KR',region:'Seoul'});
 store.call('record_site_usage_event',event(3),now,{country:'US',region:'California'});
 store.call('record_site_usage_event',event(4),now);
 store.call('record_site_usage_event',event(5,'page_view'),now,{country:'US',region:'California'});
 const r=store.call('get_site_region_stats',{p_days:30},now);
 assert.equal(r.total_clicks,4);assert.equal(r.located_clicks,3);assert.equal(r.unknown_clicks,1);
 assert.deepEqual(r.regions,[{country:'KR',region:'Seoul',clicks:2,share:50},{country:'US',region:'California',clicks:1,share:25}]);
 assert.ok(!JSON.stringify(r).includes('visitor_id'));assert.ok(!JSON.stringify(r).includes('203.0.113.1'));assert.ok(!JSON.stringify(r).includes('Spoofed'));
 const cols=db.prepare('PRAGMA table_info(event_regions)').all().map(r=>r.name);assert.deepEqual(cols,['event_id','country','region']);
 assert.equal(new AnalyticsStore(storage,now+86400000).regionStartedAt,r.started_at);
 store.prune(now+91*86400000);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM event_regions').get().n,0);
 db.close();
});
test('missing/bot geography stays unknown; values are bounded and validated',()=>{
 assert.deepEqual(coarseRegion({country:'T1',region:'Tor'}),{country:null,region:null});
 assert.deepEqual(coarseRegion({country:'XX',region:'Unknown'}),{country:null,region:null});
 assert.deepEqual(coarseRegion({country:'KR',region:'Seoul\n'}),{country:'KR',region:'Seoul'});
 assert.equal(coarseRegion({country:'KR',region:'x'.repeat(100)}).region.length,80);
 const {db,store}=database();assert.throws(()=>store.call('get_site_region_stats',{p_days:91},now));db.close();
});
