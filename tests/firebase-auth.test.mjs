import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFirebaseAuth} from '../cloudflare/firebase-auth.mjs';
import {handleRequest} from '../cloudflare/routes.mjs';
const origin='https://stargate.stargate8225.workers.dev';
const env={FIREBASE_PROJECT_ID:'planning-with-ai-518df'};
test('auth proxy preserves query and strips credentials',async()=>{
  let call;
  const response=await handleRequest(new Request(origin+'/__/auth/handler?eventId=abc',{headers:{Cookie:'private',Authorization:'Bearer private',Accept:'text/html'}}),env,{firebaseAuth:{fetchFn:async(url,options)=>{call={url,options};return new Response('helper',{headers:{'set-cookie':'private'}});}}});
  assert.equal(call.url,'https://planning-with-ai-518df.firebaseapp.com/__/auth/handler?eventId=abc');
  assert.equal(call.options.headers.get('cookie'),null);assert.equal(call.options.headers.get('authorization'),null);
  assert.equal(call.options.redirect,'manual');assert.equal(await response.text(),'helper');assert.equal(response.headers.get('set-cookie'),null);
});
test('only known helpers and methods can reach Firebase',async()=>{
  const options={fetchFn:()=>{throw Error('must not fetch');}};
  for(const [path,method,status] of [['/__/auth/unknown','GET',404],['/__/auth/handler','DELETE',405],['/__/firebase/init.json','POST',405]])assert.equal((await handleFirebaseAuth(new Request(origin+path,{method}),env,options)).status,status);
  assert.equal((await handleFirebaseAuth(new Request(origin+'/__/auth/handler'),{},options)).status,503);
});
test('POST validates origin and bounds the callback body',async()=>{
  for(const source of [origin,'https://accounts.google.com']) {
    const response=await handleFirebaseAuth(new Request(origin+'/__/auth/handler',{method:'POST',headers:{Origin:source},body:'code=example'}),env,{fetchFn:async(url,options)=>{assert.equal(new TextDecoder().decode(options.body),'code=example');return new Response('ok');}});assert.equal(response.status,200);
  }
  const fail={fetchFn:()=>{throw Error('must not fetch');}};
  assert.equal((await handleFirebaseAuth(new Request(origin+'/__/auth/handler',{method:'POST',headers:{Origin:'https://evil.invalid'},body:'x'}),env,fail)).status,403);
  assert.equal((await handleFirebaseAuth(new Request(origin+'/__/auth/handler',{method:'POST',body:'x'.repeat(65537)}),env,fail)).status,413);
});
test('config and Firebase redirects use the board origin',async()=>{
  const config=await handleFirebaseAuth(new Request(origin+'/__/firebase/init.json'),env,{fetchFn:async()=>Response.json({authDomain:'old',projectId:env.FIREBASE_PROJECT_ID},{headers:{'content-length':'1'}})});
  assert.equal((await config.json()).authDomain,new URL(origin).hostname);assert.equal(config.headers.get('content-length'),null);assert.equal(config.headers.get('cache-control'),'no-store');
  for(const [target,expected] of [['https://planning-with-ai-518df.firebaseapp.com/__/auth/handler?x=1',origin+'/__/auth/handler?x=1'],['https://accounts.google.com/o/oauth2/auth','https://accounts.google.com/o/oauth2/auth']]) {
    const response=await handleFirebaseAuth(new Request(origin+'/__/auth/handler'),env,{fetchFn:async()=>Response.redirect(target)});assert.equal(response.headers.get('location'),expected);
  }
});
test('upstream failures return a retryable error without details',async()=>{
  const response=await handleFirebaseAuth(new Request(origin+'/__/auth/iframe'),env,{fetchFn:async()=>{throw Error('private');}});assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private/);
});
