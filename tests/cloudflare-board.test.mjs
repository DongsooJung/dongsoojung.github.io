import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBoard, validatePost } from '../cloudflare/board.mjs';
import { handleRequest } from '../cloudflare/routes.mjs';

const origin='https://stargateedu.co.kr';
const valid={title:'교육 질문',body:'수업에 관해 질문드립니다.',authorName:'방문자',category:'교육 질문',turnstileToken:'challenge'};
const fields=value=>Object.fromEntries(Object.entries(value).map(([key,value])=>[key,{stringValue:value}]));
const document={name:'projects/demo/databases/(default)/documents/visitorPosts/post1',fields:fields({...valid,authorId:'user1',createdAt:'2026-10-16T00:00:00.000Z'}),updateTime:'2026-10-16T00:00:00.000001Z'};
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const pem='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')+'\n-----END PRIVATE KEY-----';
const env={FIREBASE_PROJECT_ID:'demo',FIREBASE_API_KEY:'web-key',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({project_id:'demo',client_email:'board@demo.iam.gserviceaccount.com',private_key_id:'test',private_key:pem}),TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET_KEY:'secret',VISITOR_ANALYTICS:{idFromName:name=>name,get:()=>({boardLimit:async()=>true})}};
function request(path='',method='GET',body,uid='user1',requestOrigin=origin) { return new Request(origin+'/api/board'+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',Authorization:'Bearer '+uid.padEnd(25,'_')},body:body===undefined?undefined:JSON.stringify(body)}); }
function mock({challenge=true,uid='user1',accountValid=true}={}) {
  const calls=[];
  const fetchFn=async(url,options={})=>{
    calls.push({url,options});
    if(url.includes('accounts:lookup')) return Response.json(accountValid?{users:[{localId:uid,emailVerified:true,providerUserInfo:[{providerId:'google.com'}]}]}:{error:{}},{status:accountValid?200:400});
    if(url.includes('siteverify')) return Response.json({success:challenge,hostname:'stargateedu.co.kr',action:'board_write'});
    if(url.includes('oauth2')) return Response.json({access_token:'server-token',expires_in:3600});
    if(options.method==='POST') return Response.json({...document,fields:JSON.parse(options.body).fields});
    if(options.method==='PATCH') return Response.json({...document,fields:JSON.parse(options.body).fields});
    if(options.method==='DELETE') return Response.json({});
    return Response.json(url.includes('?pageSize')?{documents:[document],nextPageToken:'page2'}:document);
  };
  return {fetchFn,calls};
}
test('unconfigured board stays closed and exposes no server secret',async()=>{
  const response=await handleBoard(request('/config'),{...env,FIREBASE_SERVICE_ACCOUNT:undefined});
  const value=await response.json();assert.equal(value.ready,false);assert.ok(!JSON.stringify(value).includes('private_key'));
  assert.equal((await handleBoard(request(),{})).status,503);
});
test('public listing paginates without exposing storage metadata',async()=>{
  const m=mock();const response=await handleBoard(request('?cursor=hello'),env,m);const value=await response.json();
  assert.equal(value.posts[0].id,'post1');assert.equal(value.nextCursor,'page2');assert.equal(value.posts[0].updateTime,undefined);
  assert.match(m.calls.find(c=>c.url.includes('firestore')).url,/pageToken=hello/);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('authenticated writes persist server-owned identity and time',async()=>{
  const m=mock();const response=await handleBoard(request('','POST',{...valid,authorId:'attacker',createdAt:'fake'}),env,m);
  assert.equal(response.status,201);const {post}=await response.json();assert.equal(post.authorId,'user1');assert.notEqual(post.createdAt,'fake');
  assert.ok(m.calls.some(c=>c.url.includes('siteverify')));
});
test('unauthenticated, cross-origin and failed challenges cannot write',async()=>{
  for(const [req,options,status] of [[request('','POST',valid),{accountValid:false},401],[request('','POST',valid,'user1','https://evil.invalid'),{},403],[request('','POST',valid),{challenge:false},403]]) {
    const m=mock(options);assert.equal((await handleBoard(req,env,m)).status,status);
    assert.ok(!m.calls.some(c=>c.url.includes('firestore')&&c.options.method==='POST'));
  }
});
test('only the author can modify or delete a post',async()=>{
  for(const method of ['PATCH','DELETE']) { const m=mock({uid:'another-user'});assert.equal((await handleBoard(request('/post1',method,method==='PATCH'?valid:undefined),env,m)).status,403);assert.ok(!m.calls.some(c=>['PATCH','DELETE'].includes(c.options.method))); }
});
test('author update preserves original timestamp and uses write precondition',async()=>{
  const m=mock();const response=await handleBoard(request('/post1','PATCH',valid),env,m);assert.equal(response.status,200);
  assert.equal((await response.json()).post.createdAt,document.fields.createdAt.stringValue);
  assert.match(m.calls.find(c=>c.options.method==='PATCH').url,/currentDocument.updateTime=/);
});
test('rate limit blocks repeated creates',async()=>{
  const m=mock();const limited={...env,VISITOR_ANALYTICS:{idFromName:n=>n,get:()=>({boardLimit:async()=>false})}};
  assert.equal((await handleBoard(request('','POST',valid),limited,m)).status,429);
});
test('input validation and oversized payloads fail before database writes',async()=>{
  assert.throws(()=>validatePost({...valid,category:'unknown'}));assert.throws(()=>validatePost({...valid,title:'x'}));
  const m=mock();assert.equal((await handleBoard(request('','POST',{...valid,body:'a'.repeat(40000)}),env,m)).status,413);
});
test('admin routes require existing Cloudflare Access verification',async()=>{
  const response=await handleRequest(new Request(origin+'/api/admin/board'),{});assert.equal(response.status,401);
});
test('verified admin can reply without a Firebase visitor login',async()=>{
  const m=mock();const response=await handleBoard(new Request(origin+'/api/admin/board/post1',{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({reply:'문의 감사합니다.'})}),env,{...m,admin:true});
  assert.equal(response.status,200);assert.equal((await response.json()).post.reply,'문의 감사합니다.');
  assert.ok(!m.calls.some(c=>c.url.includes('accounts:lookup')));
});
