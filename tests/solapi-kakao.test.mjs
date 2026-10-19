import test from 'node:test';
import assert from 'node:assert/strict';
import {send} from '../server/sms/service.mjs';
import {catalog} from '../server/sms/kakao.mjs';
import handler from '../server/sms/handler.mjs';
const env={SOLAPI_API_KEY:'test-key',SOLAPI_API_SECRET:'test-secret',SMS_ADMIN_TOKEN:'unit-admin'};
const body={requestId:'d49e8d6f-7530-4a3b-8bc5-4ea61a744111',delivery:'kakao',consent:true,sender:'01095878225',channelId:'KA-test',templateId:'TP-test',message:'{이름}님, 10월 20일 상담 예약입니다.',kakaoVariables:{날짜:'10월 20일'},recipients:[{name:'김고객',phone:'01000000001'}]};
function upstream({approved=true,channels=true}={}){
  const calls=[];
  return {calls,fetcher:async(url,options)=>{
    if(url.includes('/channels?'))return Response.json({channelList:channels?[{channelId:'KA-test',channelName:'스타게이트'}]:[]});
    if(url.includes('/templates/'))return Response.json({templateList:[{templateId:'TP-test',channelId:'KA-test',status:approved?'APPROVED':'INSPECTING',content:'#{이름}님, #{날짜} 상담 예약입니다.',buttons:[{buttonType:'WL',buttonName:'상담 안내',linkMo:'https://stargateedu.co.kr/consult/'}]}]});
    if(url.includes('send-many')){calls.push(JSON.parse(options.body));return Response.json({groupInfo:{groupId:'test-group'},failedMessageList:[]});}
    throw Error('Unexpected upstream request');
  }};
}
test('approved channel templates build personalized ATA payloads with SMS fallback disabled',async()=>{
  const {calls,fetcher}=upstream();const result=await send(env,body,fetcher);
  assert.equal(result.accepted,1);assert.equal(calls.length,1);
  const message=calls[0].messages[0];assert.equal(message.type,'ATA');assert.equal(message.text,'김고객님, 10월 20일 상담 예약입니다.');
  assert.equal(message.kakaoOptions.disableSms,true);assert.equal(message.kakaoOptions.pfId,'KA-test');assert.equal(message.kakaoOptions.variables['#{이름}'],'김고객');
  assert.equal(message.kakaoOptions.buttons[0].linkMo,'https://stargateedu.co.kr/consult/');
});
test('unlinked channels, unapproved templates, missing variables and modified content never reach send',async()=>{
  for(const [input,settings]of [[body,{channels:false}],[body,{approved:false}],[{...body,kakaoVariables:{}},{}],[{...body,message:'수정된 문구'},{}],[{...body,delivery:'unknown'},{}]]){
    const {calls,fetcher}=upstream(settings);await assert.rejects(()=>send(env,input,fetcher));assert.equal(calls.length,0);
  }
});
test('empty provider catalog stays empty and channel APIs require authentication',async()=>{
  assert.deepEqual((await catalog(env,async()=>Response.json({channelList:[]}))).channels,[]);
  for(const path of ['kakao-channels','kakao-templates?channelId=KA-test']){
    const r=await handler.fetch(new Request('https://test.invalid/api/sms/'+path),env);assert.equal(r.status,401);
  }
});
