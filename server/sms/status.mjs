import {solapi} from './service.mjs';
let cached;
export async function liveStatus(env,fetcher=fetch,now=Date.now()) {
  if(cached&&cached.key===env.SOLAPI_API_KEY&&cached.expires>now)return cached.promise;
  const promise=(async()=>{
    try {
      const numbers=await solapi(env,'/senderid/v1/numbers/active',null,fetcher);
      const active=(Array.isArray(numbers)?numbers:[]).some(v=>(typeof v==='string'?v:v.phoneNumber)==='01095878225');
      return {mode:'live',senderVerified:active,checkedAt:new Date(now).toISOString(),message:active?'010-9587-8225 · 솔라피 등록 완료':'010-9587-8225 · 활성 발신번호 등록 필요'};
    } catch {return {mode:'live',senderVerified:false,checkedAt:new Date(now).toISOString(),message:'솔라피 연결 확인 실패 · 잠시 후 새로고침해 주세요.'};}
  })();
  cached={key:env.SOLAPI_API_KEY,expires:now+60000,promise};
  return promise;
}
