import test from 'node:test';
import assert from 'node:assert/strict';
import {handleChatbot,chatbotStorage,channelOverlay} from '../server/sms/chatbot.mjs';

function storage(){const values=new Map();const tx={get:async key=>structuredClone(values.get(key)),put:async(key,value)=>values.set(key,structuredClone(value))};return {...tx,transaction:callback=>callback(tx)};}
function environment(ai){const mem=storage();return {KAKAO_SKILL_KEY:'test-only-key',AI:ai,SMS_REQUESTS:{idFromName:value=>value,get:()=>({chatbot:(action,payload)=>chatbotStorage(mem,action,payload)})}};}
function request(text,headers={},body){return new Request('https://test.invalid/api/kakao/skill',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':'test-only-key',...headers},body:body??JSON.stringify({userRequest:{utterance:text,user:{id:'unit-user'}}})});}
test('authentication is required before any paid AI call',async()=>{
 let calls=0;const env=environment({run:async()=>{calls++;return {response:'답변'};}});
 assert.equal((await handleChatbot(request('질문',{'x-api-key':'wrong'}),env)).status,401);assert.equal(calls,0);
});
test('welcome, sensitive information and actions use fixed replies without invoking AI',async()=>{
 let calls=0;const env=environment({run:async()=>{calls++;return {response:'답변'};}});
 for(const text of ['안녕하세요','서비스 안내','상담 요청','예약 확정해줘','제 번호는 010-1234-5678']){
  const response=await handleChatbot(request(text),env);const body=await response.json();assert.equal(body.version,'2.0');assert.ok(body.template.outputs[0].simpleText.text.length);}
 assert.equal(calls,0);
});
test('malformed and oversized payloads never reach AI',async()=>{
 let calls=0;const env=environment({run:async()=>{calls++;}});
 for(const [req,status]of [[request('',{},'{'),400],[request('x'.repeat(1001)),400],[request('x',{},JSON.stringify({padding:'x'.repeat(17000)})),413]])assert.equal((await handleChatbot(req,env)).status,status);
 assert.equal(calls,0);
});
test('real AI result formats as Kakao 2.0, strips reasoning, records generated state',async()=>{
 let captured;const env=environment({run:async(model,input)=>{captured={model,input};return {choices:[{message:{content:'<think>private reasoning</think>목표를 알려주시면 안내해 드리겠습니다.'}}]};}});
 const body=await(await handleChatbot(request('업무 자동화가 궁금해요'),env)).json();
 assert.equal(body.template.outputs[0].simpleText.text,'목표를 알려주시면 안내해 드리겠습니다.');
 assert.ok(captured.model.startsWith('@cf/'));assert.equal(captured.input.max_tokens,256);
 const stats=await env.SMS_REQUESTS.get().chatbot('status',{});assert.equal(stats.generated,1);assert.equal(stats.attempts,1);
});
test('provider failure returns an honest fallback without exposing credentials',async()=>{
 const env=environment({run:async()=>{throw Error('test-only-key private upstream error');}});
 const body=await(await handleChatbot(request('새로운 사업 문의입니다'),env)).json();
 assert.match(body.template.outputs[0].simpleText.text,/준비하지 못했습니다/);assert.ok(!JSON.stringify(body).includes('test-only-key'));
});
test('user and global daily budget persists and resets at Korea midnight',async()=>{
 const mem=storage(),at=Date.parse('2026-10-20T14:59:59Z');
 for(let user=0;user<5;user++)for(let n=0;n<10;n++)assert.equal((await chatbotStorage(mem,'reserve',{userHash:(''+user).repeat(64)},at)).allowed,true);
 assert.equal((await chatbotStorage(mem,'reserve',{userHash:'f'.repeat(64)},at)).allowed,false);
 assert.equal((await chatbotStorage(mem,'reserve',{userHash:'0'.repeat(64)},at+1000)).allowed,true);
 const stats=await chatbotStorage(mem,'status',{},at+1000);assert.equal(stats.day,'2026-10-21');assert.equal(stats.attempts,1);assert.equal(stats.users,undefined);
});
test('per-user budget blocks the eleventh AI request even when global budget remains',async()=>{
 const mem=storage(),at=Date.parse('2026-10-20T12:00:00Z');
 for(let n=0;n<10;n++)assert.equal((await chatbotStorage(mem,'reserve',{userHash:'a'.repeat(64)},at)).allowed,true);
 assert.equal((await chatbotStorage(mem,'reserve',{userHash:'a'.repeat(64)},at)).allowed,false);
 assert.equal((await chatbotStorage(mem,'reserve',{userHash:'b'.repeat(64)},at)).allowed,true);
});
test('a slow AI request returns fallback within Kakao skill deadline',async()=>{
 const env=environment({run:()=>new Promise(()=>{})});const start=Date.now();
 const body=await(await handleChatbot(request('새로운 사업 목표를 정리하고 싶어요'),env)).json();
 assert.match(body.template.outputs[0].simpleText.text,/준비하지 못했습니다/);assert.ok(Date.now()-start<4500);
});
test('business script changes only the confirmed public channel reference',async()=>{
 const response=await channelOverlay(new Response("const url='https://pf.kakao.com/_wJpen/chat';",{headers:{ETag:'old','Content-Length':'45'}}),'/sms/business.js');
 assert.match(await response.text(),/_vNJVX\/chat/);assert.equal(response.headers.has('ETag'),false);assert.equal(response.headers.has('Content-Length'),false);
});
