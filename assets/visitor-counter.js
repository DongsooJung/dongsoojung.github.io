(() => {
  'use strict';

  const supabaseUrl = 'https://inftexpcnfinglwlrvsj.supabase.co';
  const publishableKey = 'sb_publishable_-D0A-aWNMTMTHXeL0oqBXg_9Tz0bdvs';
  const storagePrefix = 'stargateVisitorV3';
  const summaryLink = document.getElementById('visitor-summary-link');
  const todayElement = document.getElementById('visitor-today-count');
  const totalElement = document.getElementById('visitor-total-count');

  const quickLinks = document.querySelector('.quick-links');

  const hubGrid = document.querySelector('#intelligence .hub-grid');
  if (hubGrid && !hubGrid.querySelector('a[href="/execution/"]')) {
    const executionCard = document.createElement('a');
    executionCard.className = 'hub-card strategy';
    executionCard.href = '/execution/';
    executionCard.setAttribute('aria-label', '2026 Q3 45-Day Execution OS 열기');
    executionCard.innerHTML = `
      <div class="hub-kicker">Q3 Execution · 45 Days</div>
      <h3>2026 Q3 Execution OS</h3>
      <p>8월 15일부터 9월 30일까지 수주·제품·데이터·자동화 KPI와 P0 우선순위를 한 화면에서 관리합니다.</p>
      <div class="hub-meta"><span>Revenue · Proposal · Product · Data · Automation</span><b>실행판 →</b></div>
    `;
    hubGrid.prepend(executionCard);
  }

  if (!summaryLink || !todayElement || !totalElement) return;

  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${publishableKey}`,
    'Content-Type': 'application/json',
  };

  function koreaDay() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function visitorId() {
    let id = localStorage.getItem(`${storagePrefix}:visitorId`);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(`${storagePrefix}:visitorId`, id);
    }
    return id;
  }

  async function rpc(name, payload) {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      cache: 'no-store',
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`${name}_${response.status}`);
    return response.json();
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('ko-KR');
  }

  async function updateSummary() {
    const day = koreaDay();
    const countedKey = `${storagePrefix}:counted:${day}`;

    try {
      if (!localStorage.getItem(countedKey)) {
        await rpc('record_site_visit', {
          p_visitor_id: visitorId(),
          p_visit_date: day,
          p_path: window.location.pathname,
        });
        localStorage.setItem(countedKey, '1');
      }

      const stats = await rpc('get_site_visit_stats', { p_days: 30 });
      todayElement.textContent = formatNumber(stats.today);
      totalElement.textContent = formatNumber(stats.total);
      summaryLink.title = `방문자 통계 · ${day} 한국시간 기준`;
      summaryLink.dataset.state = 'ready';
    } catch (error) {
      console.error('Visitor analytics failed:', error);
      summaryLink.title = '방문자 통계를 불러오지 못했습니다. 클릭하면 연결 상태를 확인할 수 있습니다.';
      summaryLink.dataset.state = 'error';
    }
  }

  updateSummary();
})();