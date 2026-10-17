import test from 'node:test';
import assert from 'node:assert/strict';
import {CRMStore} from '../server/sms/crm.mjs';
import handler from '../server/sms/handler.mjs';
import {createSession,validSession,clearSession} from '../server/sms/session.mjs';
class Storage {
  values=new Map();
  async get(key){return structuredClone(this.values.get(key));}
  async put(key,value){this.values.set(key,structuredClone(value));}
  async delete(key){this.values.delete(key);}
  async list({prefix}){return new Map([...this.values].filter(([key])=>key.startsWith(prefix)).map(([key,v])=>[key,structuredClone(v)]));}
  async transaction(fn){return fn(this);}
}
test('signed administrator cookies work without manual credentials and reject forged or expired sessions',async()=>{
  const secret='unit-test-session-signing-secret';
  const now=Date.now(),cookie=await createSession(secret,now);
  assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
  const request=new Request('https://test.invalid/api/sms/contacts',{headers:{cookie:cookie.split(';')[0]}});
  assert.equal(await validSession(request,secret,now),true);
  assert.equal(await validSession(request,'other-secret',now),false);
  assert.equal(await validSession(request,secret,now+28800000),false);
  const broken=new Request(request,{headers:{cookie:cookie.split(';')[0].slice(0,-1)+'z'}});
  assert.equal(await validSession(broken,secret,now),false);
  const status=await handler.fetch(new Request('https://test.invalid/api/sms/session',{headers:{cookie:cookie.split(';')[0]}}),{SMS_ADMIN_TOKEN:secret});
  assert.equal((await status.json()).signedIn,true);
  assert.match(clearSession(),/Max-Age=0/);
});
test('customers persist across sessions, reject duplicate phones and stale edits',async()=>{
  const storage=new Storage(),store=new CRMStore(storage);
  const input={name:'검증 고객',phone:'010-0000-0001',category:'연구',notes:'상담 메모',consent:true};
  const saved=await store.save('contacts',input);
  assert.equal(saved.phone,'01000000001');assert.ok(saved.consentAt);
  assert.equal((await new CRMStore(storage).list('contacts'))[0].notes,'상담 메모');
  await assert.rejects(()=>store.save('contacts',input),/이미 저장/);
  const changed=await store.save('contacts',{...saved,notes:'새 메모',consent:false});
  assert.equal(changed.version,2);assert.equal(changed.consentAt,null);
  await assert.rejects(()=>store.save('contacts',{...saved,notes:'오래된 메모'}),/다른 화면/);
  await assert.rejects(()=>store.remove('contacts',saved),/항목이 변경/);
  await store.remove('contacts',changed);assert.equal((await store.list('contacts')).length,0);
});
test('templates seed once and deleted templates stay deleted',async()=>{
  const store=new CRMStore(new Storage());
  const initial=await store.templates();assert.equal(initial.length,3);
  await store.remove('templates',initial[0]);assert.equal((await store.templates()).length,2);
  const added=await store.save('templates',{title:'사용자 문구',text:'{이름}님 안녕하세요'});
  assert.equal((await store.templates()).length,3);
  assert.equal(added.text,'{이름}님 안녕하세요');
});
test('request history transitions from processing to accepted, keeps one record and survives contact deletion',async()=>{
  const store=new CRMStore(new Storage());
  const request={requestId:'test-request',recipients:[{name:'검증',phone:'010-0000-0001'}],message:'{이름}님 안녕하세요',sender:'0212345678'};
  await store.record(request,{state:'processing',ok:false});
  await store.record(request,{ok:true,accepted:1,groupId:'test-group'});
  const entries=await store.list('history');assert.equal(entries.length,1);
  assert.equal(entries[0].recipients[0].phone,'01000000001');assert.equal(entries[0].result.groupId,'test-group');
  const contact=await store.save('contacts',{name:'검증',phone:'01000000001'});await store.remove('contacts',contact);
  assert.equal((await store.list('history')).length,1);
});
test('private CRM routes reject unauthorized and cross-origin requests before any storage access',async()=>{
  const env={SOLAPI_API_KEY:'test-key',SOLAPI_API_SECRET:'test-secret',SMS_ADMIN_TOKEN:'admin'};
  for(const path of ['contacts','templates','history','reports']){
    const response=await handler.fetch(new Request('https://test.invalid/api/sms/'+path),env);
    assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const denied=await handler.fetch(new Request('https://test.invalid/api/sms/contacts',{headers:{origin:'https://evil.invalid','x-admin-token':'admin'}}),env);
  assert.equal(denied.status,403);
});
test('authenticated API returns saved customer records and reports validation errors',async()=>{
  const store=new CRMStore(new Storage());
  const object={crm:async(action,body)=>{try {if(action==='contacts')return {ok:true,contacts:await store.list('contacts')};return {ok:true,item:await store.save('contacts',body)};}catch(error){return {ok:false,message:error.message};}}};
  const env={SOLAPI_API_KEY:'test-key',SOLAPI_API_SECRET:'test-secret',SMS_ADMIN_TOKEN:'admin',SMS_REQUESTS:{idFromName:v=>v,get:()=>object}};
  const request=body=>new Request('https://test.invalid/api/sms/contacts',{method:'POST',headers:{'x-admin-token':'admin','content-type':'application/json'},body:JSON.stringify(body)});
  const saved=await handler.fetch(request({name:'검증',phone:'01000000001'}),env);assert.equal(saved.status,200);
  const invalid=await handler.fetch(request({name:'검증',phone:'123'}),env);assert.equal(invalid.status,400);
  const list=await handler.fetch(new Request('https://test.invalid/api/sms/contacts',{headers:{'x-admin-token':'admin'}}),env);
  assert.equal((await list.json()).contacts.length,1);
});
