const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyNavigation, navigationDecision } = require('./navigation-policy');

const dev = { devOrigin: 'http://127.0.0.1:47321' };

test('포털과 로그인 호스트는 창 안에 둔다', () => {
  assert.equal(classifyNavigation('https://stargateedu.co.kr/research/'), 'app');
  assert.equal(classifyNavigation('https://www.stargateedu.co.kr/'), 'app');
  assert.equal(classifyNavigation('https://nid.naver.com/oauth2/authorize'), 'auth');
  assert.equal(classifyNavigation('https://kauth.kakao.com/oauth/authorize'), 'auth');
  assert.equal(classifyNavigation('https://accounts.kakao.com/login'), 'auth');
  assert.equal(navigationDecision('https://stargateedu.co.kr/consult/'), 'allow');
});

test('다른 포트와 비슷한 도메인은 포털로 보지 않는다', () => {
  assert.equal(classifyNavigation('https://stargateedu.co.kr:8443/'), 'external');
  assert.equal(classifyNavigation('http://stargateedu.co.kr/'), 'external');
  assert.equal(classifyNavigation('https://stargateedu.co.kr.attacker.example/'), 'external');
  assert.equal(classifyNavigation('https://play.google.com/store/apps/details?id=kr.co.stargateedu.twa'), 'external');
  assert.equal(navigationDecision('mailto:support@stargateedu.co.kr'), 'external');
});

test('개발 서버만 로컬 탐색을 허용한다', () => {
  assert.equal(classifyNavigation('http://127.0.0.1:47321/research/', dev), 'app');
  assert.equal(classifyNavigation('http://127.0.0.1:47321/research/'), 'deny');
  assert.equal(classifyNavigation('http://127.0.0.1:9/', dev), 'deny');
  assert.equal(classifyNavigation('http://localhost:47321/', dev), 'deny');
  assert.equal(navigationDecision('file:///etc/passwd'), 'deny');
  assert.equal(navigationDecision('javascript:alert(1)'), 'deny');
  assert.equal(navigationDecision('data:text/html,hi'), 'deny');
});
