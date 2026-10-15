// Synthetic records only. Never copy a production export into tests or Git.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AnalyticsStore, HISTORY_EXPECTED, HISTORY_SOURCE, historyUuid, isImportAuthorized, prepareHistoryImport } from '../cloudflare/analytics.mjs';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const manifest = 'a'.repeat(64);
const envelope = { source: HISTORY_SOURCE, manifest_sha256: manifest };
const finalize = { ...envelope, action: 'finalize', expected_visits: 385, expected_events: 1375 };
const dayAfter = (date, offset) => new Date(Date.parse(date+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
export function syntheticHistory() {
  const visits = Array.from({ length: HISTORY_EXPECTED.visits }, (_,i) => ({ id:i+1, visitor_id:uid(i+1), visit_date:dayAfter('2026-07-25',Math.floor(i/5)), path:'/', created_at:dayAfter('2026-07-25',Math.floor(i/5))+'T03:00:00.000Z' }));
  const events = Array.from({ length: HISTORY_EXPECTED.events }, (_,i) => ({ event_id:uid(i+10000), visitor_id:uid(i%385+1), session_id:uid(i%385+500), event_type:i%3===0?'click':'page_view', page_path:'/history/', page_title:'Synthetic', element_label:i%3===0?'기록 버튼':null, element_kind:i%3===0?'link':null, target_url:i%3===0?'/research/':null, device_type:'desktop', created_at:i===1374?'2026-10-10T21:39:56.286397Z':dayAfter('2026-08-03',i%69)+'T03:00:00.000Z' }));
  return { visits, events };
}

function database() {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: { exec(sql, ...bindings) {
      if(sql.includes('CREATE TABLE')) { db.exec(sql); return { toArray:()=>[] }; }
      const rows = db.prepare(sql).all(...bindings).map(row=>({...row}));
      return { toArray:()=>rows };
    } },
    transactionSync(fn) { db.exec('BEGIN');try { const result=fn();db.exec('COMMIT');return result; } catch(error) { db.exec('ROLLBACK');throw error; } },
  };
  return { db, storage, store:new AnalyticsStore(storage,NOW) };
}

async function batch(store, kind, rows) {
  return store.importHistory(await prepareHistoryImport({ ...envelope, action:'batch', kind, rows },NOW),NOW);
}

test('historical source ID mapping is stable and separate from native browser IDs', async()=>{
  const visitor = await historyUuid('visitor',uid(1));
  assert.equal(await historyUuid('visitor',uid(1)),visitor);
  assert.notEqual(visitor,uid(1));
  assert.notEqual(await historyUuid('session',uid(1)),visitor);
  const secret='synthetic-local-test-secret-32-characters';
  assert.equal(await isImportAuthorized(secret,'Bearer '+secret),true);
  assert.equal(await isImportAuthorized(secret,'Bearer incorrect'),false);
  assert.equal(await isImportAuthorized(undefined,'Bearer '+secret),false);
});

test('replay skips originals, changed source rolls back the entire batch and incomplete import stays hidden', async()=>{
  const { db,store }=database();
  const { visits }=syntheticHistory();
  try {
    assert.deepEqual(await batch(store,'visits',[visits[0]]),{source:HISTORY_SOURCE,kind:'visits',inserted:1,skipped:0,completed:false});
    assert.equal((await batch(store,'visits',[visits[0]])).skipped,1);
    const conflicting=await prepareHistoryImport({...envelope,action:'batch',kind:'visits',rows:[visits[1],{...visits[0],path:'/changed/'}]},NOW);
    assert.throws(()=>store.importHistory(conflicting,NOW),error=>error.status===409);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM history_visits').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM import_ledger').get().n,1);
    assert.throws(()=>store.importHistory({...envelope,action:'finalize'},NOW),error=>error.status===409);
    assert.equal(store.call('get_site_visit_stats',{},NOW).total,0);
    assert.equal(store.call('get_site_visit_stats',{},NOW).historical_import,undefined);
    assert.equal(store.call('get_site_usage_stats',{},NOW).page_views,0);
  } finally { db.close(); }
});

test('385 visits and 1375 events activate once, retain original dates, survive pruning and preserve native rows', async()=>{
  const { db,storage,store }=database();
  const { visits,events }=syntheticHistory();
  try {
    const native={p_event_id:events[0].event_id,p_visitor_id:visits[0].visitor_id,p_session_id:uid(9999),p_event_type:'page_view',p_page_path:'/native/'};
    store.call('record_site_usage_event',native,NOW);
    for(const [kind,rows] of Object.entries({visits,events})) for(let i=0;i<rows.length;i+=250) await batch(store,kind,rows.slice(i,i+250));
    assert.equal(store.call('get_site_visit_stats',{},NOW).total,1);
    assert.equal(store.call('get_site_usage_stats',{},NOW).page_views,1);
    const prepared=await prepareHistoryImport(finalize,NOW);
    const result=store.importHistory(prepared,NOW);
    assert.equal(result.completed,true);
    assert.equal(result.already_completed,false);
    assert.deepEqual(result.historical_import,{source:HISTORY_SOURCE,visits:385,events:1375,first_date:'2026-07-25',last_date:'2026-10-11',completed_at:new Date(NOW).toISOString(),manifest_sha256:manifest});
    const stats=store.call('get_site_visit_stats',{p_days:90},NOW);
    assert.equal(stats.total,386);
    assert.equal(stats.today,1);
    assert.equal(stats.period,386);
    assert.equal(stats.started_at,new Date(NOW).toISOString());
    assert.ok(stats.daily.some(row=>row.date==='2026-07-25'&&row.visits===5));
    assert.ok(!stats.daily.some(row=>['2026-10-12','2026-10-13','2026-10-14'].includes(row.date)));
    const usage=store.call('get_site_usage_stats',{p_days:90},NOW);
    assert.equal(usage.page_views,events.filter(row=>row.event_type==='page_view').length+1);
    assert.equal(usage.clicks,events.filter(row=>row.event_type==='click').length);
    assert.equal(usage.visitors,new Set(events.filter(row=>row.event_type==='page_view').map(row=>row.visitor_id)).size+1);
    assert.equal(store.call('get_site_button_click_counts',{p_page_path:'/history/'},NOW)[0].clicks,459);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visits').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);
    assert.equal(store.importHistory(prepared,NOW).already_completed,true);
    assert.equal(store.call('get_site_visit_stats',{},NOW).total,386);
    assert.equal((await batch(store,'events',events.slice(0,250))).skipped,250);
    assert.equal(new AnalyticsStore(storage,NOW+1000).call('get_site_visit_stats',{},NOW).total,386);
    store.prune(NOW+100*86400000);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM history_visits').get().n,385);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM history_events').get().n,1375);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n,0);
    assert.equal(store.call('get_site_visit_stats',{},NOW+100*86400000).total,386);
    assert.equal(store.call('get_site_button_click_counts',{p_page_path:'/history/'},NOW+100*86400000)[0].clicks,459);
  } finally { db.close(); }
});

test('historical validator rejects malformed snapshots and preserves original timestamps and legacy destinations', async()=>{
  const {visits,events}=syntheticHistory();
  for(const payload of [
    {...envelope,source:'other',action:'batch',kind:'visits',rows:visits.slice(0,1)},
    {...envelope,action:'batch',kind:'visits',rows:visits.slice(0,251)},
    {...envelope,action:'batch',kind:'visits',rows:[{...visits[0],visit_date:'2026-02-30'}]},
    {...envelope,action:'batch',kind:'events',rows:[{...events[0],event_type:'input'}]},
    {...finalize,expected_events:1374},
  ]) await assert.rejects(prepareHistoryImport(payload,NOW));
  const prepared=await prepareHistoryImport({...envelope,action:'batch',kind:'events',rows:[{...events.at(-1),target_url:'nulllegacy-link'}]},NOW);
  assert.equal(prepared.rows[0].row.created_at,'2026-10-10T21:39:56.286397Z');
  assert.equal(prepared.rows[0].row.event_date,'2026-10-11');
  assert.equal(prepared.rows[0].row.target_url,'nulllegacy-link');
});
