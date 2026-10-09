const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { _private } = require('./api/send');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function openPage(hostname, search = '') {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'page script exists');
  const nodes = Object.fromEntries([
    'status-box', 'status-title', 'status-detail', 'login-panel', 'login-label',
    'send-form', 'logout-button', 'send-button', 'message', 'message-count',
    'notice', 'privacy-copy', 'static-handoff',
  ].map((id) => [id, {
    hidden: ['login-panel', 'send-form', 'logout-button', 'static-handoff'].includes(id),
    dataset: {},
    addEventListener() {},
  }]));
  const calls = [];
  vm.runInNewContext(script, {
    document: { querySelector: (selector) => nodes[selector.slice(1)] },
    location: { hostname, search, pathname: '/kakao-send/' },
    history: { replaceState() {} },
    URLSearchParams,
    fetch: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => ({ authenticated: false }) };
    },
  });
  return { nodes, calls };
}

test('send input uses a registered fixed link', () => {
  const result = _private.validate({ message: '테스트', linkUrl: 'https://example.com/' });
  assert.equal(result.text, '테스트');
  assert.equal(result.linkUrl, 'https://stargateedu.co.kr/');
});

test('send input rejects empty and oversized messages', () => {
  assert.match(_private.validate({ message: '' }).error, /1자/);
  assert.match(_private.validate({ message: '가'.repeat(201) }).error, /200자/);
});

test('Kakao consent errors expose a re-consent code', () => {
  const result = _private.mapKakaoError({ code: -402, required_scopes: ['talk_message'] }, 403);
  assert.equal(result.code, 'KAKAO_CONSENT_REQUIRED');
  assert.equal(result.status, 403);
});

test('static site shows the Vercel app link without calling local APIs', () => {
  assert.match(html, /id="static-handoff" hidden>[\s\S]*?href="https:\/\/stargate-kakao-send\.vercel\.app\/"/);
  assert.match(html, /<noscript>[\s\S]*?https:\/\/stargate-kakao-send\.vercel\.app\//);
  for (const hostname of ['stargateedu.co.kr', 'www.stargateedu.co.kr']) {
    const { nodes, calls } = openPage(hostname);
    assert.equal(nodes['static-handoff'].hidden, false);
    assert.equal(nodes['status-box'].hidden, true);
    assert.equal(nodes['login-panel'].hidden, true);
    assert.equal(nodes['send-form'].hidden, true);
    assert.deepEqual(calls, []);
  }
  assert.doesNotMatch(html, /kakao_js_sdk|Kakao\.Auth|Kakao\.API|LEGACY_JS_KEY/);
});

test('Vercel app keeps its server login and session paths', async () => {
  assert.match(html, /id="login-button" href="\/api\/auth\/login"/);
  const { nodes, calls } = openPage('stargate-kakao-send.vercel.app');
  await new Promise(setImmediate);
  assert.equal(nodes['static-handoff'].hidden, true);
  assert.equal(nodes['status-box'].hidden, false);
  assert.equal(nodes['login-panel'].hidden, false);
  assert.deepEqual(calls, ['/api/session']);
  assert.match(html, /fetch\('\/api\/send'/);
  assert.match(html, /fetch\('\/api\/logout'/);
});

test('OAuth callback errors stay on the server login path', () => {
  const { nodes, calls } = openPage('stargate-kakao-send.vercel.app', '?auth=client_secret_error');
  assert.equal(nodes['login-panel'].hidden, false);
  assert.match(nodes['status-detail'].textContent, /서버 설정 문제로 로그인을 완료할 수 없습니다/);
  assert.doesNotMatch(nodes['status-detail'].textContent, /다시 시도/);
  assert.deepEqual(calls, []);
});
