import {json,authorized,account,validate,solapi} from './service.mjs';
import {validatePayload} from '../../cloudflare/analytics.mjs';
import {clearSession} from './session.mjs';
export default {async fetch(request,env) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/')) {
    const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
    headers.set('Referrer-Policy','no-referrer'); headers.set('X-Frame-Options','DENY');
    return new Response(response.body,{status:response.status,headers});
  }
  const resource=url.pathname.replace('/api/sms/','');
  const crmRoute=['contacts','templates','history'].includes(resource);
  if(!['/api/sms','/api/account','/api/sms/reports','/api/sms/session','/api/sms/analytics'].includes(url.pathname)&&!crmRoute) return json({ok:false,message:'찾을 수 없습니다.'},404);
  const configured=Boolean(env.SOLAPI_API_KEY&&env.SOLAPI_API_SECRET&&env.SMS_ADMIN_TOKEN);
  if(url.pathname==='/api/sms'&&request.method==='GET') return json({ok:true,configured});
  if(url.pathname==='/api/sms/session'&&request.method==='GET') return json({ok:true,signedIn:await authorized(request,env)});
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin) return json({ok:false,message:'요청 출처가 올바르지 않습니다.'},403);
  if(!configured) return json({ok:false,message:'서버 연결을 준비 중입니다.'},503);
  if(!await authorized(request,env)) return json({ok:false,message:'관리자 로그인이 필요합니다.'},401);
  try {
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
    if(url.pathname==='/api/account'&&request.method==='GET') return json({ok:true,...await account(env)});
    if(url.pathname==='/api/sms'&&request.method==='POST') {
      if(!request.headers.get('content-type')?.includes('application/json')) return json({ok:false,message:'JSON 요청이 필요합니다.'},415);
      const text=await request.text();
      if(text.length>20000) return json({ok:false,message:'요청이 너무 큽니다.'},413);
      let body;
      try { body=JSON.parse(text);validate(body); } catch(error) {return json({ok:false,message:error.message},400);}
      const object=env.SMS_REQUESTS.get(env.SMS_REQUESTS.idFromName(body.requestId));
      return json(await object.submit(body));
    }
    return json({ok:false,message:'지원하지 않는 요청 방식입니다.'},405);
  } catch(error) { let detail=String(error.message||'연결 실패').slice(0,240); for(const secret of [env.SOLAPI_API_KEY,env.SOLAPI_API_SECRET,env.SMS_ADMIN_TOKEN]) if(secret) detail=detail.replaceAll(secret,'[비공개]'); return json({ok:false,message:'솔라피 연결 확인: '+detail},502); }
}};
