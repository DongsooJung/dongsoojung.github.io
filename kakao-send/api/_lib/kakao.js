const crypto = require('crypto');

const SESSION_COOKIE = 'stargate_kakao_session';
const STATE_COOKIE = 'stargate_kakao_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function firstHeader(value) {
  return String(value || '').split(',')[0].trim();
}

function requestOrigin(req) {
  const host = firstHeader(req.headers?.['x-forwarded-host'] || req.headers?.host);
  const proto = firstHeader(req.headers?.['x-forwarded-proto']) || 'https';
  return host ? `${proto}://${host}` : '';
}

function getConfig(req) {
  const origin = String(process.env.APP_ORIGIN || requestOrigin(req)).replace(/\/$/, '');
  return {
    clientId: String(process.env.KAKAO_REST_API_KEY || ''),
    clientSecret: String(process.env.KAKAO_CLIENT_SECRET || ''),
    origin,
    redirectUri: String(process.env.KAKAO_REDIRECT_URI || `${origin}/api/auth/callback`),
    sessionSecret: String(process.env.KAKAO_SESSION_SECRET || ''),
  };
}

function requireConfig(req) {
  const config = getConfig(req);
  if (!config.clientId || !config.origin || !config.redirectUri || config.sessionSecret.length < 32) {
    const error = new Error('카카오 연동 환경 설정이 완료되지 않았습니다.');
    error.code = 'KAKAO_NOT_CONFIGURED';
    throw error;
  }
  return config;
}

function parseCookies(req) {
  return String(req.headers?.cookie || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const index = item.indexOf('=');
      if (index > 0) {
        try {
          cookies[item.slice(0, index)] = decodeURIComponent(item.slice(index + 1));
        } catch {
          cookies[item.slice(0, index)] = '';
        }
      }
      return cookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return parts.join('; ');
}

function appendCookie(res, value) {
  const current = res.getHeader('Set-Cookie');
  const next = current ? [...(Array.isArray(current) ? current : [current]), value] : [value];
  res.setHeader('Set-Cookie', next);
}

function keyFromSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function seal(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function unseal(value, secret) {
  try {
    const packed = Buffer.from(String(value || ''), 'base64url');
    if (packed.length < 29) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromSecret(secret), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const decrypted = Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}

function signState(state, secret) {
  const signature = crypto.createHmac('sha256', secret).update(state).digest('base64url');
  return `${state}.${signature}`;
}

function verifyState(signedState, receivedState, secret) {
  const [state, signature] = String(signedState || '').split('.');
  if (!state || !signature || state !== receivedState) return false;
  const expected = crypto.createHmac('sha256', secret).update(state).digest();
  const actual = Buffer.from(signature, 'base64url');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function setStateCookie(res, state, secret) {
  appendCookie(res, serializeCookie(STATE_COOKIE, signState(state, secret), { maxAge: 600 }));
}

function clearStateCookie(res) {
  appendCookie(res, serializeCookie(STATE_COOKIE, '', { maxAge: 0 }));
}

function readSession(req, secret) {
  return unseal(parseCookies(req)[SESSION_COOKIE], secret);
}

function setSession(res, session, secret) {
  appendCookie(res, serializeCookie(SESSION_COOKIE, seal(session, secret), { maxAge: SESSION_MAX_AGE }));
}

function clearSession(res) {
  appendCookie(res, serializeCookie(SESSION_COOKIE, '', { maxAge: 0 }));
}

async function tokenRequest(config, params) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    ...params,
  });
  if (config.clientSecret) body.set('client_secret', config.clientSecret);

  const response = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error('카카오 토큰 요청에 실패했습니다.');
    error.status = response.status;
    error.detail = String(data.error_description || data.error || '').slice(0, 200);
    throw error;
  }
  return data;
}

function sessionFromToken(data, previous = {}) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previous.refreshToken || '',
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 0)) * 1000,
    refreshExpiresAt: data.refresh_token_expires_in
      ? Date.now() + Number(data.refresh_token_expires_in) * 1000
      : previous.refreshExpiresAt || 0,
  };
}

async function refreshSession(config, session) {
  if (!session?.refreshToken) throw new Error('다시 로그인해 주세요.');
  const data = await tokenRequest(config, {
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });
  return sessionFromToken(data, session);
}

async function currentSession(req, res, config) {
  let session = readSession(req, config.sessionSecret);
  if (!session?.accessToken) return null;
  if (Number(session.expiresAt || 0) <= Date.now() + 60_000) {
    try {
      session = await refreshSession(config, session);
      setSession(res, session, config.sessionSecret);
    } catch {
      clearSession(res);
      return null;
    }
  }
  return session;
}

function isSameOrigin(req, config) {
  const origin = String(req.headers?.origin || '');
  if (!origin) return String(req.headers?.['sec-fetch-site'] || '') !== 'cross-site';
  try {
    return new URL(origin).origin === new URL(config.origin).origin;
  } catch {
    return false;
  }
}

function setCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

module.exports = {
  STATE_COOKIE,
  appendCookie,
  clearSession,
  clearStateCookie,
  currentSession,
  getConfig,
  isSameOrigin,
  parseCookies,
  readSession,
  refreshSession,
  requireConfig,
  serializeCookie,
  sessionFromToken,
  setCommonHeaders,
  setSession,
  setStateCookie,
  tokenRequest,
  verifyState,
};
