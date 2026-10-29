import test from 'node:test';
import assert from 'node:assert/strict';
import {SiteAlerts,alertConfig} from '../cloudflare/site-alerts.mjs';
import {handleRequest} from '../cloudflare/routes.mjs';
const configured={CLICK_ALERTS_ENABLED:'true',CLICK_ALERT_TO:'01000000000',CLICK_ALERT_PFID:'channel',CLICK_ALERT_TEMPLATE_ID:'approved-template',SOLAPI_API_KEY:'test-key',SOLAPI_API_SECRET:'test-secret'};
function storage() {
  const map=new Map();let alarm=null,lock=Promise.resolve();
  const value={get:async key=>structuredClone(map.get(key)),put:async(key,data)=>map.set(key,structuredClone(data)),getAlarm:async()=>alarm,setAlarm:async time=>{alarm=time;}};
  value.transaction=fn=>{const next=lock.then(()=>fn(value));lock=next.catch(()=>{});return next;};return value;
}
function event(overrides={}) {return {p_visitor_id:'12345678-1234-4234-8234-123456789abc',p_event_type:'page_view',p_page_path:'/',p_element_kind:'link',p_target_url:'https://example.com/lesson?private=secret#token',...overrides};}
function setup(env=configured,send=async()=>Response.json({groupInfo:{groupId:'G-test'}})) {
  const db=storage(),calls=[];let now=Date.parse('2026-10-17T01:00:00Z');
  const alerts=new SiteAlerts(db,env,{now:()=>now,fetcher:async(url,options)=>{calls.push({url,options});return send(url,options);}});
  return {alerts,db,calls,advance:ms=>now+=ms};
}
test('missing approval config and explicit off switch prevent all sends',async()=>{
  for(const env of [{...configured,CLICK_ALERTS_ENABLED:'false'},{...configured,CLICK_ALERT_TEMPLATE_ID:''},{...configured,CLICK_ALERT_TO:'invalid'}]) {
    const {alerts,calls}=setup(env);assert.equal(await alerts.record(event()),false);await alerts.flush();assert.equal(calls.length,0);assert.equal(alertConfig(env).ready,false);
  }
});
test('deduplicates concurrent repeats, ignores buttons, and schedules a one-minute batch',async()=>{
  const {alerts,db}=setup();const results=await Promise.all(Array.from({length:12},()=>alerts.record(event())));assert.equal(results.filter(Boolean).length,1);
  assert.equal(await alerts.record(event({p_event_type:'click',p_element_kind:'button'})),false);
  assert.equal(await alerts.record(event({p_event_type:'click'})),true);
  assert.equal((await alerts.status()).pending.pageViews,1);assert.equal((await alerts.status()).pending.clicks,1);
  assert.equal(await db.getAlarm(),Date.parse('2026-10-17T01:01:00Z'));
});
test('sends only to configured operator using ATA with no SMS fallback or personal data',async()=>{
  const {alerts,calls}=setup();await alerts.record(event());await alerts.record(event({p_event_type:'click'}));await alerts.flush();await alerts.flush();
  assert.equal(calls.length,1);const body=JSON.parse(calls[0].options.body),message=body.messages[0];
  assert.equal(message.to,configured.CLICK_ALERT_TO);assert.equal(message.type,'ATA');assert.equal(message.kakaoOptions.disableSms,true);
  assert.equal(message.kakaoOptions.variables['#{접속수}'],'1');assert.equal(message.kakaoOptions.variables['#{클릭수}'],'1');
  assert.doesNotMatch(JSON.stringify(body),/private=|secret#|12345678|p_visitor_id/);
  assert.equal(message.kakaoOptions.variables['#{링크}'],'https://example.com/lesson');
  assert.match(calls[0].options.headers.Authorization,/HMAC-SHA256/);
  assert.equal((await alerts.status()).last.status,'accepted');assert.doesNotMatch(JSON.stringify(await alerts.status()),/01000000000|test-secret|test-key/);
});
test('unknown network outcome is reserved and never automatically retried',async()=>{
  const {alerts,calls}=setup(configured,async()=>{throw Error('timeout');});await alerts.record(event());await alerts.flush();await alerts.flush();
  assert.equal(calls.length,1);assert.equal((await alerts.status()).last.status,'unknown');
});
test('explicit SOLAPI rejection is distinguished from acceptance',async()=>{
  const {alerts}=setup(configured,async()=>Response.json({failedMessageList:[{statusMessage:'reject'}],groupInfo:{groupId:'G'}}));await alerts.record(event());await alerts.flush();assert.equal((await alerts.status()).last.status,'rejected');
});
test('new events during delivery survive reservation and get their own next batch',async()=>{
  let during;const {alerts}=setup(configured,async()=>{await during();return Response.json({groupInfo:{groupId:'G'}});});
  during=()=>alerts.record(event({p_event_type:'click'}));await alerts.record(event());await alerts.flush();assert.equal((await alerts.status()).pending.clicks,1);assert.equal((await alerts.status()).pending.pageViews,0);
});
test('daily cap applies even to failed sends and resets on the next Korean day',async()=>{
  const {alerts,calls,advance}=setup();for(let n=0;n<35;n++){await alerts.record(event({p_page_path:'/p'+n}));await alerts.flush();}
  assert.equal(calls.length,30);assert.equal((await alerts.status()).attemptsToday,30);
  advance(86400000);await alerts.record(event());await alerts.flush();assert.equal(calls.length,31);assert.equal((await alerts.status()).attemptsToday,1);
});
test('only the two site origins mark new analytics events eligible for alerts',async()=>{
  const calls=[];const env={VISITOR_ANALYTICS:{idFromName:n=>n,get:()=>({analytics:async(...args)=>{calls.push(args);return true;}})}};
  for(const [origin,expected] of [['https://www.stargateedu.co.kr',true],['https://stargateedu.co.kr',true],['https://stargate.stargate8225.workers.dev',false]]) {
    const payload={...event(),p_event_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_session_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};
    const response=await handleRequest(new Request('https://stargate.stargate8225.workers.dev/api/analytics/record_site_usage_event',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)}),env);
    assert.equal(response.status,200);assert.equal(calls.at(-1)[2],expected);
  }
  assert.equal((await handleRequest(new Request('https://stargate.stargate8225.workers.dev/api/admin/site-alerts'),env)).status,401);
});

test('visit mode alerts once per browser per Korean day across pages and never for link clicks',async()=>{
 const {alerts,db,calls,advance}=setup({...configured,SITE_ALERT_MODE:'visits'});
 assert.equal(await alerts.record(event()),true);
 assert.equal(await alerts.record(event({p_page_path:'/research/'})),false);
 assert.equal(await alerts.record(event({p_event_type:'click'})),false);
 assert.equal(await alerts.record(event({p_visitor_id:'another-browser',p_page_path:'/visitors/'})),true);
 await alerts.flush();const message=JSON.parse(calls[0].options.body).messages[0];
 assert.equal(message.kakaoOptions.variables['#{접속수}'],'2');assert.equal(message.kakaoOptions.variables['#{클릭수}'],'0');
 assert.equal((await alerts.status()).mode,'visits');advance(86400000);
 assert.equal(await alerts.record(event()),true);assert.ok(await db.getAlarm());
});

test('visitor notification readiness is available only through an authenticated operator status API',async()=>{
 let queries=0;const env={...configured,SMS_ADMIN_TOKEN:'test-admin-token',VISITOR_ANALYTICS:{idFromName:n=>n,get:()=>({siteAlertStatus:async()=>{queries++;return {ready:false,missing:['CLICK_ALERT_TEMPLATE_ID']};}})}};
 const url='https://stargate.stargate8225.workers.dev/api/sms/site-alerts';
 assert.equal((await handleRequest(new Request(url),env)).status,401);assert.equal(queries,0);
 const response=await handleRequest(new Request(url,{headers:{'x-admin-token':'test-admin-token'}}),env);
 assert.equal(response.status,200);assert.equal((await response.json()).ready,false);assert.equal(queries,1);
});
