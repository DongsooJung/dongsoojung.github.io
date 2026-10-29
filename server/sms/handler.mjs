import {json,authorized,account,validate,solapi} from './service.mjs';
import {validatePayload} from '../../cloudflare/analytics.mjs';
import {clearSession,createSession} from './session.mjs';
import {liveStatus} from './status.mjs';
import {catalog,templates as kakaoTemplates} from './kakao.mjs';
export default {async fetch(request,env) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/')) {
    const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
    headers.set('Referrer-Policy','no-referrer'); headers.set('X-Frame-Options','DENY');
    return new Response(response.body,{status:response.status,headers});
  }
  const resource=url.pathname.replace('/api/sms/','');
  const crmRoute=['contacts','templates','history'].includes(resource);
  if(!['/api/sms','/api/account','/api/sms/reports','/api/sms/session','/api/sms/analytics','/api/sms/site-alerts','/api/sms/kakao-channels','/api/sms/kakao-templates'].includes(url.pathname)&&!crmRoute) return json({ok:false,message:'찾을 수 없습니다.'},404);
  const configured=Boolean(env.SOLAPI_API_KEY&&env.SOLAPI_API_SECRET&&env.SMS_ADMIN_TOKEN);
  if(url.pathname==='/api/sms'&&request.method==='GET') return json({ok:true,configured,...(configured?await liveStatus(env):{mode:'live',senderVerified:false,message:'운영 서버 설정이 필요합니다.'})});
  if(url.pathname==='/api/sms/session'&&request.method==='GET') return json({ok:true,signedIn:await authorized(request,env)});
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin) return json({ok:false,message:'요청 출처가 올바르지 않습니다.'},403);
  if(!configured) return json({ok:false,message:'서버 연결을 준비 중입니다.'},503);
  if(url.pathname==='/api/sms/session'&&request.method==='POST') {
    let body;try {body=JSON.parse((await request.text()).slice(0,2000));} catch {body={};}
    const hash=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||''))));
    const [a,b]=await Promise.all([hash(body.password),hash(env.SMS_ADMIN_TOKEN)]);
    if(a.reduce((diff,value,i)=>diff|(value^b[i]),0)!==0) {await new Promise(r=>setTimeout(r,1200));return json({ok:false,message:'관리자 비밀번호가 올바르지 않습니다.'},401);}
    return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':await createSession(env.SMS_ADMIN_TOKEN)}});
  }
  const signedIn=await authorized(request,env);
  const publicRoute=(url.pathname==='/api/sms'&&request.method==='POST')||(url.pathname==='/api/account'&&request.method==='GET')||(['/api/sms/kakao-channels','/api/sms/kakao-templates'].includes(url.pathname)&&request.method==='GET');
  if(!signedIn&&!publicRoute) return json({ok:false,message:'관리자 로그인이 필요합니다.'},401);
  try {
    if(url.pathname==='/api/sms/site-alerts'&&request.method==='GET') {
      if(!env.VISITOR_ANALYTICS)return json({ok:false,message:'방문 저장소를 연결해 주세요.'},503);
      const store=env.VISITOR_ANALYTICS.get(env.VISITOR_ANALYTICS.idFromName('stargate-visitors-v1'));
      return json({ok:true,...await store.siteAlertStatus()});
    }
    if(url.pathname==='/api/sms/kakao-channels'&&request.method==='GET')return json({ok:true,...await catalog(env)});
    if(url.pathname==='/api/sms/kakao-templates'&&request.method==='GET')return json({ok:true,...await kakaoTemplates(env,url.searchParams.get('channelId'))});
    if(url.pathname==='/api/sms/session'&&request.method==='DELETE')return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':clearSession()}});
    if(url.pathname==='/api/sms/analytics') {
      if(request.method!=='GET') return json({ok:false,message:'GET 요청이 필요합니다.'},405);
      let payload;
      try {payload=validatePayload('get_site_usage_stats',{p_days:Number(url.searchParams.get('days')||30)});}
      catch {return json({ok:false,message:'조회 기간은 1~90일입니다.'},400);}
      if(!env.VISITOR_ANALYTICS) return json({ok:false,message:'조회수 저장소를 연결해 주세요.'},503);
      const store=env.VISITOR_ANALYTICS.get(env.VISITOR_ANALYTICS.idFromName('stargate-visitors-v1'));
      return json({ok:true,...await store.analytics('get_site_usage_stats',payload)});
    }
    if(crmRoute) {
      const object=env.SMS_REQUESTS.get(env.SMS_REQUESTS.idFromName('stargate-sms-crm-v1'));
      if(request.method==='GET') return json(await object.crm(resource));
      if(['POST','DELETE'].includes(request.method)&&resource!=='history') {
        if(!request.headers.get('content-type')?.includes('application/json')) return json({ok:false,message:'JSON 요청이 필요합니다.'},415);
        const text=await request.text();
        if(text.length>20000) return json({ok:false,message:'요청이 너무 큽니다.'},413);
        let body;try {body=JSON.parse(text);} catch {return json({ok:false,message:'입력 형식을 확인해 주세요.'},400);}
        const result=await object.crm((request.method==='POST'?'save:':'remove:')+resource,body);
        return json(result,result.ok?200:400);
      }
      return json({ok:false,message:'지원하지 않는 요청 방식입니다.'},405);
    }
    if(url.pathname==='/api/sms/reports'&&request.method==='GET') {
      const data=await solapi(env,'/messages/v4/list?limit=50');
      const list=Array.isArray(data.messageList)?data.messageList:Object.values(data.messageList||{});
      return json({ok:true,reports:list.map(v=>({id:v.messageId,to:v.to,from:v.from,text:v.text,statusCode:v.statusCode,statusMessage:v.statusMessage,dateCreated:v.dateCreated})),nextKey:data.nextKey||null});
    }
    if(url.pathname==='/api/account'&&request.method==='GET') {const info=await account(env);return json(signedIn?{ok:true,credentialSuffix:env.SOLAPI_API_KEY.slice(-4),...info}:{ok:true,senders:info.senders});}
    if(url.pathname==='/api/sms'&&request.method==='POST') {
      if(!request.headers.get('content-type')?.includes('application/json')) return json({ok:false,message:'JSON 요청이 필요합니다.'},415);
      const text=await request.text();
      if(text.length>20000) return json({ok:false,message:'요청이 너무 큽니다.'},413);
      let body;
      try { body=JSON.parse(text);validate(body); } catch(error) {return json({ok:false,message:error.message},400);}
      if(!signedIn) {
        const journal=env.SMS_REQUESTS.get(env.SMS_REQUESTS.idFromName('stargate-sms-crm-v1'));
        const quota=await journal.crm('quota',{count:body.recipients.length});
        if(!quota.ok||!quota.allowed) return json({ok:false,message:`시간당 발송 한도(${quota.limit||50}명)를 넘었습니다. 잠시 후 다시 시도하거나 관리자 로그인 후 발송해 주세요.`},429);
      }
      const object=env.SMS_REQUESTS.get(env.SMS_REQUESTS.idFromName(body.requestId));
      return json(await object.submit(body));
    }
    return json({ok:false,message:'지원하지 않는 요청 방식입니다.'},405);
  } catch(error) { let detail=String(error.message||'연결 실패').slice(0,240); for(const secret of [env.SOLAPI_API_KEY,env.SOLAPI_API_SECRET,env.SMS_ADMIN_TOKEN]) if(secret) detail=detail.replaceAll(secret,'[비공개]'); return json({ok:false,credentialSuffix:env.SOLAPI_API_KEY?.slice(-4),message:'솔라피 연결 확인: '+detail},502); }
}};
