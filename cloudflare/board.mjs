// Firebase remains private; every database operation passes through this Worker.
const tokens = new Map();
const categories = new Set(['일반', '교육 질문', '프로젝트 문의', '제안']);
const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const pack = value => b64(enc.encode(JSON.stringify(value)));
class BoardError extends Error { constructor(status,message) { super(message); this.status=status; } }
const fail = (status,message) => { throw new BoardError(status,message); };
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function ready(env) { return Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_API_KEY && env.FIREBASE_SERVICE_ACCOUNT && env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY); }
export function validatePost(value) {
  const result={};
  for(const [key,min,max] of [['title',2,100],['body',5,5000],['authorName',2,30]]) {
    if(typeof value[key]!=='string') fail(400,'제목, 내용, 닉네임을 입력해 주세요.');
    result[key]=value[key].trim();
    if(result[key].length<min || result[key].length>max) fail(400,`${key}: ${min}~${max}자로 입력해 주세요.`);
  }
  if(!categories.has(value.category)) fail(400,'분류를 선택해 주세요.');
  result.category=value.category;
  return result;
}
async function payload(request) {
  if(!request.headers.get('content-type')?.startsWith('application/json')) fail(415,'JSON 요청이 필요합니다.');
  const reader=request.body?.getReader();
  if(!reader) fail(400,'입력 내용을 확인해 주세요.');
  const chunks=[]; let size=0;
  while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>32768) { await reader.cancel(); fail(413,'입력 내용이 너무 깁니다.'); } chunks.push(value); }
  const bytes=new Uint8Array(size); let offset=0; for(const part of chunks) { bytes.set(part,offset); offset+=part.length; }
  try { const value=JSON.parse(new TextDecoder().decode(bytes)); if(!value || Array.isArray(value) || typeof value!=='object') throw Error(); return value; }
  catch { fail(400,'입력 내용을 확인해 주세요.'); }
}
async function accessToken(env,fetchFn) {
  const account=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  if(account.project_id!==env.FIREBASE_PROJECT_ID) fail(503,'게시판 연결 설정을 확인해 주세요.');
  const cached=tokens.get(account.private_key_id);
  if(cached && cached.until>Date.now()+60000) return cached.token;
  const now=Math.floor(Date.now()/1000);
  const unsigned=pack({alg:'RS256',typ:'JWT'})+'.'+pack({iss:account.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const raw=atob(account.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,''));
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(raw,c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const assertion=unsigned+'.'+b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(unsigned))));
  const response=await fetchFn('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(!response.ok || !data.access_token) fail(503,'게시판 저장소에 연결할 수 없습니다.');
  tokens.set(account.private_key_id,{token:data.access_token,until:Date.now()+data.expires_in*1000});
  return data.access_token;
}
async function user(request,env,fetchFn) {
  const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._-]{20,16384})$/)?.[1];
  if(!token) fail(401,'Google 로그인 후 이용해 주세요.');
  const response=await fetchFn(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(10000)});
  const account=(await response.json()).users?.[0];
  if(!response.ok || !account || account.disabled || !account.emailVerified || !account.providerUserInfo?.some(p=>p.providerId==='google.com')) fail(401,'Google 로그인을 다시 진행해 주세요.');
  return account.localId;
}
async function challenge(value,request,env,fetchFn) {
  if(typeof value.turnstileToken!=='string' || value.turnstileToken.length>2048 || !value.turnstileToken) fail(400,'스팸 방지 확인을 완료해 주세요.');
  const response=await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:value.turnstileToken}),signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(!response.ok || !data.success || data.hostname!==new URL(request.url).hostname || data.action!=='board_write') fail(403,'스팸 방지 확인을 다시 진행해 주세요.');
}
function publicPost(document) {
  const result={id:document.name.split('/').at(-1)};
  for(const key of ['title','body','authorName','authorId','category','createdAt','updatedAt','reply']) result[key]=document.fields?.[key]?.stringValue || '';
  return result;
}
export async function handleBoard(request,env,{admin=false,fetchFn=fetch}={}) {
  try {
    const url=new URL(request.url), base=admin?'/api/admin/board':'/api/board';
    const route=url.pathname.slice(base.length);
    if(!admin && route==='/config' && request.method==='GET') return json({ready:ready(env),firebase:{apiKey:env.FIREBASE_API_KEY,projectId:env.FIREBASE_PROJECT_ID,authDomain:`${env.FIREBASE_PROJECT_ID}.firebaseapp.com`},turnstileSiteKey:env.TURNSTILE_SITE_KEY});
    if(!ready(env)) fail(503,'게시판 연결을 준비하고 있습니다. 잠시 후 다시 방문해 주세요.');
    const id=route.slice(1);
    if(route && !/^\/[A-Za-z0-9_-]{1,128}$/.test(route)) fail(404,'게시글을 찾을 수 없습니다.');
    const root=`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/visitorPosts`;
    async function db(suffix='',method='GET',body) {
      const response=await fetchFn(root+suffix,{method,headers:{Authorization:`Bearer ${await accessToken(env,fetchFn)}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
      if(response.status===404) fail(404,'게시글을 찾을 수 없습니다.');
      if(response.status===409 || response.status===412) fail(409,'글이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
      if(!response.ok) fail(503,'게시판 저장소에 연결할 수 없습니다.');
      return response.status===204?{}:response.json();
    }
    if(request.method==='GET') {
      if(id) return json({post:publicPost(await db('/'+id))});
      const pageToken=url.searchParams.get('cursor')||'';
      if(pageToken.length>4096) fail(400,'페이지 정보가 올바르지 않습니다.');
      const data=await db('?pageSize=20&orderBy=createdAt%20desc&pageToken='+encodeURIComponent(pageToken));
      return json({posts:(data.documents||[]).map(publicPost),nextCursor:data.nextPageToken||null});
    }
    if(!['POST','PATCH','DELETE'].includes(request.method)) fail(405,'지원하지 않는 요청입니다.');
    if(request.headers.get('origin')!==url.origin) fail(403,'홈페이지에서 다시 시도해 주세요.');
    if(request.headers.get('sec-fetch-site')==='cross-site') fail(403,'홈페이지에서 다시 시도해 주세요.');
    const uid=admin?null:await user(request,env,fetchFn);
    const existing=id?await db('/'+id):null;
    if(existing && !admin && existing.fields?.authorId?.stringValue!==uid) fail(403,'작성자만 수정하거나 삭제할 수 있습니다.');
    if(request.method==='DELETE') {
      if(!id) fail(404,'게시글을 선택해 주세요.');
      await db('/'+id+'?currentDocument.updateTime='+encodeURIComponent(existing.updateTime),'DELETE');
      return json({deleted:true});
    }
    if((request.method==='POST' && id) || (request.method==='PATCH' && !id)) fail(405,'지원하지 않는 요청입니다.');
    const value=await payload(request);
    let fields;
    if(admin) {
      if(!id || typeof value.reply!=='string' || value.reply.trim().length>5000) fail(400,'답변은 5000자 이내로 입력해 주세요.');
      fields={...existing.fields,reply:{stringValue:value.reply.trim()}};
    } else {
      const data=validatePost(value);
      await challenge(value,request,env,fetchFn);
      if(request.method==='POST') {
        const limiter=env.VISITOR_ANALYTICS.get(env.VISITOR_ANALYTICS.idFromName('board-limit:'+uid));
        if(!await limiter.boardLimit()) fail(429,'새 글은 1분 후 다시 작성해 주세요.');
      }
      fields={...existing?.fields,...Object.fromEntries(Object.entries(data).map(([key,text])=>[key,{stringValue:text}]))};
      fields.authorId={stringValue:uid};
      fields.createdAt=existing?.fields.createdAt || {stringValue:new Date().toISOString()};
    }
    fields.updatedAt={stringValue:new Date().toISOString()};
    const suffix=id?'/'+id+'?currentDocument.updateTime='+encodeURIComponent(existing.updateTime):'';
    return json({post:publicPost(await db(suffix,id?'PATCH':'POST',{fields}))},id?200:201);
  } catch(error) { return json({error:error instanceof BoardError?error.message:'게시판 연결을 확인한 후 다시 시도해 주세요.'},error instanceof BoardError?error.status:503); }
}
