import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureTemplate,matchingTemplate} from '../scripts/provision-site-alerts.mjs';
import {ALERT_TEMPLATE} from '../cloudflare/site-alerts.mjs';
const template=(status='APPROVED')=>({templateId:'test-template',name:'스타게이트 웹 이용 운영 알림',channelId:'channel',content:ALERT_TEMPLATE,messageType:'BA',buttons:[],status});
function mock(list,createdStatus='PENDING'){
 const calls=[];return {calls,api:async(path,method='GET',body)=>{
  calls.push({path,method,body});
  if(path.startsWith('/kakao/v2/channels'))return {channelList:[{channelId:'channel',searchId:'stargateai'}]};
  if(path.includes('/categories'))return [{code:'999999',name:'기타'}];
  if(path.includes('/inspection'))return {...template(),status:'INSPECTING'};
  if(method==='POST')return template(createdStatus);
  return {templateList:list};
 }};
}
test('creates exact operator template and submits review, never activates a pending template',async()=>{
 const m=mock([]);const result=await ensureTemplate(m.api);assert.equal(result.approved,false);assert.equal(result.status,'INSPECTING');
 const create=m.calls.find(c=>c.method==='POST');assert.equal(create.body.content,ALERT_TEMPLATE);assert.equal(create.body.channelId,'channel');
 assert.equal(m.calls.filter(c=>c.method==='PUT').length,1);
});
test('reuses approved template and does not create or resubmit inspecting or rejected versions',async()=>{
 for(const status of ['APPROVED','INSPECTING','REJECTED']){const m=mock([template(status)]);const result=await ensureTemplate(m.api);assert.equal(result.approved,status==='APPROVED');assert.ok(m.calls.every(c=>c.method==='GET'));}
});
test('unrelated approved templates never qualify for visitor messages',()=>{
 assert.equal(matchingTemplate({...template(),content:'회원가입 완료'},'channel'),false);
 assert.equal(matchingTemplate({...template(),channelId:'other'},'channel'),false);
 assert.equal(matchingTemplate({...template(),buttons:[{buttonType:'AC'}]},'channel'),false);
});
test('incomplete template pagination cannot cause duplicate registration',async()=>{
 let writes=0;await assert.rejects(ensureTemplate(async(path,method='GET')=>{
 if(method!=='GET')writes++;
 if(path.startsWith('/kakao/v2/channels'))return {channelList:[{channelId:'channel',searchId:'stargateai'}]};
 return {templateList:[],nextKey:'more'};
 }),/incomplete/);assert.equal(writes,0);
});
