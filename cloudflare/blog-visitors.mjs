import { firebaseAccessToken } from './board.mjs';
import { readPayload, RequestError } from './analytics.mjs';

const BLOG_ORIGIN = 'https://blog.stargateedu.co.kr';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function blogVisitDay(now = new Date()) {
  return new Date(new Date(now).getTime() + 9 * 3600000).toISOString().slice(0,10);
}

export async function handleBlogVisitors(request, env, { fetchFn = fetch, now = () => new Date() } = {}) {
  const origin = request.headers.get('origin');
  const respond = (value, status = 200) => Response.json(value, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin',
    ...(origin === BLOG_ORIGIN ? { 'Access-Control-Allow-Origin': BLOG_ORIGIN } : {}),
  }});
  if (origin && origin !== BLOG_ORIGIN && origin !== new URL(request.url).origin) return respond({error:'Origin rejected'},403);
  if (request.method === 'OPTIONS') {
    const headers = (request.headers.get('access-control-request-headers') || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
    if (origin !== BLOG_ORIGIN || !['POST','GET'].includes(request.headers.get('access-control-request-method')) || headers.some(x => x !== 'content-type')) return respond({error:'Origin rejected'},403);
    return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':BLOG_ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600',Vary:'Origin'}});
  }
  if (!['GET','POST'].includes(request.method)) return respond({error:'Use GET or POST'},405);
  if (request.method === 'POST' && origin !== BLOG_ORIGIN) return respond({error:'Visit the blog to count a visit'},403);
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT) return respond({error:'Visitor counter unavailable'},503);
  try {
    const value = request.method === 'POST' ? await readPayload(request,1024) : null;
    if (request.method === 'POST' && (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.visitorId !== 'string' || !UUID.test(value.visitorId))) return respond({error:'Invalid visitor identifier'},400);
    const date = blogVisitDay(now());
    const root = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    const site = `${root}/siteVisitStats/blog`;
    const daily = `${site}/days/${date}`;
    const authorization = `Bearer ${await firebaseAccessToken(env,fetchFn)}`;
    async function db(name) {
      const response = await fetchFn(`https://firestore.googleapis.com/v1/${name}`,{headers:{Authorization:authorization},signal:AbortSignal.timeout(10000)});
      if (response.status === 404) return {};
      if (!response.ok) throw Error('Firestore read failed');
      return response.json();
    }
    let counted = false;
    if (request.method === 'POST') {
      const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`blog:${date}:${value.visitorId.toLowerCase()}`));
      const receiptId = Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
      // The receipt and both increments commit atomically. Concurrent tabs and retries
      // cannot increment either count twice if the client counted flag is missing.
      const response = await fetchFn(`https://firestore.googleapis.com/v1/${root}:commit`,{
        method:'POST', headers:{Authorization:authorization,'Content-Type':'application/json'},
        body:JSON.stringify({writes:[
          {update:{name:`${daily}/visitors/${receiptId}`,fields:{date:{stringValue:date}}},currentDocument:{exists:false}},
          {update:{name:site,fields:{site:{stringValue:BLOG_ORIGIN}}},updateMask:{fieldPaths:['site']},updateTransforms:[{fieldPath:'total',increment:{integerValue:'1'}}]},
          {update:{name:daily,fields:{date:{stringValue:date}}},updateMask:{fieldPaths:['date']},updateTransforms:[{fieldPath:'count',increment:{integerValue:'1'}}]},
        ]}), signal:AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        // Only an existing daily receipt is a successful duplicate. Quota or
        // permission failures must never be reported as a recorded visit.
        if (response.status !== 409 || error.error?.status !== 'ALREADY_EXISTS') throw Error('Firestore commit failed');
      } else counted = true;
    }
    const [total, today] = await Promise.all([db(site),db(daily)]);
    return respond({site:'blog',source:'firebase',date,today:Number(today.fields?.count?.integerValue || 0),total:Number(total.fields?.total?.integerValue || 0),counted});
  } catch(error) {
    return respond({error:error instanceof RequestError ? error.message : 'Visitor counter temporarily unavailable'},error instanceof RequestError ? error.status : 503);
  }
}
