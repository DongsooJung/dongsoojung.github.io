(() => {
  'use strict';

  const storagePrefix = 'stargateVisitorV3';

  const summaryLink = document.getElementById('visitor-summary-link');
  const todayElement = document.getElementById('visitor-today-count');
  const totalElement = document.getElementById('visitor-total-count');

  // Q3 실행판 · 부산 Airbnb 링크는 상단 칩/허브 카드 대신
  // index.html 의 '전략 인사이트' 허브 카드 하위 링크(.hub-sublinks)로 이동했습니다.

  if (!summaryLink || !todayElement || !totalElement) return;

  function analyticsClient() {
    return import('/assets/firebase-site-analytics.js').then((mod) => mod.loadAnalyticsClient());
  }

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

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('ko-KR');
  }

  async function updateSummary() {
    const day = koreaDay();
    const countedKey = `${storagePrefix}:counted:${day}`;

    try {
      const analytics = await analyticsClient();
      if (!localStorage.getItem(countedKey)) {
        await analytics.recordVisit({
          visitorId: visitorId(),
          visitDate: day,
          path: window.location.pathname,
        });
        localStorage.setItem(countedKey, '1');
      }

      const stats = await analytics.getVisitStats(30);
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
