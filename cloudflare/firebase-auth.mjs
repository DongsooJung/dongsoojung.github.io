// Firebase's documented same-origin auth helper proxy for redirect sign-in.
const helpers=new Set(['handler','handler.js','iframe','iframe.js','experiments.js','links','links.js']);
export async function handleFirebaseAuth(request,env,{fetchFn=fetch}={}) {
  const url=new URL(request.url);
  const isHelper=url.pathname.startsWith('/__/auth/')&&helpers.has(url.pathname.slice('/__/auth/'.length));
  const isConfig=url.pathname==='/__/firebase/init.json';
  const reply=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
  if(!isHelper&&!isConfig) return reply('Unknown authentication resource',404);
  if(!['GET','POST'].includes(request.method)||(isConfig&&request.method!=='GET')) return reply('Unsupported authentication method',405);
  if(!/^[a-z][a-z0-9-]{4,60}$/.test(env.FIREBASE_PROJECT_ID||'')) return reply('Authentication is not configured',503);
  if(request.method==='POST'&&request.headers.has('origin')&&!new Set([url.origin,'https://accounts.google.com']).has(request.headers.get('origin'))) return reply('Authentication origin rejected',403);
  let body;
  if(request.method==='POST'&&request.body) {
    const reader=request.body.getReader(),parts=[];let total=0;
    while(true) {const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>65536){await reader.cancel();return reply('Authentication response too large',413);}parts.push(value);}
    body=new Uint8Array(total);let offset=0;for(const part of parts){body.set(part,offset);offset+=part.length;}
  }
  const upstream=new URL(url.pathname+url.search,`https://${env.FIREBASE_PROJECT_ID}.firebaseapp.com`);
  const headers=new Headers();
  for(const name of ['accept','accept-language','content-type']) if(request.headers.has(name)) headers.set(name,request.headers.get(name));
  try {
    // Never forward the Worker's Access cookies, Authorization, or server secrets.
    const response=await fetchFn(upstream.href,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(10000)});
    const outgoing=new Headers(response.headers);outgoing.delete('set-cookie');outgoing.set('Cache-Control','no-store');
    if(outgoing.has('location')) {const redirect=new URL(outgoing.get('location'),upstream);if(redirect.origin===upstream.origin)outgoing.set('location',url.origin+redirect.pathname+redirect.search+redirect.hash);}
    if(isConfig&&response.ok) {const config=await response.json();config.authDomain=url.hostname;outgoing.delete('content-length');outgoing.delete('content-encoding');return Response.json(config,{headers:outgoing});}
    return new Response(response.body,{status:response.status,headers:outgoing});
  } catch {return reply('Authentication service temporarily unavailable',503);}
}
