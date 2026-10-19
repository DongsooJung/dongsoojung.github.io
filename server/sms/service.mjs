import {validSession} from './session.mjs';
const enc = new TextEncoder();
export function json(data,status=200) { return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}); }
export async function authorized(request,env) {
  if(!env.SMS_ADMIN_TOKEN) return false;
  if(await validSession(request,env.SMS_ADMIN_TOKEN))return true;
  const hash=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)));
  const [a,b]=await Promise.all([hash(request.headers.get('x-admin-token')||''),hash(env.SMS_ADMIN_TOKEN)]);
  return a.reduce((diff,value,i)=>diff|(value^b[i]),0)===0;
}
export async function solapi(env,path,body,fetcher=fetch) {
  const date=new Date().toISOString(), salt=crypto.randomUUID().replaceAll('-','');
  const key=await crypto.subtle.importKey('raw',enc.encode(env.SOLAPI_API_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(date+salt))),v=>v.toString(16).padStart(2,'0')).join('');
  const response=await fetcher('https://api.solapi.com'+path,{method:body?'POST':'GET',headers:{Authorization:`HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
  const data=await response.json();
  if(!response.ok) throw new Error(String(data.errorMessage||'솔라피 요청이 거절되었습니다.').slice(0,200));
  return data;
}
export async function account(env,fetcher) {
  const [balance,numbers]=await Promise.all([solapi(env,'/cash/v1/balance',null,fetcher),solapi(env,'/senderid/v1/numbers/active',null,fetcher)]);
  const senders=(Array.isArray(numbers)?numbers:[]).map(v=>typeof v==='string'?v:v.phoneNumber).filter(v=>/^0\d{8,10}$/.test(v));
  return {balance:Number(balance.balance)||0,point:Number(balance.point)||0,senders};
}
export function validate(body) {
  if(body?.consent!==true) throw new Error('수신 동의 확인이 필요합니다.');
  if(!/^[a-f0-9-]{36}$/i.test(body?.requestId||'')) throw new Error('발송 요청 번호가 올바르지 않습니다.');
  if(!Array.isArray(body.recipients)||body.recipients.length<1||body.recipients.length>5) throw new Error('수신자는 1~5명까지 입력해 주세요.');
  if(typeof body.message!=='string'||!body.message.trim()||body.message.length>1000) throw new Error('문자 내용은 1~1000자로 입력해 주세요.');
  if(!/^0\d{8,10}$/.test(body.sender||'')) throw new Error('등록된 발신번호를 선택해 주세요.');
  const seen=new Set();
  const messages=body.recipients.map(item=>{
    if(typeof item.name!=='string'||!item.name.trim()||item.name.length>40) throw new Error('고객명은 1~40자로 입력해 주세요.');
    const phone=String(item.phone||'').replace(/\D/g,'');
    if(!/^01(?:0\d{8}|[16789]\d{7,8})$/.test(phone)) throw new Error('휴대폰 번호를 확인해 주세요.');
    if(seen.has(phone)) throw new Error('중복된 휴대폰 번호가 있습니다.');
    seen.add(phone);
    const text=body.message.replaceAll('{이름}',item.name.trim()).trim();
    if(enc.encode(text).length>2000) throw new Error('개인화한 문자가 너무 깁니다. 내용을 줄여 주세요.');
    return {to:phone,from:body.sender,text,country:'82',autoTypeDetect:true};
  });
  return messages;
}
export async function send(env,body,fetcher) {
  const messages=validate(body);
  const {senders}=await account(env,fetcher);
  if(!senders.includes(body.sender)) throw new Error('활성화된 발신번호가 아닙니다. 솔라피에서 등록 상태를 확인해 주세요.');
  const data=await solapi(env,'/messages/v4/send-many/detail',{messages,strict:true,allowDuplicates:false,showMessageList:true},fetcher);
  const failed=Array.isArray(data.failedMessageList)?data.failedMessageList:[];
  const accepted=messages.length-failed.length;
  return {ok:accepted>0,requested:messages.length,accepted,failed:failed.length,groupId:data.groupInfo?.groupId||data.groupId||null,message:`${accepted}건 접수 · ${failed.length}건 거절`,failures:failed.map(v=>({phone:String(v.to||'').replace(/^(\d{3})\d+(\d{4})$/,'$1****$2'),message:String(v.statusMessage||'접수 거절').slice(0,120)}))};
}
