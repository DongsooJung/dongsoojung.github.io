import {readFileSync,appendFileSync} from 'node:fs';
const run=JSON.parse(readFileSync('ops/kakao-self-test-20261020.json','utf8'));
const base='https://stargate.stargate8225.workers.dev';
if(run.recipient!=='01095878225'||run.channelName!=='스타게이트AI'||run.requestId!=='e6a0313a-47c1-4c41-ad61-9f3ea155c431')throw Error('Unexpected self-test configuration');
if(!process.env.SMS_ADMIN_TOKEN)throw Error('Administrator credential unavailable');
const write=data=>{const line=JSON.stringify(data);console.log(line);if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,line+'\n');};
async function api(path,body){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'x-admin-token':process.env.SMS_ADMIN_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(35000)});
 const d=await r.json();
 if(!r.ok||!d.ok)throw Error('API HTTP '+r.status+': '+String(d.message||'Request failed').replaceAll(process.env.SMS_ADMIN_TOKEN,'[redacted]').slice(0,240));
 return d;
}
const normalize=value=>String(value||'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
const {channels}=await api('/api/sms/kakao-channels');
const matching=channels.filter(v=>normalize(v.name)===normalize(run.channelName));
write({stage:'channels',expected:run.channelName,matched:matching.length,available:channels.map(v=>v.name)});
if(matching.length!==1){write({state:'blocked',reason:matching.length?'ambiguous_channel':'channel_not_linked',sent:0});process.exit(0);}
const channel=matching[0];
const {templates}=await api('/api/sms/kakao-templates?channelId='+encodeURIComponent(channel.id));
write({stage:'templates',channel:channel.name,approved:templates.length,templates:templates.map(v=>({id:v.templateId,name:v.name||v.templateName,variables:[...new Set([...JSON.stringify(v).matchAll(/#\{([^{}]+)\}/g)].map(m=>m[1]))]}))});
const safeNames=new Set(['이름','고객명','성함']);
const eligible=templates.filter(v=>/테스트|연동\s?확인/i.test(String(v.name||v.templateName||'')+' '+v.content)&&[...JSON.stringify(v).matchAll(/#\{([^{}]+)\}/g)].every(m=>safeNames.has(m[1])));
if(!eligible.length){write({state:'blocked',reason:templates.length?'no_suitable_test_template':'no_approved_template',sent:0});process.exit(0);}
const template=eligible.sort((a,b)=>String(a.templateId).localeCompare(String(b.templateId)))[0];
const kakaoVariables=Object.fromEntries([...JSON.stringify(template).matchAll(/#\{([^{}]+)\}/g)].map(m=>[m[1],'정동수']));
const message=String(template.content||'').replace(/#\{([^{}]+)\}/g,(_,name)=>kakaoVariables[name]).trim();
if(!message||message.length>1000||/#\{/.test(message))throw Error('Test template could not be rendered');
const {history}=await api('/api/sms/history');
const prior=history.find(v=>v.id===run.requestId);
const started=prior?.createdAt||new Date().toISOString();
let result=prior?.result;
if(!prior){
 write({stage:'send',channel:channel.name,templateId:template.templateId,recipient:'010****8225',requested:1,message});
 result=await api('/api/sms',{requestId:run.requestId,consent:true,confirmation:'발송',delivery:'kakao',sender:run.recipient,channelId:channel.id,templateId:template.templateId,kakaoVariables,message,recipients:[{name:'정동수',phone:run.recipient}]});
}
write({stage:'accepted',ok:result?.ok,accepted:result?.accepted||0,failed:result?.failed||0,groupId:result?.groupId||null,requestId:run.requestId,reused:Boolean(prior)});
if(!result?.ok){write({state:'not_accepted',sent:0,reason:String(result?.message||'Result unavailable').slice(0,240)});process.exit(0);}
for(let attempt=0;attempt<7;attempt++){
 if(attempt)await new Promise(resolve=>setTimeout(resolve,5000));
 const {reports}=await api('/api/sms/reports');
 const report=reports.filter(v=>v.to===run.recipient&&v.text===message&&Date.parse(v.dateCreated)>=Date.parse(started)-10000).sort((a,b)=>Date.parse(b.dateCreated)-Date.parse(a.dateCreated))[0];
 if(report){const status=String(report.statusCode);write({stage:'delivery',messageId:report.id,statusCode:status,statusMessage:report.statusMessage,dateCreated:report.dateCreated});if(status==='4000'){write({state:'provider_completed',accepted:1,recipient:'010****8225',requestId:run.requestId});process.exit(0);}if(!['2000','3000'].includes(status)){write({state:'provider_error',statusCode:status,statusMessage:report.statusMessage});process.exit(0);}}
}
write({state:'accepted_awaiting_delivery',accepted:1,requestId:run.requestId});
