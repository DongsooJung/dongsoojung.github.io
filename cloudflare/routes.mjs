import smsWorker from '../server/sms/handler.mjs';
import {createSession} from '../server/sms/session.mjs';
import { MAX_IMPORT_BYTES, RequestError, isImportAuthorized, readPayload, validatePayload } from './analytics.mjs';
import { verifyAccessRequest } from './access.mjs';
import { DASHBOARD_COLLECTOR_VERSION } from './dashboard-refresh.mjs';
import { handleBoard } from './board.mjs';
import { handleFirebaseAuth } from './firebase-auth.mjs';
import { handleBlogVisitors } from './blog-visitors.mjs';

export const PUBLIC_ORIGINS = new Set(['https://stargateedu.co.kr','https://www.stargateedu.co.kr','https://stargate.stargate8225.workers.dev']);
const publicMethods = new Set(['record_site_visit','record_site_usage_event','get_site_button_click_counts','get_site_visit_stats','get_site_visit_summary','get_site_usage_summary']);
const adminMethods = new Set(['get_site_visit_stats','get_site_usage_stats']);
const dashboardNames = new Set(['exchange-rate','trade','urban']);

function json(value, status = 200) {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
function object(env) { return env.VISITOR_ANALYTICS.get(env.VISITOR_ANALYTICS.idFromName('stargate-visitors-v1')); }
function protectedPath(path) {
  let decoded=path;
  for(let count=0;count<16;count++) {
    const next=decoded.replace(/%([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
    if(next===decoded) break;
    decoded=next;
  }
  return new URL('https://path.invalid'+decoded.replaceAll('\\','/')).pathname.replace(/\/+/g,'/').toLowerCase();
}
function cors(response,origin) {
  const headers = new Headers(response.headers);
  headers.set('Vary','Origin');
  if (PUBLIC_ORIGINS.has(origin)) headers.set('Access-Control-Allow-Origin',origin);
  return new Response(response.body,{status:response.status,headers});
}
function allowedRequest(request) {
  const origin = request.headers.get('origin');
  return origin ? PUBLIC_ORIGINS.has(origin) : request.headers.get('sec-fetch-site') !== 'cross-site';
}
function preflight(request,method) {
  const headers = (request.headers.get('access-control-request-headers') || '').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
  if (request.headers.get('access-control-request-method') !== method || headers.some(header=>header!=='content-type')) return json({error:'Cross-origin request rejected'},403);
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':`${method}, OPTIONS`,'Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
}

export async function handleRequest(request,env,options = {}) {
  const url = new URL(request.url), path = url.pathname;
  if(path === "/api/sms" || path.startsWith('/api/sms/') || path === "/api/account") return smsWorker.fetch(request,env);
  if (path === '/api/blog-visitors') return handleBlogVisitors(request,env,options.blogVisitors);
  if(path.startsWith('/__/auth/')||path.startsWith('/__/firebase/')) return handleFirebaseAuth(request,env,options.firebaseAuth);
  const guardedPath=protectedPath(path);
  const adminPage = guardedPath === '/admin' || guardedPath.startsWith('/admin/');
  const adminApi = guardedPath.startsWith('/api/admin/');
  if (adminPage || adminApi) {
    if (!await verifyAccessRequest(request,env,options.access)) {
      if (adminPage) return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>관리자 인증 필요</title><h1>관리자 인증이 필요합니다</h1><p>Cloudflare Access 설정과 관리자 로그인이 완료된 뒤 다시 접속해 주세요.</p></html>',{status:401,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      return json({error:'Administrator authentication required'},401);
    }
    if (adminPage) {
      if(request.method==='GET'&&guardedPath==='/admin/visitors/'&&url.searchParams.get('sms-login')==='1') {
        if(!env.SMS_ADMIN_TOKEN)return json({error:'SMS session configuration required'},503);
        return new Response(null,{status:303,headers:{Location:'/sms/','Cache-Control':'private, no-store','Set-Cookie':await createSession(env.SMS_ADMIN_TOKEN)}});
      }
      const asset=await env.ASSETS.fetch(request),headers=new Headers(asset.headers);
      headers.set('Cache-Control','private, no-store');
      headers.set('Vary','Cf-Access-Jwt-Assertion, Cookie');
      return new Response(asset.body,{status:asset.status,headers});
    }
    if (request.headers.has('origin') && request.headers.get('origin') !== url.origin) return json({error:'Cross-origin admin request rejected'},403);
    if(path==='/api/admin/site-alerts') {
      if(request.method!=='GET')return json({error:'Use GET for alert status'},405);
      return json(await object(env).siteAlertStatus());
    }
    if (path === '/api/admin/board' || path.startsWith('/api/admin/board/')) return handleBoard(request,env,{admin:true,...options.board});
    const method = guardedPath.startsWith('/api/admin/analytics/') ? guardedPath.slice('/api/admin/analytics/'.length) : '';
    if (!adminMethods.has(method)) return json({error:'Unknown analytics method'},404);
    if (request.method !== 'POST') return json({error:'Use POST for analytics'},405);
    try { return json(await object(env).analytics(method,validatePayload(method,await readPayload(request)))); }
    catch(error) { return failure(error); }
  }
  if (path === '/api/board' || path.startsWith('/api/board/')) return handleBoard(request,env,options.board);
  if (path.startsWith('/api/dashboards/')) {
    const origin = request.headers.get('origin'), name = path.slice('/api/dashboards/'.length);
    if (!allowedRequest(request)) return cors(json({error:'Cross-origin request rejected'},403),origin);
    if (request.method === 'OPTIONS') return cors(preflight(request,'GET'),origin);
    if (request.method !== 'GET') return cors(json({error:'Use GET for dashboard data'},405),origin);
    try {
      const store=object(env);
      if (name === 'status') {
        const status=await store.dashboardStatus();
        if (status.datasets.some(dataset=>!dataset.checked_at || dataset.collector_version!==status.collector_version) && options.waitUntil) options.waitUntil(store.refreshDashboards('bootstrap'));
        return cors(json(status),origin);
      }
      if (!dashboardNames.has(name)) return cors(json({error:'Unknown dashboard'},404),origin);
      const result=await store.getDashboard(name);
      if ((!result.meta.checked_at || result.meta.collector_version!==DASHBOARD_COLLECTOR_VERSION) && options.waitUntil) options.waitUntil(store.refreshDashboards('bootstrap'));
      return cors(json(result),origin);
    } catch(error) { return cors(failure(error),origin); }
  }
  if (!path.startsWith('/api/analytics/')) return env.ASSETS.fetch(request);
  const method = path.slice('/api/analytics/'.length), importing = method === 'import_history';
  if (importing) {
    if (!env.ANALYTICS_IMPORT_KEY) return json({error:'Unknown analytics method'},404);
    if (request.method !== 'POST') return json({error:'Use POST for analytics'},405);
    if (request.headers.has('origin') && request.headers.get('origin') !== url.origin) return json({error:'Cross-origin import rejected'},403);
    try {
      if (!await isImportAuthorized(env.ANALYTICS_IMPORT_KEY,request.headers.get('authorization'))) return json({error:'Historical import authorization required'},401);
      const result = await object(env).importHistory(await readPayload(request,MAX_IMPORT_BYTES));
      return json(result.result,result.status);
    } catch(error) { return failure(error); }
  }
  const origin = request.headers.get('origin');
  if (!publicMethods.has(method)) return cors(json({error:'Unknown analytics method'},404),origin);
  if (!allowedRequest(request)) return cors(json({error:'Cross-origin request rejected'},403),origin);
  if (request.method === 'OPTIONS') return cors(preflight(request,'POST'),origin);
  if (request.method !== 'POST') return cors(json({error:'Use POST for analytics'},405),origin);
  try {
    // Legacy public visit requests intentionally receive only the summary.
    const internalMethod = method === 'get_site_visit_stats' ? 'get_site_visit_summary' : method;
    const payload = validatePayload(internalMethod,await readPayload(request));
    const notify=internalMethod==='record_site_usage_event'&&['https://stargateedu.co.kr','https://www.stargateedu.co.kr'].includes(origin);
    return cors(json(await object(env).analytics(internalMethod,payload,notify)),origin);
  } catch(error) { return cors(failure(error),origin); }
}

function failure(error) {
  if (error instanceof RequestError) return json({error:error.message},error.status);
  console.error('Cloudflare data request failed');
  return json({error:'Service temporarily unavailable'},503);
}
