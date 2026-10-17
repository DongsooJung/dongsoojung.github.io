const encoder=new TextEncoder();
export const sessionCookie='__Host-stargate_sms';
async function sign(secret,payload) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function createSession(secret,now=Date.now()) {
  if(!secret)throw new Error('관리자 세션 설정이 필요합니다.');
  const payload=`${Math.floor(now/1000)+28800}.${crypto.randomUUID()}`;
  return `${sessionCookie}=${payload}.${await sign(secret,payload)}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`;
}
export function clearSession(){return `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;}
export async function validSession(request,secret,now=Date.now()) {
  if(!secret)return false;
  const value=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1);
  if(!value||value.length>180)return false;
  const parts=value.split('.');
  if(parts.length!==3||!/^\d{10}$/.test(parts[0])||!/^[a-f0-9-]{36}$/.test(parts[1])||!/^[a-f0-9]{64}$/.test(parts[2]))return false;
  const expiry=Number(parts[0]),seconds=Math.floor(now/1000);
  if(expiry<=seconds||expiry>seconds+28800)return false;
  const expected=await sign(secret,parts[0]+'.'+parts[1]);
  return [...expected].reduce((diff,value,i)=>diff|(value.charCodeAt(0)^parts[2].charCodeAt(i)),0)===0;
}
