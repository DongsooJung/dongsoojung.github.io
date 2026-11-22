<!-- Stargate visit alert (owner Kakao notification) -->
<!--
  stargatelearn.com 측정 스크립트 (v2 — 2026-11-22).
  주입 위치: WPCode 스니펫(플러그인 insert-headers-and-footers/ihaf, 활성).
  규칙:
  - 방문자 id 는 기존 방문 기록과 같은 stargateLearnVisitV1:id 를 재사용한다.
  - 워커의 visits PK 가 (visitor_id, visit_date) 이므로 페이지뷰가 늘어도 방문자 집계는 1일 1회다.
  - 애널리틱스 워커는 Origin 헤더로 파티션을 나눈다. 브라우저가 보내는 Origin 이 자동으로 이 사이트 값이 된다.
  - p_page_path 와 p_target_url 은 쿼리·프래그먼트를 제거한 경로만 보낸다(워커가 400 으로 거절한다).
  - mailto: 등 http(s) 가 아닌 목적지는 보내지 않는다.
  - Do Not Track 을 켠 브라우저는 새 이벤트(페이지뷰·클릭)를 보내지 않는다.
-->
<script>
(function () {
  'use strict';
  if (!/^(www\.)?stargatelearn\.com$/.test(location.hostname)) return;

  var VISIT_ENDPOINT = 'https://stargate.stargate8225.workers.dev/api/analytics/record_site_visit';
  var EVENT_ENDPOINT = 'https://stargate.stargate8225.workers.dev/api/analytics/record_site_usage_event';
  var KEY = 'stargateLearnVisitV1';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var MAX_PATH = 512;
  var pending = false, timer, pageViewSent = false;

  function koreaDay() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function get(k) { try { return localStorage.getItem(KEY + ':' + k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(KEY + ':' + k, v); } catch (e) {} }
  function sessionGet(k) { try { return sessionStorage.getItem(KEY + ':' + k); } catch (e) { return null; } }
  function sessionSet(k, v) { try { sessionStorage.setItem(KEY + ':' + k, v); } catch (e) {} }

  // 방문자 id: 기존 방문 기록 스크립트와 같은 값. 이 값을 바꾸면 방문자 집계가 갈라진다.
  function visitorId() {
    var id = get('id');
    if (id && UUID.test(id)) return id;
    if (!window.crypto || !crypto.randomUUID) return null;
    id = crypto.randomUUID();
    set('id', id);
    return id;
  }
  // 세션 id: 탭 하나가 세션 하나.
  function sessionId() {
    var id = sessionGet('session');
    if (id && UUID.test(id)) return id;
    if (!window.crypto || !crypto.randomUUID) return null;
    id = crypto.randomUUID();
    sessionSet('session', id);
    return id;
  }
  function eventId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'e' + Date.now() + '-' + Math.random().toString(16).slice(2, 10);
  }
  function device() {
    return innerWidth <= 620 ? 'mobile' : innerWidth <= 1000 ? 'tablet' : 'desktop';
  }
  // 워커는 쿼리·프래그먼트가 든 경로를 400 으로 거절한다.
  function pathOnly(value) {
    var clean = String(value || '/').split(/[?#]/)[0] || '/';
    if (clean.length > MAX_PATH) clean = '/';
    return clean;
  }
  function measurable() {
    if (navigator.doNotTrack === '1') return false;
    try { if (new URLSearchParams(location.search).get('preview') === '1') return false; } catch (e) {}
    return true;
  }

  // ---- 기존: 하루 한 번 방문 기록 -------------------------------------------
  function schedule() {
    clearTimeout(timer);
    var next = Date.parse(koreaDay() + 'T00:00:00+09:00') + 86400000;
    timer = setTimeout(record, Math.max(1000, next - Date.now() + 1000));
  }
  function record() {
    if (pending || document.visibilityState === 'hidden') return;
    var day = koreaDay();
    var id = visitorId();
    if (!id || get('counted') === day) { schedule(); return; }
    var path = pathOnly(location.pathname);
    pending = true;
    fetch(VISIT_ENDPOINT, {
      method: 'POST', credentials: 'omit', cache: 'no-store', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_visitor_id: id, p_visit_date: day, p_path: path })
    }).then(function (r) { if (r.ok) set('counted', day); })
      .catch(function () {})
      .then(function () { pending = false; schedule(); });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') record();
  });

  // ---- 추가: 페이지뷰·클릭 --------------------------------------------------
  function sendEvent(payload) {
    try {
      fetch(EVENT_ENDPOINT, {
        method: 'POST', credentials: 'omit', cache: 'no-store', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) { /* 측정은 콘텐츠를 막지 않는다. */ }
  }
  function basePayload(type) {
    var visitor = visitorId();
    var session = sessionId();
    if (!visitor || !session) return null;
    return {
      p_event_id: eventId(),
      p_visitor_id: visitor,
      p_session_id: session,
      p_event_type: type,
      p_page_path: pathOnly(location.pathname),
      p_page_title: (document.title || 'Stargate Learn').slice(0, 200),
      p_device_type: device()
    };
  }
  function trackPageView() {
    if (pageViewSent || !measurable()) return;
    pageViewSent = true;
    var payload = basePayload('page_view');
    if (!payload) return;
    payload.p_element_label = 'page_view';
    payload.p_element_kind = 'page';
    payload.p_target_url = null;
    sendEvent(payload);
  }
  // 같은 사이트 안의 링크는 상대 경로, 다른 사이트는 origin + 경로만 보낸다.
  function linkTarget(link) {
    if (!link) return null;
    var raw = (link.getAttribute && link.getAttribute('href') || '').trim();
    if (!raw || raw.charAt(0) === '#') return null;
    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return null; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    var target = url.origin === location.origin ? url.pathname : url.origin + url.pathname;
    if (!target) return null;
    if (target.length > MAX_PATH) target = '/';
    return target;
  }
  // 폼 제출도 다음 단계다. 이메일 구독(무료 등록) 버튼은 <a> 가 아니라
  // <button type="submit"> 이므로 링크 클릭 리스너로는 절대 잡히지 않는다.
  // 폼의 action 주소만 읽는다. 입력값(이메일 등)은 절대 보내지 않는다.
  function formTarget(form) {
    if (!form) return null;
    var action = (form.getAttribute && form.getAttribute('action')) || '';
    if (!action) return null;
    var url;
    try { url = new URL(action, location.href); } catch (e) { return null; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    var target = url.origin === location.origin ? url.pathname : url.origin + url.pathname;
    if (!target) return null;
    if (target.length > MAX_PATH) target = '/';
    return target;
  }
  function trackClick(event) {
    if (!measurable()) return;
    var node = event.target;
    var link = null;
    if (node && node.closest) link = node.closest('a[href]');
    if (!link) return;
    var target = linkTarget(link);
    if (!target) return;
    var payload = basePayload('click');
    if (!payload) return;
    payload.p_element_label = 'link_click';
    payload.p_element_kind = 'link';
    payload.p_target_url = target;
    sendEvent(payload);
  }
  function trackSubmit(event) {
    if (!measurable()) return;
    var form = event.target;
    if (!form || String(form.tagName || '').toLowerCase() !== 'form') return;
    var target = formTarget(form);
    if (!target) return;
    var payload = basePayload('click');
    if (!payload) return;
    payload.p_element_label = 'form_submit';
    payload.p_element_kind = 'form';
    payload.p_target_url = target;
    sendEvent(payload);
  }

  document.addEventListener('click', trackClick, true);
  document.addEventListener('submit', trackSubmit, true);
  trackPageView();
  record();
})();
</script>
