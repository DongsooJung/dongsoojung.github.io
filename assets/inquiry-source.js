// 문의 링크에 페이지 출처를 남깁니다.
// 카카오 오픈채팅·채널 URL에는 페이지 경로를 utm_content로 붙입니다. 카카오 웹 페이지는 이 쿼리를 무시하고 같은 방으로 연결합니다.
// 메일 제목에는 src:경로, 본문에는 문의 경로 URL을 넣습니다.
(() => {
  'use strict';

  const KAKAO_HOSTS = new Set(['open.kakao.com', 'pf.kakao.com']);
  const CANONICAL_ORIGIN = 'https://www.stargateedu.co.kr';
  const CLOUDFLARE_HOSTS = new Set(['stargateedu.co.kr', 'www.stargateedu.co.kr', 'www.stargatekorea.net', 'stargate.stargate8225.workers.dev']);
  const CLOUDFLARE_ORIGIN = 'https://stargate.stargate8225.workers.dev';
  const SUPABASE_URL = 'https://inftexpcnfinglwlrvsj.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_-D0A-aWNMTMTHXeL0oqBXg_9Tz0bdvs';

  function pagePath() {
    let path = String(window.location?.pathname || '/');
    path = path.replace(/\/index\.html$/i, '/').replace(/[\u0000-\u001f]/g, '');
    if (!path.startsWith('/') || path.startsWith('//')) path = '/';
    return path.slice(0, 180) || '/';
  }

  function parseUrl(href) {
    try { return new URL(href, window.location?.href || `${CANONICAL_ORIGIN}/`); }
    catch { return null; }
  }

  function kind(href) {
    const url = parseUrl(href);
    if (!url) return null;
    if (url.protocol === 'mailto:') return 'email';
    if (url.protocol === 'https:' && KAKAO_HOSTS.has(url.hostname)) return 'kakao';
    return null;
  }

  function sourceLine(page) {
    return `문의 경로: ${CANONICAL_ORIGIN}${page}`;
  }

  function annotate(href, page = pagePath()) {
    const type = kind(href);
    const url = parseUrl(href);
    if (!type || !url) return href;
    if (type === 'kakao') {
      if (url.searchParams.get('utm_source') === 'stargateedu'
        && url.searchParams.get('utm_medium') === 'kakao'
        && url.searchParams.get('utm_campaign') === 'inquiry'
        && url.searchParams.get('utm_content') === page) return href;
      url.searchParams.set('utm_source', 'stargateedu');
      url.searchParams.set('utm_medium', 'kakao');
      url.searchParams.set('utm_campaign', 'inquiry');
      url.searchParams.set('utm_content', page);
      return url.toString();
    }
    const marker = `src:${page}`;
    const subject = url.searchParams.get('subject') || '';
    const body = url.searchParams.get('body') || '';
    const line = sourceLine(page);
    if (subject.includes(marker) && body.includes(line)) return href;
    if (!subject.includes(marker)) url.searchParams.set('subject', subject ? `${subject} | ${marker}` : `문의 | ${marker}`);
    if (!body.includes(line)) url.searchParams.set('body', body ? `${body}\n\n${line}` : line);
    return url.toString();
  }

  function mailto(address, subject, body, page = pagePath()) {
    const url = new URL(`mailto:${address}`);
    if (subject) url.searchParams.set('subject', subject);
    if (body) url.searchParams.set('body', body);
    return annotate(url.toString(), page);
  }

  function bareText(value, limit) {
    return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
  }

  function anchorLabel(anchor) {
    return bareText(anchor.dataset?.analyticsLabel || anchor.getAttribute?.('aria-label') || anchor.getAttribute?.('title') || anchor.textContent, 140);
  }

  function decorate(root = document) {
    if (!root) return;
    const nodes = [];
    if (typeof root.matches === 'function' && root.matches('a[href]')) nodes.push(root);
    if (typeof root.querySelectorAll === 'function') nodes.push(...root.querySelectorAll('a[href]'));
    nodes.forEach((anchor) => {
      if (anchor.dataset?.inquirySource === 'off') return;
      const raw = anchor.getAttribute('href');
      const type = kind(raw);
      if (!type) return;
      const page = pagePath();
      const next = annotate(raw, page);
      anchor.dataset.inquiryType = type;
      anchor.dataset.inquiryPage = page;
      if (next && next !== raw) anchor.setAttribute('href', next);
    });
  }

  function uuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const value = Math.floor(Math.random() * 16);
      return (char === 'x' ? value : (value & 3) | 8).toString(16);
    });
  }

  function storedId(storage, key) {
    try {
      let value = storage.getItem(key);
      if (!value) {
        value = uuid();
        storage.setItem(key, value);
      }
      return value;
    } catch (_) {
      return uuid();
    }
  }

  function deviceType() {
    try {
      if (matchMedia('(max-width: 520px)').matches) return 'mobile';
      if (matchMedia('(max-width: 980px)').matches) return 'tablet';
    } catch (_) {}
    return 'desktop';
  }

  function targetFor(type, href) {
    if (type !== 'kakao') return null;
    const url = parseUrl(href);
    if (!url) return null;
    return `${url.origin}${url.pathname}`.slice(0, 1024);
  }

  // 사용 분석 스크립트가 이미 클릭을 기록하는 페이지에서는 같은 클릭을 다시 보내지 않습니다.
  function recordClick(type, page, label, href) {
    const host = window.location.hostname;
    if (window.StargateUsage || !host || host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return;
    const cloudflare = CLOUDFLARE_HOSTS.has(host);
    const endpoint = cloudflare
      ? `${window.location.origin === CLOUDFLARE_ORIGIN ? '' : CLOUDFLARE_ORIGIN}/api/analytics/record_site_usage_event`
      : `${SUPABASE_URL}/rest/v1/rpc/record_site_usage_event`;
    const headers = cloudflare
      ? { 'Content-Type': 'application/json', Accept: 'application/json' }
      : { 'Content-Type': 'application/json', Accept: 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    const visitorKey = cloudflare ? 'stargateCloudflareVisitorV1:visitorId' : 'stargateVisitorV3:visitorId';
    const sessionKey = cloudflare ? 'stargateCloudflareUsageV1:sessionId' : 'stargateUsageV1:sessionId';
    const payload = {
      p_event_id: uuid(),
      p_visitor_id: storedId(localStorage, visitorKey),
      p_session_id: storedId(sessionStorage, sessionKey),
      p_event_type: 'click',
      p_page_path: page,
      p_page_title: bareText(document.title, 240) || null,
      p_element_label: bareText(label ? `${label} · inquiry:${type}` : `inquiry:${type}`, 160) || null,
      p_element_kind: 'link',
      p_target_url: targetFor(type, href),
      p_device_type: deviceType(),
    };
    fetch(endpoint, { method: 'POST', cache: 'no-store', credentials: 'omit', keepalive: true, headers, body: JSON.stringify(payload) }).catch(() => {});
  }

  let lastTrack = { key: '', at: 0 };
  function track(type, href, label) {
    if (type !== 'kakao' && type !== 'email') return;
    const page = pagePath();
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'inquiry_click', { link_type: type, page_path: page });
    }
    const key = `${page}|${type}|${href || ''}|${label || ''}`;
    const now = Date.now();
    if (lastTrack.key === key && now - lastTrack.at < 500) return;
    lastTrack = { key, at: now };
    recordClick(type, page, label || '', href || '');
  }

  function onClick(event) {
    if (!event.isTrusted) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || anchor.dataset?.inquirySource === 'off' || anchor.matches?.('[data-analytics-ignore]')) return;
    const type = anchor.dataset.inquiryType || kind(anchor.getAttribute('href'));
    if (!type) return;
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'inquiry_click', { link_type: type, page_path: anchor.dataset.inquiryPage || pagePath() });
    }
    if (window.StargateUsage) return;
    const href = anchor.getAttribute('href');
    const key = `${pagePath()}|${type}|${href || ''}`;
    const now = Date.now();
    if (lastTrack.key === key && now - lastTrack.at < 500) return;
    lastTrack = { key, at: now };
    recordClick(type, pagePath(), anchorLabel(anchor), href);
  }

  window.StargateInquiry = { pagePath, kind, annotate, mailto, decorate, track };

  function start() {
    if (!document.documentElement || typeof document.addEventListener !== 'function') return;
    decorate();
    document.addEventListener('click', onClick, true);
    if (typeof MutationObserver !== 'function') return;
    let writing = false;
    new MutationObserver((mutations) => {
      if (writing) return;
      writing = true;
      try {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes') {
            if (mutation.target instanceof Element) decorate(mutation.target);
            return;
          }
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) decorate(node);
          });
        });
      } finally {
        writing = false;
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
