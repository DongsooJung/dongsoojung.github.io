const APP_HOSTS = new Set(['stargateedu.co.kr', 'www.stargateedu.co.kr']);
const AUTH_HOSTS = new Set([
  'kauth.kakao.com',
  'accounts.kakao.com',
  'nid.naver.com',
]);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function isDefaultHttps(url) {
  return url.protocol === 'https:' && (url.port === '' || url.port === '443');
}

function isLocalHost(hostname) {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

function classifyNavigation(rawUrl, options = {}) {
  const devOrigin = options.devOrigin || null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'deny';
  }

  if (isLocalHost(url.hostname)) {
    if (devOrigin && url.origin === devOrigin) return 'app';
    return 'deny';
  }
  if (isDefaultHttps(url) && APP_HOSTS.has(url.hostname)) return 'app';
  if (isDefaultHttps(url) && AUTH_HOSTS.has(url.hostname)) return 'auth';
  if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') {
    return 'external';
  }
  return 'deny';
}

function navigationDecision(rawUrl, options) {
  const kind = classifyNavigation(rawUrl, options);
  if (kind === 'app' || kind === 'auth') return 'allow';
  if (kind === 'external') return 'external';
  return 'deny';
}

module.exports = {
  APP_HOSTS,
  AUTH_HOSTS,
  classifyNavigation,
  navigationDecision,
};
