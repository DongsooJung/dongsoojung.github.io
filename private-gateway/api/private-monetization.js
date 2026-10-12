const crypto = require('node:crypto');
const zlib = require('node:zlib');

const PAGE_PATH = '/strategy/monetization-opportunities/';
const API_PATH = '/api/private-monetization';
const COOKIE = '__Host-stargate_monetization';
const SESSION_SECONDS = 8 * 60 * 60;
const MIN_PASSWORD_LENGTH = 32;
const MAX_PASSWORD_LENGTH = 1024;

function headers(res, type) {
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Origin, Cookie');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderLogin(error = '') {
  const message = error ? `<p role="alert">${escapeHtml(error)}</p>` : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>비공개 자료 · STARGATE</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f5f7fb;color:#172033;min-height:100vh;display:grid;place-items:center;margin:0}main{background:white;border:1px solid #d7deea;border-radius:12px;padding:2rem;width:min(90vw,26rem)}label,input,button{display:block;width:100%;box-sizing:border-box}input{padding:.7rem;margin:.4rem 0 1rem}button{padding:.7rem;background:#123b73;color:white;border:0;border-radius:6px;cursor:pointer}p[role=alert]{color:#a21616}</style></head><body><main><h1>비공개 자료</h1><p>본인 확인 후 열람할 수 있습니다.</p>${message}<form method="post" action="${API_PATH}"><label for="password">비밀번호</label><input id="password" name="password" type="password" required autocomplete="current-password" maxlength="${MAX_PASSWORD_LENGTH}"><button type="submit">열람</button></form></main></body></html>`;
}

function readConfig(env) {
  const hash = env.MONETIZATION_PASSWORD_HASH || '';
  // Only use this fast verifier with a randomly generated, high-entropy credential.
  const match = /^sha256\$([A-Za-z0-9_-]{43})$/.exec(hash);
  if (!match) return null;
  const digest = Buffer.from(match[1], 'base64url');
  const key = env.MONETIZATION_SESSION_KEY || '';
  const html = env.MONETIZATION_HTML_GZIP_BASE64 || '';
  if (digest.length !== 32 || key.length < 32 || !html || !/^[A-Za-z0-9+/=]+$/.test(html)) return null;
  return { digest, key, html };
}

function verifyPassword(password, config) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) return false;
  const derived = crypto.createHash('sha256').update(password, 'utf8').digest();
  return crypto.timingSafeEqual(derived, config.digest);
}

function sign(expiry, config) {
  return crypto.createHmac('sha256', config.key).update(`v1.${expiry}.${config.digest.toString('hex')}`).digest('base64url');
}

function sessionCookie(config, now = Date.now()) {
  const expiry = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${COOKIE}=v1.${expiry}.${sign(expiry, config)}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Strict`;
}

function hasSession(cookieHeader, config, now = Date.now()) {
  const item = String(cookieHeader || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`));
  if (!item) return false;
  const match = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(item.slice(COOKIE.length + 1));
  if (!match) return false;
  const expiry = Number(match[1]);
  if (expiry <= Math.floor(now / 1000) || expiry > Math.floor(now / 1000) + SESSION_SECONDS) return false;
  return crypto.timingSafeEqual(Buffer.from(match[2]), Buffer.from(sign(expiry, config)));
}

function passwordFromBody(req) {
  const size = Number(req.headers['content-length'] || 0);
  if (!Number.isFinite(size) || size < 0 || size > 4096) return null;
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/x-www-form-urlencoded')) return null;
  const body = req.body;
  if (typeof body === 'string') return new URLSearchParams(body).get('password');
  if (Buffer.isBuffer(body)) return new URLSearchParams(body.toString('utf8')).get('password');
  if (body && typeof body === 'object') return body.password;
  return null;
}

function isLogout(req) {
  const body = req.body;
  if (typeof body === 'string') return new URLSearchParams(body).get('action') === 'logout';
  if (Buffer.isBuffer(body)) return new URLSearchParams(body.toString('utf8')).get('action') === 'logout';
  return body && body.action === 'logout';
}

function pageHtml(config, publicStub = false) {
  const zipped = Buffer.from(config.html, 'base64');
  const html = zlib.gunzipSync(zipped, { maxOutputLength: 2 * 1024 * 1024 }).toString('utf8');
  if (!/<html[\s>]/i.test(html)) throw new Error('Invalid private HTML');
  const logout = publicStub
    ? '<button type="button" onclick="location.reload()" style="position:fixed;right:1rem;bottom:1rem;z-index:9999;padding:.5rem 1rem">화면 닫기</button>'
    : `<form method="post" action="${API_PATH}" style="position:fixed;right:1rem;bottom:1rem;z-index:9999"><input type="hidden" name="action" value="logout"><button type="submit" style="padding:.5rem 1rem">로그아웃</button></form>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${logout}</body>`) : html + logout;
}

module.exports = function handler(req, res) {
  headers(res, 'text/html; charset=utf-8');
  const host = String(req.headers.host || '').toLowerCase();
  const expectedHost = process.env.MONETIZATION_ALLOWED_HOST || 'stargate-private-gateway.vercel.app';
  if (host !== expectedHost.toLowerCase()) return res.status(404).end();
  let path;
  try { path = new URL(req.url, `https://${host}`).pathname; }
  catch { return res.status(404).end(); }
  if (![PAGE_PATH, PAGE_PATH.slice(0, -1), API_PATH].includes(path)) return res.status(404).end();
  const publicOrigin = req.headers.origin === 'https://stargateedu.co.kr';
  const crossOriginApi = publicOrigin && path === API_PATH;
  if (crossOriginApi) res.setHeader('Access-Control-Allow-Origin', 'https://stargateedu.co.kr');
  if (req.method === 'OPTIONS') {
    if (!crossOriginApi) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  const config = readConfig(process.env);
  if (!config) return res.status(503).send('비공개 자료 인증 설정이 완료되지 않았습니다.');
  if (req.method === 'GET') {
    if (!hasSession(req.headers.cookie, config)) return res.status(200).send(renderLogin());
    try { return res.status(200).send(pageHtml(config)); }
    catch { return res.status(503).send('비공개 자료를 읽을 수 없습니다.'); }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  if (crossOriginApi) {
    if (req.headers['sec-fetch-site'] === 'same-origin') return res.status(403).end();
    if (!verifyPassword(passwordFromBody(req), config)) return res.status(401).send('인증에 실패했습니다.');
    try { return res.status(200).send(pageHtml(config, true)); }
    catch { return res.status(503).send('비공개 자료를 읽을 수 없습니다.'); }
  }
  if (req.headers.origin !== `https://${host}` || req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).end();
  if (isLogout(req)) {
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`);
    res.setHeader('Location', API_PATH);
    return res.status(303).end();
  }
  if (!verifyPassword(passwordFromBody(req), config)) return res.status(401).send(renderLogin('비밀번호를 확인해 주세요.'));
  res.setHeader('Set-Cookie', sessionCookie(config));
  res.setHeader('Location', API_PATH);
  return res.status(303).end();
};

module.exports._test = { readConfig, verifyPassword, hasSession, sessionCookie, pageHtml };
