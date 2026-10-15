// Read-only operator diagnostic: output is an allowlisted summary, never a URL or body.
import { pathToFileURL } from 'node:url';

const DIRECT = 'https://apis.data.go.kr/1220000/nationtrade/getNationtradeList';
const MAX_BYTES = 32 * 1024;
const EMPTY = { http_status: null, proxy_region: null, upstream_status: null, content_type: null, body_format: null, result_code: null, redirect_same_origin: null, login_classification: 'none', access_denied: false, forbidden: false, key_rejected: false, body_truncated: false };

function endpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('INVALID_CONFIGURATION');
  return url;
}
function status(value) { return /^\d{3}$/.test(value || '') && Number(value) >= 100 && Number(value) <= 599 ? Number(value) : null; }
function contentType(value) {
  const type = (value || '').split(';')[0].trim().toLowerCase();
  return ['application/json', 'application/xml', 'text/xml', 'text/html', 'text/plain'].includes(type) ? type : type ? 'other' : null;
}
async function boundedBody(response) {
  if (!response.body) return { text: '', truncated: false };
  const reader = response.body.getReader(), chunks = [];
  let size = 0, truncated = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const take = Math.min(value.byteLength, MAX_BYTES - size);
    if (take) { chunks.push(value.subarray(0, take)); size += take; }
    if (value.byteLength > take || size === MAX_BYTES) { truncated = true; await reader.cancel(); break; }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { text: new TextDecoder().decode(bytes), truncated };
}

export async function probeCustoms(kind, base, key, fetchFn = fetch) {
  const result = { probe: kind, configured: Boolean(key && (kind === 'direct' || base)), ...EMPTY };
  if (!result.configured) return { ...result, classification: 'not_configured' };
  let url;
  try { url = endpoint(kind === 'direct' ? DIRECT : base); }
  catch { return { ...result, classification: 'invalid_configuration' }; }
  for (const [name, value] of Object.entries({ strtYymm: '202609', endYymm: '202609', numOfRows: '500', pageNo: '1' })) url.searchParams.set(name, value);
  if (kind === 'direct') url.searchParams.set('serviceKey', key);
  try {
    const response = await fetchFn(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/xml', ...(kind === 'proxy' ? { 'x-data-key': key } : {}) } });
    result.http_status = status(String(response.status));
    const region = response.headers.get('x-proxy-region');
    result.proxy_region = /^[a-z]{3}\d$/.test(region || '') ? region : region ? 'other' : null;
    result.upstream_status = status(response.headers.get('x-upstream-status'));
    result.content_type = contentType(response.headers.get('content-type'));
    if (response.status >= 300 && response.status < 400) {
      try {
        const location = new URL(response.headers.get('location'), url);
        result.redirect_same_origin = location.origin === url.origin;
        result.login_classification = /(?:login|signin|sso|auth)/i.test(location.pathname) ? 'login_redirect' : 'other_redirect';
      } catch { result.login_classification = 'invalid_redirect'; }
      return { ...result, classification: 'redirect_rejected' };
    }
    const { text, truncated } = await boundedBody(response);
    result.body_truncated = truncated;
    const trimmed = text.trim();
    result.body_format = !trimmed ? 'empty' : /^\s*<(?:!doctype\s+html|html)(?:\s|>)/i.test(trimmed) ? 'html' : trimmed.startsWith('<') ? 'xml' : /^[{[]/.test(trimmed) ? 'json' : 'text';
    const code = text.match(/<resultCode(?:\s[^>]*)?>\s*(\d{1,6})\s*<\/resultCode>/i)?.[1];
    result.result_code = code ?? null;
    result.access_denied = /access\s*denied|accessdenied/i.test(text);
    result.forbidden = /forbidden/i.test(text);
    result.key_rejected = /SERVICE_KEY_IS_NOT_REGISTERED|SERVICE_KEY_IS_NOT_VALID|INVALID_REQUEST_PARAMETER_ERROR|UNREGISTERED_KEY|인증키.*(?:오류|등록|유효)|(?:invalid|unregistered)\s*(?:service\s*)?key/i.test(text) || Boolean(code && ['20','21','22','30','31','32','33'].includes(String(Number(code))));
    return { ...result, classification: truncated ? 'body_limit' : !response.ok ? 'http_error' : code && !['0','00','0000'].includes(code) ? 'api_rejected' : code ? 'api_result' : 'unrecognized_response' };
  } catch (error) {
    return { ...result, classification: ['AbortError', 'TimeoutError'].includes(error?.name) ? 'timeout' : 'fetch_failed' };
  }
}

export async function runDiagnostics(env = process.env, fetchFn = fetch) {
  const results = [];
  for (const kind of ['proxy', 'direct']) results.push(await probeCustoms(kind, env.CUSTOMS_PROXY_BASE, env.CUSTOMS_API_KEY, fetchFn));
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Catch even unexpected setup failures without exposing exception messages.
  runDiagnostics().then(results => { for (const result of results) console.log(JSON.stringify(result)); }).catch(() => { console.log(JSON.stringify({ classification: 'diagnostic_failed' })); process.exitCode = 1; });
}
