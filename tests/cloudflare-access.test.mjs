import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccessRequest } from '../cloudflare/access.mjs';
import { handleRequest, PUBLIC_ORIGINS } from '../cloudflare/routes.mjs';
import { DASHBOARD_COLLECTOR_VERSION } from '../cloudflare/dashboard-refresh.mjs';

const now=Date.parse('2026-10-15T12:00:00Z'),seconds=now/1000;
const issuer='https://stargate-test.cloudflareaccess.com',audience='synthetic-admin-audience-tag';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'synthetic-key',alg:'RS256',use:'sig'};
const encode=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
async function token(changes={},headerChanges={}) {
  const header=encode({alg:'RS256',kid:jwk.kid,...headerChanges});
  const payload=encode({iss:issuer,aud:[audience],type:'app',email:'ceo@stargateedu.co.kr',iat:seconds-60,nbf:seconds-60,exp:seconds+600,...changes});
  const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(`${header}.${payload}`))).toString('base64url');
  return `${header}.${payload}.${signature}`;
}
const config={ACCESS_ISSUER:issuer,ACCESS_AUD:audience,ANALYTICS_OWNER_EMAIL:'ceo@stargateedu.co.kr'};
const access={now,fetchFn:async url=>{
  assert.equal(url,issuer+'/cdn-cgi/access/certs');
  return Response.json({keys:[jwk]});
}};
const request=(path,body={},headers={},method='POST')=>new Request('https://stargate.stargate8225.workers.dev'+path,{method,headers:{'Content-Type':'application/json',...headers},...(method==='GET'||method==='OPTIONS'?{}:{body:JSON.stringify(body)})});
function environment(){
  const calls=[];
  const env={...config,ASSETS:{fetch:async()=>new Response('private admin HTML')},VISITOR_ANALYTICS:{idFromName:name=>name,get:()=>({analytics:async(method,payload)=>{
    calls.push({method,payload});
    if(method==='get_site_visit_summary') return {source:'cloudflare',today:2,total:387,historical_included:true};
    if(method==='get_site_usage_summary') return {source:'cloudflare',pages:[{page_path:'/',page_views:5}],buttons:[{target_url:'/research/',clicks:3}]};
    return {source:'cloudflare',today:2,total:387,daily:[{date:'2026-10-15',visits:2}],historical_import:{visits:385,events:1375}};
  }})}};
  return {env,calls};
}

test('Access accepts the signed application audience and rejects forged, expired and misconfigured assertions',async()=>{
  const good=await token();
  assert.equal(await verifyAccessRequest(request('/admin/visitors/',{}, {'Cf-Access-Jwt-Assertion':good},'GET'),config,access),true);
  const badTokens=[await token({exp:seconds}),await token({aud:['another-audience']}),await token({iss:'https://foreign.cloudflareaccess.com'}),await token({nbf:seconds+60}),await token({type:'org'}),await token({}, {alg:'HS256'}),good.slice(0,-5)+'aaaaa','not-a-token'];
  for(const bad of badTokens) assert.equal(await verifyAccessRequest(request('/admin/visitors/',{}, {'Cf-Access-Jwt-Assertion':bad},'GET'),config,access),false);
  assert.equal(await verifyAccessRequest(request('/admin/visitors/'),config,access),false);
  assert.equal(await verifyAccessRequest(request('/admin/visitors/',{}, {'Cf-Access-Jwt-Assertion':good},'GET'),{},access),false);
  assert.equal(await verifyAccessRequest(request('/admin/visitors/',{}, {'Cf-Access-Jwt-Assertion':good},'GET'),{...config,ACCESS_ISSUER:'https://attacker.example'},access),false);
});

test('admin HTML and full statistics require a verified Access assertion',async()=>{
  const {env,calls}=environment();
  for(const path of ['/admin/visitors/','/admin/visitors/index.html','/%61dmin/visitors/','/ad%6din/visitors/','/admin%2fvisitors/','/admin//visitors/','/ADMIN/visitors/','/%2561dmin/visitors/','/api/admin/analytics/get_site_visit_stats','/api/admin/analytics/get_site_usage_stats','/api/%61dmin/analytics/get_site_usage_stats']){
    assert.equal((await handleRequest(request(path),env,{access})).status,401);
  }
  assert.equal(calls.length,0);
  const good=await token();
  const headers={'Cf-Access-Jwt-Assertion':good};
  const page=await handleRequest(request('/admin/visitors/',{},headers,'GET'),env,{access});
  assert.equal(await page.text(),'private admin HTML');
  assert.equal(page.headers.get('Cache-Control'),'private, no-store');
  const response=await handleRequest(request('/api/admin/analytics/get_site_visit_stats',{p_days:90},headers),env,{access});
  assert.equal(response.status,200);
  assert.ok((await response.json()).daily.length);
  assert.equal(calls[0].method,'get_site_visit_stats');
  assert.equal((await handleRequest(request('/api/admin/analytics/get_site_usage_stats',{p_days:90},headers),env,{access})).status,200);
  assert.equal((await handleRequest(request('/api/admin/analytics/get_site_usage_stats',{}, {...headers,Origin:'https://stargateedu.co.kr'}),env,{access})).status,403);
});

test('SMS login issues an HttpOnly session only after verified existing administrator Access login',async()=>{
  const {env}=environment();env.SMS_ADMIN_TOKEN='test-sms-session-secret';
  const path='/admin/visitors/?sms-login=1';
  const denied=await handleRequest(request(path,{}, {},'GET'),env,{access});
  assert.equal(denied.status,401);assert.equal(denied.headers.get('set-cookie'),null);
  const response=await handleRequest(request(path,{}, {'Cf-Access-Jwt-Assertion':await token()},'GET'),env,{access});
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/sms/');
  assert.match(response.headers.get('set-cookie'),/__Host-stargate_sms=.*HttpOnly; Secure; SameSite=Strict/);
});

test('public compatibility endpoint returns summary only and the former full usage endpoint is closed',async()=>{
  const {env,calls}=environment();
  const response=await handleRequest(request('/api/analytics/get_site_visit_stats',{p_days:90}),env);
  assert.deepEqual(await response.json(),{source:'cloudflare',today:2,total:387,historical_included:true});
  assert.equal(calls[0].method,'get_site_visit_summary');
  assert.equal((await handleRequest(request('/api/analytics/get_site_usage_stats',{}),env)).status,404);
  assert.equal(calls.length,1);
  const summary=await (await handleRequest(request('/api/analytics/get_site_usage_summary',{p_days:7}),env)).json();
  assert.deepEqual(Object.keys(summary).sort(),['buttons','pages','source']);
  assert.ok(!JSON.stringify(summary).includes('historical_import'));
  for(const days of [7,14,30]) assert.equal((await handleRequest(request('/api/analytics/get_site_usage_summary',{p_days:days}),env)).status,200);
  assert.equal((await handleRequest(request('/api/analytics/get_site_usage_summary',{p_days:1}),env)).status,400);
  assert.equal((await handleRequest(request('/api/analytics/get_site_usage_summary',{p_days:90}),env)).status,400);
});

test('public CORS is limited to configured site origins and permits bounded preflight headers',async()=>{
  const {env,calls}=environment();
  assert.ok(PUBLIC_ORIGINS.has('https://www.stargatekorea.net'));
  assert.equal(PUBLIC_ORIGINS.has('https://www.stargatekorea.net.evil.test'),false);
  for(const origin of PUBLIC_ORIGINS){
    const preflight=await handleRequest(request('/api/analytics/get_site_visit_summary',{}, {Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},'OPTIONS'),env);
    assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(preflight.headers.get('Vary'),'Origin');
    const response=await handleRequest(request('/api/analytics/get_site_visit_summary',{}, {Origin:origin,'Sec-Fetch-Site':'cross-site'}),env);
    assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  }
  const before=calls.length;
  const denied=await handleRequest(request('/api/analytics/get_site_visit_summary',{}, {Origin:'https://foreign.example'}),env);
  assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);assert.equal(calls.length,before);
  assert.equal((await handleRequest(request('/api/analytics/get_site_visit_summary',{}, {Origin:'https://stargateedu.co.kr','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization'},'OPTIONS'),env)).status,403);
  assert.equal((await handleRequest(request('/api/analytics/get_site_visit_summary',{}, {'Sec-Fetch-Site':'cross-site'}),env)).status,403);
});

test('public dashboard bootstrap is fixed to known datasets and does not retry a checked failure',async()=>{
  const queued=[],triggers=[];
  let checked=null;
  const store={
    dashboardStatus:async()=>({collector_version:DASHBOARD_COLLECTOR_VERSION,datasets:[{name:'trade',checked_at:checked,collector_version:DASHBOARD_COLLECTOR_VERSION}]}),
    getDashboard:async name=>({payload:null,meta:{name,checked_at:checked,collector_version:DASHBOARD_COLLECTOR_VERSION}}),
    refreshDashboards:async trigger=>{triggers.push(trigger);},
  };
  const env={VISITOR_ANALYTICS:{idFromName:name=>name,get:()=>store}},context={waitUntil:promise=>queued.push(promise)};
  const response=await handleRequest(request('/api/dashboards/trade',{}, {Origin:'https://stargateedu.co.kr'},'GET'),env,context);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://stargateedu.co.kr');
  assert.deepEqual(triggers,['bootstrap']);
  await Promise.all(queued);
  checked='2026-10-15T12:00:00Z';
  await handleRequest(request('/api/dashboards/trade',{}, {},'GET'),env,context);
  await handleRequest(request('/api/dashboards/status',{}, {},'GET'),env,context);
  assert.equal(triggers.length,1);
  assert.equal((await handleRequest(request('/api/dashboards/arbitrary',{}, {},'GET'),env,context)).status,404);
  assert.equal((await handleRequest(request('/api/dashboards/trade',{}, {Origin:'https://foreign.example'},'GET'),env,context)).status,403);
});

test('a new collector version bootstraps an old checked failure once through normal public reads',async()=>{
  const pending=[],triggers=[];
  let storedVersion='previous-collector-version';
  const store={
    dashboardStatus:async()=>({collector_version:DASHBOARD_COLLECTOR_VERSION,datasets:[{name:'trade',checked_at:'2026-10-15T12:45:00Z',collector_version:storedVersion,error:'UPSTREAM_REDIRECT_REJECTED'}]}),
    getDashboard:async name=>({payload:{series:[]},meta:{name,checked_at:'2026-10-15T12:45:00Z',collector_version:storedVersion,error:'UPSTREAM_REDIRECT_REJECTED'}}),
    refreshDashboards:async trigger=>{triggers.push(trigger);storedVersion=DASHBOARD_COLLECTOR_VERSION;},
  };
  const env={VISITOR_ANALYTICS:{idFromName:name=>name,get:()=>store}},context={waitUntil:promise=>pending.push(promise)};
  assert.equal((await handleRequest(request('/api/dashboards/status',{}, {},'GET'),env,context)).status,200);
  await Promise.all(pending);
  assert.deepEqual(triggers,['bootstrap']);
  await handleRequest(request('/api/dashboards/status',{}, {},'GET'),env,context);
  await handleRequest(request('/api/dashboards/trade',{}, {},'GET'),env,context);
  assert.equal(triggers.length,1,'the current version must preserve its normal retry interval');
  storedVersion='another-old-version';
  await handleRequest(request('/api/dashboards/trade',{}, {},'GET'),env,context);
  assert.deepEqual(triggers,['bootstrap','bootstrap']);
});

test('customer page reuses SMS assets and administrator login returns only to fixed local destinations',async()=>{
  const {env}=environment();env.SMS_ADMIN_TOKEN='test-sms-session-secret';
  env.ASSETS.fetch=async request=>{assert.equal(new URL(request.url).pathname,'/sms/');return new Response('customer shell');};
  const page=await handleRequest(request('/sms/customers/',{}, {},'GET'),env,{access});
  assert.equal(await page.text(),'customer shell');
  for(const [next,target] of [['analytics','/sms/analytics/'],['customers','/sms/customers/'],['https://evil.invalid','/sms/']]){
    const response=await handleRequest(request('/admin/visitors/?sms-login=1&next='+encodeURIComponent(next),{}, {'Cf-Access-Jwt-Assertion':await token()},'GET'),env,{access});
    assert.equal(response.status,303);assert.equal(response.headers.get('location'),target);
  }
});

test('stargatekorea.net visits use a separate visitor store', async () => {
  const { storeName } = await import('../cloudflare/routes.mjs');
  assert.equal(storeName('https://www.stargatekorea.net'), 'stargatekorea-visitors-v1');
  assert.equal(storeName('https://www.stargateedu.co.kr'), 'stargate-visitors-v1');
  assert.equal(storeName('https://stargateedu.co.kr'), 'stargate-visitors-v1');
  assert.equal(storeName(null), 'stargate-visitors-v1');
});

test('regional statistics reject public and unauthenticated access and accept the existing administrator session',async()=>{
  const {env}=environment();
  const publicResponse=await handleRequest(request('/api/analytics/get_site_region_stats',{p_days:30},{Origin:'https://stargateedu.co.kr'}),env,{access});
  assert.equal(publicResponse.status,404);
  const privateResponse=await handleRequest(request('/api/admin/analytics/get_site_region_stats',{p_days:30}),env,{access});
  assert.equal(privateResponse.status,401);
  const authenticated=await handleRequest(request('/api/admin/analytics/get_site_region_stats',{p_days:30},{'Cf-Access-Jwt-Assertion':await token()}),env,{access});
  assert.equal(authenticated.status,200);
  const crossOrigin=await handleRequest(request('/api/admin/analytics/get_site_region_stats',{p_days:30},{'Cf-Access-Jwt-Assertion':await token(),Origin:'https://foreign.example'}),env,{access});
  assert.equal(crossOrigin.status,403);
});


test('analytics rejects a valid session for a different email and fails closed without an owner',async()=>{
 const {env}=environment();
 const other={'Cf-Access-Jwt-Assertion':await token({email:'other@example.invalid'})};
 assert.equal((await handleRequest(request('/api/admin/analytics/get_site_region_stats',{p_days:30},other),env,{access})).status,401);
 assert.equal((await handleRequest(request('/admin/visitors/',{},other,'GET'),env,{access})).status,401);
 delete env.ANALYTICS_OWNER_EMAIL;
 assert.equal((await handleRequest(request('/api/admin/analytics/get_site_region_stats',{p_days:30},{'Cf-Access-Jwt-Assertion':await token()}),env,{access})).status,401);
});


test('anonymous visitor report and regional summaries work while unrelated admin APIs remain protected',async()=>{
 const {env}=environment();
 env.VISITOR_ANALYTICS.get=()=>({analytics:async(method,payload)=>{
   assert.equal(method,'get_site_region_summary');assert.deepEqual(payload,{p_days:7});
   return {source:'cloudflare',days:7,total_clicks:2,located_clicks:2,unknown_clicks:0,regions:[{country:'KR',region:'Seoul',clicks:2,share:100}]};
 }});
 const response=await handleRequest(request('/api/analytics/get_site_region_summary',{p_days:7},{Origin:'https://stargateedu.co.kr'}),env,{access});
 assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://stargateedu.co.kr');
 assert.equal((await handleRequest(request('/visitors/',{}, {},'GET'),env,{access})).status,200);
 assert.equal((await handleRequest(request('/api/admin/analytics/get_site_usage_stats'),env,{access})).status,401);
 assert.equal((await handleRequest(request('/api/analytics/get_site_region_summary',{p_days:7},{Origin:'https://foreign.example'}),env,{access})).status,403);
});

test('current request location diagnosis uses trusted CF geography, never payload or raw IP, and only reads counts',async()=>{
 const {env,calls}=environment();
 for(const [cf,status] of [[{country:'KR',latitude:'37.5172',longitude:'127.0473'},'resolved'],[{country:'KR'},'coordinates_missing'],[{country:'KR',latitude:35,longitude:124},'outside_boundary'],[{country:'US'},'foreign'],[undefined,'country_missing']]){
  const req=request('/api/analytics/get_site_region_summary',{p_days:30,country:'US',district_code:'99999'});
  Object.defineProperty(req,'cf',{value:cf});
  const response=await handleRequest(req,env);const result=await response.json();
  assert.equal(result.current_region.status,status);
  if(status==='resolved')assert.equal(result.current_region.district_code,'11680');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.ok(!JSON.stringify(result).includes('latitude'));assert.ok(!JSON.stringify(result).includes('longitude'));
 }
 assert.ok(calls.every(c=>c.method==='get_site_region_summary'));
});
