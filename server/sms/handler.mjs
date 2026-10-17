import {json,authorized,account,validate} from './service.mjs';
export default {async fetch(request,env) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/')) {
    const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
    headers.set('Referrer-Policy','no-referrer'); headers.set('X-Frame-Options','DENY');
    return new Response(response.body,{status:response.status,headers});
  }
  if(!['/api/sms','/api/account'].includes(url.pathname)) return json({ok:false,message:'찾을 수 없습니다.'},404);
  const configured=Boolean(env.SOLAPI_API_KEY&&env.SOLAPI_API_SECRET&&env.SMS_ADMIN_TOKEN);
  if(url.pathname==='/api/sms'&&request.method==='GET') return json({ok:true,configured});
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin) return json({ok:false,message:'요청 출처가 올바르지 않습니다.'},403);
  if(!configured) return json({ok:false,message:'서버 연결을 준비 중입니다.'},503);
  if(!await authorized(request,env)) return json({ok:false,message:'관리자 인증값을 확인해 주세요.'},401);
  try {
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
