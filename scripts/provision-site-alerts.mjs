import {createHmac,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {ALERT_TEMPLATE} from '../cloudflare/site-alerts.mjs';

const BASE='https://stargate.stargate8225.workers.dev';
const NAME='스타게이트 웹 이용 운영 알림';
const COMMENT='홈페이지 운영자인 대표 본인이 신청한 자사 웹사이트 방문 통계 운영 알림입니다. 수신자는 대표 본인 한 명이며 고객에게 발송하지 않습니다. 사이트의 하루 첫 브라우저 방문을 1분 동안 집계하여 알립니다. 광고나 개인 방문자의 신원, IP, 연락처를 포함하지 않습니다. 페이지와 링크 변수에는 쿼리 없는 공개 URL만 사용합니다.';
export function matchingTemplate(t,channelId){return t.channelId===channelId&&!t.isHidden&&!t.isDeleted&&t.name===NAME&&t.content===ALERT_TEMPLATE&&t.messageType==='BA'&&!(t.buttons?.length)&&!(t.quickReplies?.length);}
export async function ensureTemplate(api){
 const channels=await api('/kakao/v2/channels?limit=100');
 const matches=(channels.channelList||[]).filter(c=>String(c.searchId||'').replace(/^@/,'').toLowerCase()==='stargateai');
 if(matches.length!==1)throw Error('Expected exactly one connected stargateai channel');
 const channelId=matches[0].channelId;let items=[],startKey;
 for(let page=0;page<10;page++){
  const data=await api('/kakao/v2/templates/?channelId='+encodeURIComponent(channelId)+'&limit=100'+(startKey?'&startKey='+encodeURIComponent(startKey):''));
  items.push(...(data.templateList||[]));if(!data.nextKey){startKey=null;break;}startKey=data.nextKey;
 }
 if(startKey)throw Error('Template list is incomplete; refusing to create a duplicate');
 const eligible=items.filter(t=>matchingTemplate(t,channelId));
 let template=eligible.find(t=>t.status==='APPROVED')||eligible.find(t=>t.status==='INSPECTING')||eligible[0];
 if(!template){
  const categories=await api('/kakao/v2/templates/categories');
  const list=Array.isArray(categories)?categories:(categories.categories||categories.categoryList||[]);
  const category=list.find(c=>c.code==='999999');if(!category)throw Error('General notification template category unavailable');
  template=await api('/kakao/v2/templates','POST',{channelId,name:NAME,content:ALERT_TEMPLATE,categoryCode:category.code,messageType:'BA',emphasizeType:'NONE',buttons:[],quickReplies:[]});
 }
 if(!template?.templateId)throw Error('Template ID unavailable');
 if(template.status==='PENDING')template=await api('/kakao/v2/templates/'+encodeURIComponent(template.templateId)+'/inspection','PUT',{comment:COMMENT});
 return {channelId,templateId:template.templateId,status:template.status,approved:template.status==='APPROVED'};
}
function output(key,value){appendFileSync(process.env.GITHUB_OUTPUT,key+'='+String(value)+'\n');}
function report(data){console.log(JSON.stringify(data));if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,JSON.stringify(data)+'\n');}
function solapiClient(){
 const key=process.env.SOLAPI_API_KEY,secret=process.env.SOLAPI_API_SECRET;
 if(!key||!secret)throw Error('SOLAPI deployment secrets unavailable');
 return async(path,method='GET',body)=>{
  const date=new Date().toISOString(),salt=randomBytes(16).toString('hex');
  const signature=createHmac('sha256',secret).update(date+salt).digest('hex');
  const r=await fetch('https://api.solapi.com'+path,{method,headers:{Authorization:`HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  const data=await r.json();if(!r.ok)throw Error('SOLAPI '+method+' '+path.split('?')[0]+' HTTP '+r.status+' '+String(data.errorCode||''));return data;
 };
}
async function worker(path,body){
 if(!process.env.SMS_ADMIN_TOKEN)throw Error('Administrator credential unavailable');
 const r=await fetch(BASE+path,{method:body?'POST':'GET',headers:{'x-admin-token':process.env.SMS_ADMIN_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(35000)});
 const data=await r.json();if(!r.ok||data.ok===false)throw Error('Worker '+path+' HTTP '+r.status);return data;
}
export async function main(){
 const api=solapiClient();const target=JSON.parse(readFileSync('ops/kakao-self-test-20261020.json','utf8'));
 if(target.channelName!=='스타게이트AI'||!/^010\d{8}$/.test(target.recipient))throw Error('Verified operator recipient unavailable');
 if(process.argv.includes('--verify')){
  const selected=JSON.parse(readFileSync(process.env.RUNNER_TEMP+'/site-alert-selection.json','utf8'));
  const status=await worker('/api/sms/site-alerts');if(!status.ready||status.mode!=='visits')throw Error('Visit alert runtime is not ready');
  const variables={'시각':'자동화 연결 확인 (테스트)','접속수':'0','클릭수':'0','페이지':BASE+'/visitors/','링크':'없음'};
  const message=ALERT_TEMPLATE.replace(/#\{([^}]+)\}/g,(_,key)=>variables[key]);
  const result=await worker('/api/sms',{requestId:'0f2e780a-586e-4f9e-a2c8-9bfd099ca629',consent:true,confirmation:'발송',delivery:'kakao',sender:target.recipient,channelId:selected.channelId,templateId:selected.templateId,kakaoVariables:variables,message,recipients:[{name:'정동수',phone:target.recipient}]});
  report({state:'activation_test',accepted:result.accepted||0,failed:result.failed||0,groupId:result.groupId||null});
  if(!result.ok)throw Error('Activation test was not accepted; inspect provider records before retrying');
  for(let attempt=0;attempt<5;attempt++){
   if(attempt)await new Promise(resolve=>setTimeout(resolve,5000));
   const data=await api('/messages/v4/list?limit=100');const list=Array.isArray(data.messageList)?data.messageList:Object.values(data.messageList||{});
   const entry=list.find(m=>m.to===target.recipient&&m.text===message&&(!result.groupId||m.groupId===result.groupId));
   if(entry){report({state:'activation_delivery',statusCode:String(entry.statusCode)});if(String(entry.statusCode)==='4000')return;if(!['2000','3000'].includes(String(entry.statusCode)))throw Error('Activation delivery failed: '+entry.statusCode);}
  }
  report({state:'activation_accepted_delivery_pending'});return;
 }
 const selected=await ensureTemplate(api);report({state:'template',...selected});output('approved',selected.approved);
 if(!selected.approved){if(selected.status==='REJECTED')throw Error('Visit notification template rejected; revise before activation');return;}
 const runtime=await worker('/api/sms/site-alerts');output('configure',!runtime.ready||runtime.mode!=='visits');
 writeFileSync(process.env.RUNNER_TEMP+'/site-alert-selection.json',JSON.stringify(selected),{mode:0o600});
 writeFileSync(process.env.RUNNER_TEMP+'/site-alert-secrets.json',JSON.stringify({CLICK_ALERT_TO:target.recipient,CLICK_ALERT_PFID:selected.channelId,CLICK_ALERT_TEMPLATE_ID:selected.templateId}),{mode:0o600});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
