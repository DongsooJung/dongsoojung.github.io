// Cloudflare fetch adapter for the existing Vercel (req, res) handlers.
const ALIASES = new Map([
  ['/api/bid-pblanc-cnstwk', '/api/bid-pblanc/cnstwk'],
  ['/api/bid-pblanc-servc', '/api/bid-pblanc/servc'],
]);

export const LIVE_SNAPSHOTS = new Map([
  ['/research/airport-congestion/data/latest.json', 'https://raw.githubusercontent.com/DongsooJung/dongsoojung.github.io/main/research/airport-congestion/data/latest.json'],
  ['/naver-cafe-research/data/latest.json', 'https://raw.githubusercontent.com/DongsooJung/dongsoojung.github.io/main/naver-cafe-research/data/latest.json'],
]);

export function rawPathname(requestUrl) {
  const value = String(requestUrl || '');
  const query = value.indexOf('?');
  const hash = value.indexOf('#');
  const cut = [query, hash].filter(index => index >= 0).sort((a, b) => a - b)[0] ?? value.length;
  const beforeQuery = value.slice(0, cut);
  const scheme = beforeQuery.indexOf('://');
  if (scheme < 0) return beforeQuery || '/';
  const start = beforeQuery.indexOf('/', scheme + 3);
  return start < 0 ? '/' : beforeQuery.slice(start) || '/';
}

export function rawSearch(requestUrl) {
  const value = String(requestUrl || '');
  const query = value.indexOf('?');
  if (query < 0) return '';
  const hash = value.indexOf('#', query);
  return hash < 0 ? value.slice(query) : value.slice(query, hash);
}

export function stripTrailingSlash(pathname) {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export function bindProcessEnv(env, colo) {
  if (typeof process === 'undefined') return;
  const target = process.env;
  if (env && typeof env === 'object') {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value !== 'string') continue;
      try { target[key] = value; } catch { /* Workers may expose a sealed env */ }
    }
  }
  const region = colo || target.VERCEL_REGION || 'cloudflare';
  try { target.VERCEL_REGION = region; } catch { /* ignore */ }
}

function queryFromSearch(search) {
  const query = {};
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [key, value] of params.entries()) {
    if (query[key] === undefined) query[key] = value;
    else if (Array.isArray(query[key])) query[key].push(value);
    else query[key] = [query[key], value];
  }
  return query;
}

function hasContentType(headers) {
  return Object.keys(headers).some(name => name.toLowerCase() === 'content-type');
}

export function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}

export async function invokeHandler(handler, request, route = {}) {
  const headers = {};
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  if (!headers['x-forwarded-for'] && headers['cf-connecting-ip']) headers['x-forwarded-for'] = headers['cf-connecting-ip'];

  let body;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const raw = await request.text();
    if (!headers['content-length']) headers['content-length'] = String(new TextEncoder().encode(raw).byteLength);
    const type = headers['content-type'] || '';
    if (raw && (type.includes('application/json') || raw.startsWith('{') || raw.startsWith('['))) {
      try { body = JSON.parse(raw); } catch { body = undefined; }
    } else if (raw) body = raw;
  }

  const state = { statusCode: 200, headers: {}, body: undefined };
  const res = {
    get statusCode() { return state.statusCode; },
    set statusCode(code) { state.statusCode = code; },
    setHeader(name, value) { state.headers[name] = value; },
    getHeader(name) {
      const match = Object.keys(state.headers).find(key => key.toLowerCase() === String(name).toLowerCase());
      return match ? state.headers[match] : undefined;
    },
    status(code) { state.statusCode = code; return this; },
    json(payload) {
      state.body = JSON.stringify(payload ?? null);
      if (!hasContentType(state.headers)) state.headers['content-type'] = 'application/json; charset=utf-8';
      return this;
    },
    send(payload) {
      if (typeof payload === 'string' || payload instanceof Uint8Array) state.body = payload;
      else if (payload === undefined || payload === null) state.body = '';
      else {
        state.body = JSON.stringify(payload);
        if (!hasContentType(state.headers)) state.headers['content-type'] = 'application/json; charset=utf-8';
      }
      return this;
    },
    end(payload) {
      if (payload !== undefined) this.send(payload);
      return this;
    },
  };

  const req = {
    method: request.method,
    url: route.url || `${rawPathname(request.url)}${rawSearch(request.url)}`,
    headers,
    query: { ...queryFromSearch(rawSearch(request.url)), ...(route.query || {}) },
    body,
  };

  try {
    await Promise.resolve(handler(req, res));
  } catch {
    return jsonResponse(500, { ok: false, error: 'internal_error' });
  }

  const responseHeaders = new Headers();
  for (const [name, value] of Object.entries(state.headers)) {
    if (value === undefined || value === null) continue;
    responseHeaders.set(name, String(value));
  }
  const status = state.statusCode || 200;
  const empty = status === 204 || status === 304 || request.method === 'HEAD';
  return new Response(empty ? null : (state.body ?? ''), { status, headers: responseHeaders });
}

export function vizDashboardRedirect(pathname) {
  const path = stripTrailingSlash(pathname);
  if (path === '/viz-dashboard' || path.startsWith('/viz-dashboard/')) {
    return new Response(null, { status: 301, headers: { Location: '/choropleth/' } });
  }
  return null;
}

export async function proxyLiveSnapshot(pathname, requestFetch = fetch) {
  const destination = LIVE_SNAPSHOTS.get(stripTrailingSlash(pathname));
  if (!destination) return null;
  let upstream;
  try {
    upstream = await requestFetch(destination, { redirect: 'follow', headers: { accept: 'application/json' } });
  } catch {
    return jsonResponse(502, { ok: false, error: 'snapshot_unavailable' });
  }
  const headers = new Headers();
  headers.set('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
  headers.set('cache-control', upstream.headers.get('cache-control') || 'public, max-age=60');
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function dispatchApi(request, handlers) {
  const rewritten = ALIASES.get(stripTrailingSlash(rawPathname(request.url))) || stripTrailingSlash(rawPathname(request.url));
  const url = `${rewritten}${rawSearch(request.url)}`;
  const exact = handlers?.exact?.get(rewritten);
  if (exact) return invokeHandler(exact, request, { url });
  const bid = /^\/api\/bid-pblanc\/([a-z0-9-]+)$/.exec(rewritten);
  if (bid && handlers?.bidKind) return invokeHandler(handlers.bidKind, request, { url, query: { kind: bid[1] } });
  if (/^\/api\/[a-z0-9-]+$/.test(rewritten) && handlers?.resource) return invokeHandler(handlers.resource, request, { url });
  if (rewritten === '/api' || rewritten.startsWith('/api/')) return jsonResponse(404, { ok: false, error: 'not_found' });
  return null;
}

export async function handleRequest(request, env, handlers, dependencies = {}) {
  bindProcessEnv(env, request.cf?.colo);
  const pathname = rawPathname(request.url);
  const redirect = vizDashboardRedirect(pathname);
  if (redirect) return redirect;
  const snapshot = await proxyLiveSnapshot(pathname, dependencies.fetch || fetch);
  if (snapshot) return snapshot;
  const api = await dispatchApi(request, handlers);
  if (api) return api;
  if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS.fetch(request);
  return jsonResponse(404, { ok: false, error: 'not_found' });
}

export function runDailyCollect(env, handlers) {
  bindProcessEnv(env);
  const secret = String(env?.CRON_SECRET || (typeof process !== 'undefined' ? process.env.CRON_SECRET : '') || '').trim();
  const headers = secret ? { authorization: `Bearer ${secret}` } : {};
  const request = new Request('https://stargate.internal/api/cron/daily-collect', { method: 'GET', headers });
  return dispatchApi(request, handlers);
}
