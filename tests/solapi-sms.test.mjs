import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,send,authorized,solapi} from '../server/sms/service.mjs';
const body={requestId:'d49e8d6f-7530-4a3b-8bc5-4ea61a744111',consent:true,sender:'0212345678',message:'{이름}님 안녕하세요',recipients:[{name:'김고객',phone:'010-1234-5678'}]};
test('personalization, consent, duplicates and final message limits',()=>{
  assert.equal(validate(body)[0].text,'김고객님 안녕하세요');
  assert.equal(validate({...body,recipients:Array.from({length:10},(_,i)=>({name:'고객'+i,phone:'0100000000'+i}))}).length,10);
  assert.throws(()=>validate({...body,consent:false}));
  assert.throws(()=>validate({...body,recipients:[...body.recipients,...body.recipients]}));
  assert.throws(()=>validate({...body,message:'{이름}'.repeat(1000)}));
  assert.throws(()=>validate({...body,recipients:Array(11).fill(body.recipients[0])}));
});
test('administrator authentication rejects missing and incorrect credentials',async()=>{
  const env={SMS_ADMIN_TOKEN:'sample-admin'};
  assert.equal(await authorized(new Request('https://example.com'),env),false);
  assert.equal(await authorized(new Request('https://example.com',{headers:{'x-admin-token':'wrong'}}),env),false);
  assert.equal(await authorized(new Request('https://example.com',{headers:{'x-admin-token':'sample-admin'}}),env),true);
});
test('signed upstream contract, active sender validation and partial rejection',async()=>{
  const env={SOLAPI_API_KEY:'test-key',SOLAPI_API_SECRET:'test-secret'};
  let submitted=0;
  const upstream=async(url,options)=>{
    assert.match(options.headers.Authorization,/^HMAC-SHA256 apiKey=test-key, date=.+, salt=.+, signature=[a-f0-9]{64}$/);
    if(url.endsWith('/balance')) return Response.json({balance:0,point:300});
    if(url.endsWith('/active')) return Response.json([body.sender]);
    submitted++;
    const payload=JSON.parse(options.body);
    assert.equal(payload.allowDuplicates,false);
    assert.equal(payload.messages[0].text,'김고객님 안녕하세요');
    return Response.json({groupInfo:{groupId:'group-1'},failedMessageList:[]});
  };
  const result=await send(env,body,upstream);
  assert.equal(result.groupId,'group-1');assert.equal(result.accepted,1);assert.equal(submitted,1);
  await assert.rejects(()=>send(env,{...body,sender:'0211112222'},upstream));
  assert.equal(submitted,1);
  const denied=await send(env,body,async(url,options)=>url.includes('send-many')?Response.json({groupInfo:{groupId:'g'},failedMessageList:[{to:'01012345678',statusMessage:'거절'}]}):upstream(url,options));
  assert.equal(denied.ok,false);assert.equal(denied.accepted,0);assert.equal(denied.failures[0].phone,'010****5678');
});


test('live sender status checks SOLAPI, caches requests and fails closed',async()=>{
  const {liveStatus}=await import('../server/sms/status.mjs');
  let calls=0;const env={SOLAPI_API_KEY:'status-test',SOLAPI_API_SECRET:'status-secret'};
  const upstream=async()=>{calls++;return Response.json(['01095878225']);};
  const now=Date.now();const [a,b]=await Promise.all([liveStatus(env,upstream,now),liveStatus(env,upstream,now)]);
  assert.equal(a.senderVerified,true);assert.equal(b.mode,'live');assert.equal(calls,1);
  assert.equal('balance' in a,false);assert.equal('senders' in a,false);
  const inactive=await liveStatus(env,async()=>Response.json([]),now+61000);assert.equal(inactive.senderVerified,false);
  const failure=await liveStatus({...env,SOLAPI_API_KEY:'different-key'},async()=>{throw Error('provider unavailable');},now+62000);
  assert.equal(failure.senderVerified,false);assert.match(failure.message,/연결 확인 실패/);
});
