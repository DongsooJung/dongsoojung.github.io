import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../assets/inquiry-source.js', import.meta.url), 'utf8');

function browser({ hostname = 'stargateedu.co.kr', pathname = '/naesin/', title = '내신', cryptoImpl } = {}) {
  class Element {
    constructor() {
      this.dataset = {};
      this.attrs = new Map();
      this.children = [];
      this.textContent = '';
    }
    setAttribute(name, value) {
      this.attrs.set(name, value);
      if (name === 'href') this.href = value;
    }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    matches(selector) { return selector === 'a[href]' && this.tagName === 'A'; }
    closest() { return this; }
    querySelectorAll() { return []; }
  }
  class Anchor extends Element {
    constructor(href, text) {
      super();
      this.tagName = 'A';
      this.textContent = text || '';
      this.setAttribute('href', href);
    }
  }
  const listeners = new Map();
  const storage = new Map();
  const requests = [];
  const gtagEvents = [];
  const anchors = [];
  const asStorage = map => ({
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key),
  });
  const documentElement = new Element();
  documentElement.querySelectorAll = (selector) => selector === 'a[href]' ? anchors : [];
  const document = {
    title,
    readyState: 'complete',
    documentElement,
    head: new Element(),
    body: new Element(),
    addEventListener: (name, listener) => {
      const list = listeners.get(name) || [];
      list.push(listener);
      listeners.set(name, list);
    },
    querySelectorAll: (selector) => documentElement.querySelectorAll(selector),
  };
  const location = {
    hostname,
    pathname,
    href: `https://${hostname}${pathname}`,
    origin: `https://${hostname}`,
  };
  const context = {
    window: { location, document },
    document,
    location,
    URL,
    Uint8Array,
    Array,
    Element,
    HTMLAnchorElement: Anchor,
    MutationObserver: class { observe() {} },
    localStorage: asStorage(storage),
    sessionStorage: asStorage(new Map()),
    matchMedia: () => ({ matches: false }),
    crypto: cryptoImpl === undefined ? { randomUUID: () => '11111111-1111-4111-8111-111111111111' } : cryptoImpl,
    fetch: async (url, options) => {
      requests.push({ url, payload: JSON.parse(options.body), options });
      return { ok: true };
    },
    console: { error() {} },
  };
  context.window.gtag = (command, name, params) => gtagEvents.push({ command, name, params });
  runInNewContext(source, context);
  return { context, anchors, Anchor, requests, gtagEvents, listeners, add(href, text) {
    const anchor = new Anchor(href, text);
    anchors.push(anchor);
    return anchor;
  } };
}

test('kakao inquiry links keep the room path and gain a page utm', () => {
  const env = browser({ pathname: '/zoom-class/' });
  const anchor = env.add('https://open.kakao.com/o/suuKwjTi', '카카오톡 상담');
  env.context.window.StargateInquiry.decorate();
  const url = new URL(anchor.getAttribute('href'));
  assert.equal(url.origin + url.pathname, 'https://open.kakao.com/o/suuKwjTi');
  assert.equal(url.searchParams.get('utm_source'), 'stargateedu');
  assert.equal(url.searchParams.get('utm_medium'), 'kakao');
  assert.equal(url.searchParams.get('utm_campaign'), 'inquiry');
  assert.equal(url.searchParams.get('utm_content'), '/zoom-class/');
  const again = anchor.getAttribute('href');
  env.context.window.StargateInquiry.decorate();
  assert.equal(anchor.getAttribute('href'), again);
});

test('channel chat links are annotated the same way', () => {
  const env = browser({ pathname: '/kakao-send/' });
  const anchor = env.add('https://pf.kakao.com/_wJpen/chat', '채널 상담');
  env.context.window.StargateInquiry.decorate();
  const url = new URL(anchor.getAttribute('href'));
  assert.equal(url.origin + url.pathname, 'https://pf.kakao.com/_wJpen/chat');
  assert.equal(url.searchParams.get('utm_content'), '/kakao-send/');
});

test('mailto keeps the address and existing subject, and adds the page', () => {
  const env = browser({ pathname: '/naesin/' });
  const anchor = env.add('mailto:support@stargateedu.co.kr?subject=%5B%EB%82%B4%EC%8B%A0%20%EC%83%81%EB%8B%B4%5D', '이메일 문의');
  env.context.window.StargateInquiry.decorate();
  const url = new URL(anchor.getAttribute('href'));
  assert.equal(url.pathname, 'support@stargateedu.co.kr');
  assert.equal(url.searchParams.get('subject'), '[내신 상담] | src:/naesin/');
  assert.equal(url.searchParams.get('body'), '문의 경로: https://www.stargateedu.co.kr/naesin/');
  const again = anchor.getAttribute('href');
  env.context.window.StargateInquiry.decorate();
  assert.equal(anchor.getAttribute('href'), again);
});

test('plain mailto and unencoded subjects stay readable', () => {
  const env = browser({ pathname: '/koi-coach/' });
  const plain = env.add('mailto:support@stargateedu.co.kr', '메일');
  const raw = env.add('mailto:support@stargateedu.co.kr?subject=KOI Coach 사전신청&body=안녕하세요', '사전신청');
  env.context.window.StargateInquiry.decorate();
  const plainUrl = new URL(plain.getAttribute('href'));
  assert.equal(plainUrl.searchParams.get('subject'), '문의 | src:/koi-coach/');
  const rawUrl = new URL(raw.getAttribute('href'));
  assert.equal(rawUrl.searchParams.get('subject'), 'KOI Coach 사전신청 | src:/koi-coach/');
  assert.match(rawUrl.searchParams.get('body'), /^안녕하세요\n\n문의 경로: https:\/\/www\.stargateedu\.co\.kr\/koi-coach\/$/);
});

test('index.html paths collapse to the directory', () => {
  const env = browser({ pathname: '/strategy/platform-financial-analysis/index.html' });
  assert.equal(env.context.window.StargateInquiry.pagePath(), '/strategy/platform-financial-analysis/');
});

test('opted-out links are not rewritten', () => {
  const env = browser();
  const anchor = env.add('https://open.kakao.com/o/suuKwjTi');
  anchor.dataset.inquirySource = 'off';
  env.context.window.StargateInquiry.decorate();
  assert.equal(anchor.getAttribute('href'), 'https://open.kakao.com/o/suuKwjTi');
});

test('a click without the usage script records link type and page once', async () => {
  const env = browser({ hostname: 'www.stargateedu.co.kr', pathname: '/global/' });
  const anchor = env.add('mailto:support@stargateedu.co.kr', '기업 문의');
  env.context.window.StargateInquiry.decorate();
  const click = env.listeners.get('click')[0];
  click({ isTrusted: true, target: anchor });
  click({ isTrusted: true, target: anchor });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.requests.length, 1);
  assert.match(env.requests[0].url, /record_site_usage_event$/);
  assert.equal(env.requests[0].payload.p_event_type, 'click');
  assert.equal(env.requests[0].payload.p_element_kind, 'link');
  assert.equal(env.requests[0].payload.p_page_path, '/global/');
  assert.equal(env.requests[0].payload.p_element_label, '기업 문의 · inquiry:email');
  assert.equal(env.requests[0].payload.p_target_url, null);
  assert.equal(env.gtagEvents.length, 2);
  assert.equal(env.gtagEvents[0].name, 'inquiry_click');
  assert.equal(env.gtagEvents[0].params.link_type, 'email');
  assert.equal(env.gtagEvents[0].params.page_path, '/global/');
});

test('kakao click stores the room URL without the query', async () => {
  const env = browser({ hostname: 'stargate.stargate8225.workers.dev', pathname: '/' });
  const anchor = env.add('https://open.kakao.com/o/gp59rISi', '그룹 오픈채팅');
  env.context.window.StargateInquiry.decorate();
  env.listeners.get('click')[0]({ isTrusted: true, target: anchor });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.requests[0].url, '/api/analytics/record_site_usage_event');
  assert.equal(env.requests[0].payload.p_target_url, 'https://open.kakao.com/o/gp59rISi');
  assert.equal(env.requests[0].payload.p_element_label, '그룹 오픈채팅 · inquiry:kakao');
  assert.equal(env.requests[0].payload.p_page_path, '/');
  assert.equal(env.requests[0].options.credentials, 'omit');
  assert.equal(env.requests[0].options.headers.apikey, undefined);
});

test('pages that already record usage do not send a second click', async () => {
  const env = browser({ pathname: '/' });
  env.context.window.StargateUsage = {};
  const anchor = env.add('https://open.kakao.com/o/suuKwjTi', '오픈카톡');
  env.context.window.StargateInquiry.decorate();
  env.listeners.get('click')[0]({ isTrusted: true, target: anchor });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.requests.length, 0);
  assert.equal(env.gtagEvents[0].params.link_type, 'kakao');
  assert.equal(env.gtagEvents[0].params.page_path, '/');
});

test('click ids use web crypto and are skipped when it is missing', async () => {
  assert.doesNotMatch(source, /Math\.random/);
  const secure = browser({
    hostname: 'www.stargateedu.co.kr',
    pathname: '/refund/',
    cryptoImpl: { getRandomValues(bytes) { bytes.fill(7); return bytes; } },
  });
  const secureLink = secure.add('mailto:support@stargateedu.co.kr', '환불 문의');
  secure.context.window.StargateInquiry.decorate();
  secure.listeners.get('click')[0]({ isTrusted: true, target: secureLink });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(secure.requests[0].payload.p_event_id, '07070707-0707-4707-8707-070707070707');

  const insecure = browser({ hostname: 'www.stargateedu.co.kr', pathname: '/refund/', cryptoImpl: {} });
  const link = insecure.add('mailto:support@stargateedu.co.kr', '환불 문의');
  insecure.context.window.StargateInquiry.decorate();
  insecure.listeners.get('click')[0]({ isTrusted: true, target: link });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(insecure.requests.length, 0);
  assert.equal(new URL(link.getAttribute('href')).searchParams.get('subject'), '문의 | src:/refund/');
});

test('dynamic mailto helper used by the stay form includes the page', () => {
  const env = browser({ pathname: '/stay/' });
  const href = env.context.window.StargateInquiry.mailto(
    'support@stargateedu.co.kr',
    'Daechi Stay availability request',
    'Arrival: Friday',
  );
  const url = new URL(href);
  assert.equal(url.pathname, 'support@stargateedu.co.kr');
  assert.equal(url.searchParams.get('subject'), 'Daechi Stay availability request | src:/stay/');
  assert.match(url.searchParams.get('body'), /Arrival: Friday\n\n문의 경로: https:\/\/www\.stargateedu\.co\.kr\/stay\//);
});
