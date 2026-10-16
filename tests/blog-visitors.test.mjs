import test from 'node:test';
import assert from 'node:assert/strict';
import { blogVisitDay, handleBlogVisitors } from '../cloudflare/blog-visitors.mjs';
import { handleRequest } from '../cloudflare/routes.mjs';

const endpoint='https://stargate.stargate8225.workers.dev/api/blog-visitors';
const blog='https://blog.stargateedu.co.kr';
const visitorId='00000000-0000-4000-8000-000000000001';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const pem='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----';
const env={FIREBASE_PROJECT_ID:'demo',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({project_id:'demo',client_email:'test@demo.iam.gserviceaccount.com',private_key_id:'blog-test',private_key:pem})};
function request(method='POST',body={visitorId},origin=blog) {
  return new Request(endpoint,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
function storage() {
  const documents=new Map(),commits=[];
  let fail=false;
  return {documents,commits,setFailure:value=>fail=value,fetchFn:async(url,options={})=>{
    if(url.includes('oauth2')) return Response.json({access_token:'test-server-token',expires_in:3600});
    if(url.endsWith(':commit')) {
      const body=JSON.parse(options.body);commits.push(body);
      if(fail) return Response.json({error:{status:'PERMISSION_DENIED'}},{status:403});
      const receipt=body.writes[0].update;
      if(documents.has(receipt.name)) return Response.json({error:{status:'ALREADY_EXISTS'}},{status:409});
      for(const write of body.writes) {
        const previous=documents.get(write.update.name)||{fields:{}};
        const fields={...previous.fields,...write.update.fields};
        for(const transform of write.updateTransforms||[]) fields[transform.fieldPath]={integerValue:String(Number(fields[transform.fieldPath]?.integerValue||0)+Number(transform.increment.integerValue))};
        documents.set(write.update.name,{name:write.update.name,fields});
      }
      return Response.json({commitTime:'2026-10-16T10:00:00Z'});
    }
    const document=documents.get(url.replace('https://firestore.googleapis.com/v1/',''));
    return document?Response.json(document):Response.json({error:{status:'NOT_FOUND'}},{status:404});
  }};
}

test('Korean day changes exactly at midnight',()=>{
  assert.equal(blogVisitDay('2026-10-16T14:59:59Z'),'2026-10-16');
  assert.equal(blogVisitDay('2026-10-16T15:00:00Z'),'2026-10-17');
});

test('daily receipt and both counters commit together; retries do not double count',async()=>{
  const db=storage(),options={...db,now:()=>new Date('2026-10-16T10:00:00Z')};
  const first=await (await handleRequest(request(),env,{blogVisitors:options})).json();
  assert.deepEqual(first,{site:'blog',source:'firebase',date:'2026-10-16',today:1,total:1,counted:true});
  const duplicate=await (await handleBlogVisitors(request(),env,options)).json();
  assert.equal(duplicate.counted,false);assert.equal(duplicate.total,1);assert.equal(duplicate.today,1);
  const commit=db.commits[0];assert.equal(commit.writes.length,3);
  assert.deepEqual(commit.writes[0].currentDocument,{exists:false});
  assert.ok(!JSON.stringify(commit).includes(visitorId));
  assert.equal((await (await handleBlogVisitors(request('GET'),env,options)).json()).total,1);
});

test('a second browser counts once; the same browser counts again on the next Korean day',async()=>{
  const db=storage();let timestamp='2026-10-16T14:59:59Z';
  const options={...db,now:()=>new Date(timestamp)};
  await handleBlogVisitors(request(),env,options);
  const second=await (await handleBlogVisitors(request('POST',{visitorId:'00000000-0000-4000-8000-000000000002'}),env,options)).json();
  assert.equal(second.today,2);assert.equal(second.total,2);
  timestamp='2026-10-16T15:00:00Z';
  const tomorrow=await (await handleBlogVisitors(request(),env,options)).json();
  assert.equal(tomorrow.today,1);assert.equal(tomorrow.total,3);
});

test('malformed, oversized and unapproved-origin requests cannot reach Firestore',async()=>{
  const db=storage();
  assert.equal((await handleBlogVisitors(request('POST',{},'https://evil.invalid'),env,db)).status,403);
  assert.equal((await handleBlogVisitors(request('POST',{visitorId:'bad'}),env,db)).status,400);
  for (const body of [null,false,[],42]) assert.equal((await handleBlogVisitors(request('POST',body),env,db)).status,400);
  assert.equal((await handleBlogVisitors(request('POST',{visitorId:'x'.repeat(2000)}),env,db)).status,413);
  assert.equal((await handleBlogVisitors(request('POST',{visitorId},''),env,db)).status,403);
  assert.equal(db.commits.length,0);
});

test('CORS permits only the blog; responses disclose aggregate counts only',async()=>{
  const db=storage();
  const preflight=new Request(endpoint,{method:'OPTIONS',headers:{Origin:blog,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
  assert.equal((await handleBlogVisitors(preflight,env,db)).status,204);
  const response=await handleBlogVisitors(request('GET'),env,db);
  assert.equal(response.headers.get('access-control-allow-origin'),blog);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(Object.keys(await response.json()).sort(),['counted','date','site','source','today','total']);
});

test('storage failures remain failures and never set a successful counted flag',async()=>{
  const db=storage();db.setFailure(true);
  const response=await handleBlogVisitors(request(),env,db);
  assert.equal(response.status,503);assert.equal(db.documents.size,0);
  assert.equal((await response.json()).counted,undefined);
});
