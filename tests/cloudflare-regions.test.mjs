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
 assert.deepEqual(store.call('get_site_region_summary',{p_days:30},now),r);
 assert.equal(r.total_clicks,4);assert.equal(r.located_clicks,3);assert.equal(r.unknown_clicks,1);
 assert.deepEqual(r.regions,[{country:'KR',region:'Seoul',clicks:2,share:50},{country:'US',region:'California',clicks:1,share:25}]);
 assert.ok(!JSON.stringify(r).includes('visitor_id'));assert.ok(!JSON.stringify(r).includes('203.0.113.1'));assert.ok(!JSON.stringify(r).includes('Spoofed'));
 const cols=db.prepare('PRAGMA table_info(event_regions)').all().map(r=>r.name);assert.deepEqual(cols,['event_id','country','region','district_code']);
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


test('district codes and hourly counts are aggregated without coordinates, raw IPs, or visitor records',()=>{
 const {db,store}=database();
 const geo={country:'KR',region:'Seoul',latitude:'37.5172',longitude:'127.0473',ip:'203.0.113.77'};
 const resolved=coarseRegion(geo);assert.equal(resolved.district_code,'11680');
 assert.ok(!('latitude' in resolved));assert.ok(!('longitude' in resolved));assert.ok(!('ip' in resolved));
 store.call('record_site_usage_event',event(201),now,geo);store.call('record_site_usage_event',event(201),now,geo);
 store.call('record_site_usage_event',event(202),now,{country:'KR',region:'Seoul'});
 const summary=store.call('get_site_region_summary',{p_days:30},now);
 assert.equal(summary.precision,'ip-estimated-sigungu');assert.equal(summary.district_resolved_clicks,1);assert.equal(summary.district_unknown_clicks,1);
 assert.equal(summary.districts[0].name,'강남구');assert.equal(summary.districts[0].share,50);
 assert.deepEqual(summary.hourly,[{hour:14,clicks:2}]);
 for(const key of ['203.0.113.77','latitude','longitude','visitor_id','session_id','event_id'])assert.ok(!JSON.stringify(summary).includes(key));
 db.exec('ALTER TABLE event_regions DROP COLUMN district_code');db.exec("DELETE FROM metadata WHERE key='district_started_at'");
 const migrated=new AnalyticsStore(storageFor(db),now+86400000);
 const after=migrated.call('get_site_region_summary',{p_days:30},now+86400000);assert.equal(after.total_clicks,2);assert.equal(after.district_resolved_clicks,0);assert.equal(after.district_unknown_clicks,2);
 assert.equal(migrated.districtStartedAt,new Date(now+86400000).toISOString());
 migrated.prune(now+91*86400000);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM click_hours').get().n,0);db.close();
});
function storageFor(db){return {sql:{exec(sql,...args){if(sql.includes('CREATE TABLE')){db.exec(sql);return {toArray:()=>[]}}const rows=db.prepare(sql).all(...args).map(row=>({...row}));return {toArray:()=>rows}}},transactionSync(fn){db.exec('BEGIN');try{const value=fn();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e}}};}

test('coverage partitions domestic unresolved, foreign, and absent geography without mislabelling old records',()=>{
 const {db,store}=database();
 for(const [id,geo] of [[301,{country:'KR',latitude:37.5172,longitude:127.0473}],[302,{country:'KR',region:'Gyeonggi-do'}],[303,{country:'US',region:'California'}],[304,null]])store.call('record_site_usage_event',event(id),now,geo);
 const r=store.call('get_site_region_summary',{p_days:30},now);
 assert.equal(r.district_resolved_clicks,1);assert.equal(r.domestic_unresolved_clicks,1);assert.equal(r.foreign_clicks,1);assert.equal(r.unknown_clicks,1);
 assert.equal(r.total_clicks,r.district_resolved_clicks+r.domestic_unresolved_clicks+r.foreign_clicks+r.unknown_clicks);db.close();
});
