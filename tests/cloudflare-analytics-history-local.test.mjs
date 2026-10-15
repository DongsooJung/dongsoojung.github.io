// Local Wrangler only. Contains synthetic rows, never an operational export.
import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.ANALYTICS_TEST_URL, secret=process.env.ANALYTICS_TEST_IMPORT_KEY;
if(base&&!['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw new Error('Synthetic import tests require localhost');
const envelope={source:'supabase:inftexpcnfinglwlrvsj',manifest_sha256:'c'.repeat(64)};
const rows=Array.from({length:3},(_,i)=>({id:i+1,visitor_id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,visit_date:'2026-07-25',path:'/',created_at:'2026-07-25T03:00:00Z'}));
async function request(payload,key=secret) {
  const response=await fetch(`${base}/api/analytics/import_history`,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(payload)});
  return {status:response.status,data:await response.json()};
}
async function stats(){return (await fetch(`${base}/api/analytics/get_site_visit_stats`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();}
test('local import is authenticated, bounded, idempotent and invisible before finalization',{skip:!base||!secret},async()=>{
  const before=await stats();
  const batch={...envelope,action:'batch',kind:'visits',rows:rows.slice(0,1)};
  assert.equal((await request(batch,'wrong-local-secret')).status,401);
  assert.equal((await request(batch,null)).status,401);
  assert.equal((await request({...batch,rows:Array.from({length:251},()=>rows[0])})).status,400);
  assert.equal((await request({...batch,padding:'x'.repeat(262144)})).status,413);
  assert.equal((await request({...batch,source:'wrong'})).status,400);
  const first=await request(batch);
  assert.equal(first.status,200);
  assert.equal(first.data.inserted+first.data.skipped,1);
  assert.equal((await request(batch)).data.skipped,1);
  assert.equal((await request({...batch,rows:[rows[1],{...rows[0],path:'/changed/'}]})).status,409);
  assert.equal((await request({...batch,rows:rows.slice(1,2)})).data.inserted,1,'earlier row in conflicting batch must roll back');
  assert.equal((await request({...envelope,action:'finalize',expected_visits:385,expected_events:1375})).status,409);
  const after=await stats();
  assert.equal(after.total,before.total);
  assert.equal(after.historical_import,undefined);
});
