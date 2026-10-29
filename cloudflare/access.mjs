// Verify Cloudflare Access assertions at the origin as well as at the edge.
const keyCache = new Map();
const encoder = new TextEncoder();

function decode(part) {
  if (!part || !/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('Invalid JWT encoding');
  const binary = atob(part.replaceAll('-','+').replaceAll('_','/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function configuration(env) {
  if (typeof env.ACCESS_ISSUER !== 'string' || typeof env.ACCESS_AUD !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(env.ACCESS_AUD)) return null;
  const url = new URL(env.ACCESS_ISSUER);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)) return null;
  return { issuer: url.origin, audience: env.ACCESS_AUD };
}

async function signingKey(issuer, kid, fetchFn, now) {
  let cached = keyCache.get(issuer);
  if (!cached || now - cached.at > 600000 || (!cached.keys.some(key=>key.kid===kid) && now - cached.at > 60000)) {
    const response = await fetchFn(`${issuer}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Access signing keys unavailable');
    const data = await response.json();
    if (!Array.isArray(data.keys) || data.keys.length > 64) throw new Error('Invalid signing keys');
    cached = { at: now, keys: data.keys, imported: new Map() };
    keyCache.set(issuer,cached);
  }
  const jwk = cached.keys.find(key => key.kid === kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
  if (!jwk) throw new Error('Unknown Access signing key');
  if (!cached.imported.has(kid)) cached.imported.set(kid,await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']));
  return cached.imported.get(kid);
}

export async function verifyAccessRequest(request, env, { fetchFn = fetch, now = Date.now(), requiredEmail } = {}) {
  try {
    const config = configuration(env), token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!config || !token || token.length > 16384) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256 || claims.iss !== config.issuer || claims.type !== 'app') return false;
    if (requiredEmail !== undefined && (typeof requiredEmail !== 'string' || !requiredEmail.includes('@') || typeof claims.email !== 'string' || claims.email.toLowerCase() !== requiredEmail.toLowerCase())) return false;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const seconds = Math.floor(now/1000);
    if (!audiences.includes(config.audience) || !Number.isFinite(claims.exp) || claims.exp <= seconds || (claims.nbf != null && (!Number.isFinite(claims.nbf) || claims.nbf > seconds)) || !Number.isFinite(claims.iat) || claims.iat > seconds + 30) return false;
    const key = await signingKey(config.issuer,header.kid,fetchFn,now);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),encoder.encode(`${parts[0]}.${parts[1]}`));
  } catch { return false; }
}

