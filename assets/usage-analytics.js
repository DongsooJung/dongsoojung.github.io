(() => {
  'use strict';

  const supabaseUrl = 'https://inftexpcnfinglwlrvsj.supabase.co';
  const publishableKey = 'sb_publishable_-D0A-aWNMTMTHXeL0oqBXg_9Tz0bdvs';
  const visitorKey = 'stargateVisitorV3:visitorId';
  const sessionKey = 'stargateUsageV1:sessionId';
  const memory = {};
  let lastClick = { key: '', at: 0 };

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

    record('click', { label, kind, target });
  }, true);

  record('page_view');
})();
