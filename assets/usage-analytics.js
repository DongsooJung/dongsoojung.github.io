(() => {
  'use strict';

  const supabaseUrl = 'https://inftexpcnfinglwlrvsj.supabase.co';
  const publishableKey = 'sb_publishable_-D0A-aWNMTMTHXeL0oqBXg_9Tz0bdvs';
  const visitorKey = 'stargateVisitorV3:visitorId';
  const sessionKey = 'stargateUsageV1:sessionId';
  const displaySelector = [
    'button',
    'a.btn',
    'a.button',
    'a.compact-button',
    'a.text-link',
    'a.back',
    'a.chip',
    'a.hub-card',
    'a.proj',
    'a.project',
    'a.company',
    'a.topic',
    'a.switch-link',
    'a.home',
    '.card-actions a',
    '.newsletter a',
  ].join(',');
  const memory = {};
  const clickCounts = new Map();
  const pageViews = new Map();
  const listeners = new Set();
  let lastClick = { key: '', at: 0 };
  let usageReadyResolve;
  const usageReady = new Promise((resolve) => { usageReadyResolve = resolve; });

  function uuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const value = Math.floor(Math.random() * 16);
      return (char === 'x' ? value : (value & 3) | 8).toString(16);
    });
  }

  function storedId(storage, key, fallbackKey) {
    try {
      let value = storage.getItem(key);
      if (!value) {
        value = uuid();
        storage.setItem(key, value);
      }
      return value;
    } catch (_) {
      memory[fallbackKey] ||= uuid();
      return memory[fallbackKey];
    }
  }

  function compact(value, limit) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit) || null;
  }

  function pagePath() {
    return compact(window.location.pathname || '/', 512) || '/';
  }

  function targetUrl(element) {
    if (!(element instanceof HTMLAnchorElement)) return null;
    try {
      const url = new URL(element.href, window.location.href);
      const path = url.pathname.slice(0, 1024);
      return url.origin === window.location.origin ? path : `${url.origin}${path}`.slice(0, 1024);
    } catch (_) {
      return compact(element.getAttribute('href'), 1024);
    }
  }

  function elementLabel(element) {
    const explicit = element.dataset.analyticsLabel || element.getAttribute('aria-label') || element.title;
    if (explicit) return compact(explicit, 160);

    const heading = element.querySelector?.('h1,h2,h3,.ttl,.nm,.project-title,.hub-kicker');
    if (heading?.textContent) return compact(heading.textContent, 160);

    return compact(element.innerText || element.textContent || element.value, 160);
  }

  function deviceType() {
    if (matchMedia('(max-width: 520px)').matches) return 'mobile';
    if (matchMedia('(max-width: 980px)').matches) return 'tablet';
    return 'desktop';
  }

  function countKey(label, target) {
    return `${label || ''}|${target || ''}`;
  }

  function injectCountStyle() {
    if (document.getElementById('stargate-click-count-style')) return;
    const style = document.createElement('style');
    style.id = 'stargate-click-count-style';
    style.textContent = `
      .stargate-analytics-counted{position:relative!important}
      .stargate-click-count{position:absolute;z-index:9;top:4px;right:4px;display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 5px;border:1px solid rgba(255,255,255,.3);border-radius:999px;background:rgba(8,13,24,.82);color:#fff;font:700 9px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0;box-shadow:0 2px 8px rgba(0,0,0,.24);pointer-events:none;font-variant-numeric:tabular-nums}
      :root[data-theme="light"] .stargate-click-count,:root[data-theme="mono"] .stargate-click-count{border-color:rgba(23,32,51,.2);background:rgba(255,255,255,.92);color:#172033;box-shadow:0 2px 8px rgba(41,61,92,.16)}
    `;
    document.head.append(style);
  }

  function countableElements(root = document) {
    const elements = [];
    if (root instanceof Element && root.matches(displaySelector)) elements.push(root);
    if (root.querySelectorAll) elements.push(...root.querySelectorAll(displaySelector));
    return elements;
  }

  function decorateCounts(root = document) {
    countableElements(root).forEach((element) => {
      if (element.matches('[data-analytics-ignore]')) return;
      const label = elementLabel(element);
      if (!label) return;
      element.dataset.analyticsLabel = label;
      const target = targetUrl(element);
      const count = clickCounts.get(countKey(label, target)) || 0;
      let badge = element.querySelector(':scope > .stargate-click-count');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'stargate-click-count';
        badge.setAttribute('aria-hidden', 'true');
        element.append(badge);
      }
      badge.textContent = Number(count).toLocaleString('ko-KR');
      badge.title = `누적 클릭 ${Number(count).toLocaleString('ko-KR')}회`;
      element.classList.add('stargate-analytics-counted');
    });
  }

  function notifyUsage() {
    listeners.forEach((listener) => {
      try { listener(); } catch (_) {}
    });
    document.dispatchEvent(new CustomEvent('stargate-usage-updated'));
  }

  function incrementVisibleCount(element) {
    if (!element.matches(displaySelector)) return;
    const label = element.dataset.analyticsLabel || elementLabel(element);
    const target = targetUrl(element);
    const key = countKey(label, target);
    clickCounts.set(key, (clickCounts.get(key) || 0) + 1);
    decorateCounts(element);
  }

  function normalizeUsagePath(value) {
    try {
      const url = new URL(value, window.location.href);
      const path = url.pathname || '/';
      if (path === '/') return '/';
      return path.replace(/\/+$/, '') + '/';
    } catch (_) {
      const path = compact(value, 512) || '/';
      if (path === '/') return '/';
      return path.replace(/\/+$/, '') + '/';
    }
  }

  function isPortalProjectPath(url) {
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'stargateedu.co.kr' || host === location.hostname.replace(/^www\./i, '').toLowerCase();
  }

  function clickCountFor(element) {
    if (!(element instanceof Element)) return 0;
    const label = element.dataset.analyticsLabel || elementLabel(element);
    const target = targetUrl(element);
    return Number(clickCounts.get(countKey(label, target))) || 0;
  }

  function pageViewsFor(element) {
    if (!(element instanceof HTMLAnchorElement)) return 0;
    try {
      const url = new URL(element.href, window.location.href);
      if (!isPortalProjectPath(url)) return 0;
      const path = normalizeUsagePath(url.pathname);
      if (path === '/') return 0;
      return Number(pageViews.get(path) || pageViews.get(path.replace(/\/$/, ''))) || 0;
    } catch (_) {
      return 0;
    }
  }

  function usageFor(element) {
    return Math.max(pageViewsFor(element), clickCountFor(element));
  }

  async function loadClickCounts() {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_site_button_click_counts`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_page_path: pagePath() }),
      });
      if (!response.ok) return;
      const rows = await response.json();
      if (!Array.isArray(rows)) return;
      rows.forEach((row) => clickCounts.set(
        countKey(compact(row.element_label, 160), compact(row.target_url, 1024)),
        Number(row.clicks) || 0,
      ));
      decorateCounts();
    } catch (_) {}
  }

  async function loadPageViews() {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_site_usage_stats`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_days: 30 }),
      });
      if (!response.ok) return;
      const data = await response.json();
      const pages = Array.isArray(data?.pages) ? data.pages : [];
      pages.forEach((row) => {
        const path = normalizeUsagePath(row.page_path);
        const views = Number(row.page_views) || 0;
        pageViews.set(path, views);
        if (path !== '/') pageViews.set(path.replace(/\/$/, ''), views);
      });
    } catch (_) {}
  }

  function record(eventType, detail = {}) {
    const payload = {
      p_event_id: uuid(),
      p_visitor_id: storedId(localStorage, visitorKey, 'visitorId'),
      p_session_id: storedId(sessionStorage, sessionKey, 'sessionId'),
      p_event_type: eventType,
      p_page_path: pagePath(),
      p_page_title: compact(document.title, 240),
      p_element_label: compact(detail.label, 160),
      p_element_kind: compact(detail.kind, 48),
      p_target_url: compact(detail.target, 1024),
      p_device_type: deviceType(),
    };

    fetch(`${supabaseUrl}/rest/v1/rpc/record_site_usage_event`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      keepalive: eventType === 'click',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  function clickableFrom(event) {
    if (!(event.target instanceof Element)) return null;
    return event.target.closest('a[href],button,[role="button"],[data-track-click]');
  }

  document.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const element = clickableFrom(event);
    if (!element || element.matches('[data-analytics-ignore]')) return;

    const label = elementLabel(element);
    const target = targetUrl(element);
    const kind = element.tagName.toLowerCase() === 'a' ? 'link' : 'button';
    const key = `${pagePath()}|${kind}|${label || ''}|${target || ''}`;
    const now = Date.now();
    if (lastClick.key === key && now - lastClick.at < 500) return;
    lastClick = { key, at: now };

    incrementVisibleCount(element);
    record('click', { label, kind, target });
  }, true);

  window.StargateUsage = {
    usageFor,
    clickCountFor,
    pageViewsFor,
    whenReady: () => usageReady,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  injectCountStyle();
  decorateCounts();
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (node instanceof Element) decorateCounts(node);
    }));
  }).observe(document.body, { childList: true, subtree: true });
  Promise.all([loadClickCounts(), loadPageViews()]).finally(() => {
    usageReadyResolve();
    notifyUsage();
  });
  record('page_view');
})();
