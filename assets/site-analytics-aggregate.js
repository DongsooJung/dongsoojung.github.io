(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StargateAnalyticsAggregate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function koreaToday(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function shiftDate(isoDate, delta) {
    const [year, month, day] = String(isoDate).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
  }

  function clampDays(days) {
    const value = Number(days);
    if (!Number.isFinite(value)) return 30;
    return Math.max(1, Math.min(Math.trunc(value), 90));
  }

  function dateRange(today, days) {
    const span = clampDays(days);
    const dates = [];
    for (let offset = span - 1; offset >= 0; offset -= 1) dates.push(shiftDate(today, -offset));
    return dates;
  }

  function roundRate(part, whole) {
    if (!whole) return 0;
    return Math.round((Number(part) / Number(whole)) * 1000) / 10;
  }

  function compareText(left, right) {
    const a = left || '';
    const b = right || '';
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  function aggregateVisitStats({ rows, total, today, days }) {
    const dates = dateRange(today, days);
    const counts = new Map(dates.map((date) => [date, 0]));
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!counts.has(row.visitDate)) return;
      counts.set(row.visitDate, (counts.get(row.visitDate) || 0) + 1);
    });
    const daily = dates.map((date) => ({ date, visits: counts.get(date) || 0 }));
    const todayRow = daily.find((row) => row.date === today);
    return {
      today: todayRow ? todayRow.visits : 0,
      total: Number(total) || 0,
      period: daily.reduce((sum, row) => sum + row.visits, 0),
      daily,
    };
  }

  function aggregateUsageStats(events, { today, days }) {
    const dates = dateRange(today, days);
    const rows = Array.isArray(events) ? events : [];
    const dailyMap = new Map(dates.map((date) => [date, {
      pageViews: 0,
      clicks: 0,
      visitors: new Set(),
      clickers: new Set(),
    }]));
    const pages = new Map();
    const buttons = new Map();
    const visitors = new Set();
    const clickers = new Set();
    const sessions = new Set();
    let pageViews = 0;
    let clicks = 0;

    rows.forEach((event) => {
      const day = dailyMap.get(event.day);
      const type = event.eventType;
      if (event.sessionId) sessions.add(event.sessionId);
      if (type === 'page_view') {
        pageViews += 1;
        if (event.visitorId) visitors.add(event.visitorId);
        if (day) {
          day.pageViews += 1;
          if (event.visitorId) day.visitors.add(event.visitorId);
        }
      } else if (type === 'click') {
        clicks += 1;
        if (event.visitorId) clickers.add(event.visitorId);
        if (day) {
          day.clicks += 1;
          if (event.visitorId) day.clickers.add(event.visitorId);
        }
      }

      const pageKey = event.pagePath || '/';
      if (!pages.has(pageKey)) {
        pages.set(pageKey, { pageViews: 0, clicks: 0, visitors: new Set(), clickers: new Set() });
      }
      const page = pages.get(pageKey);
      if (type === 'page_view') {
        page.pageViews += 1;
        if (event.visitorId) page.visitors.add(event.visitorId);
      } else if (type === 'click') {
        page.clicks += 1;
        if (event.visitorId) page.clickers.add(event.visitorId);
        const label = event.elementLabel || '(이름 없는 버튼)';
        const buttonKey = `${pageKey}\n${label}\n${event.targetUrl || ''}`;
        if (!buttons.has(buttonKey)) {
          buttons.set(buttonKey, {
            page_path: pageKey,
            element_label: label,
            target_url: event.targetUrl || null,
            clicks: 0,
            clickers: new Set(),
          });
        }
        const button = buttons.get(buttonKey);
        button.clicks += 1;
        if (event.visitorId) button.clickers.add(event.visitorId);
      }
    });

    const pageRows = [...pages.entries()].map(([pagePath, page]) => ({
      page_path: pagePath,
      page_views: page.pageViews,
      clicks: page.clicks,
      visitors: page.visitors.size,
      clicking_visitors: page.clickers.size,
      engagement_rate: roundRate(page.clickers.size, page.visitors.size),
    })).sort((a, b) => (
      (b.clicks - a.clicks)
      || (b.page_views - a.page_views)
      || compareText(a.page_path, b.page_path)
    ));

    const buttonRows = [...buttons.values()].map((button) => ({
      page_path: button.page_path,
      element_label: button.element_label,
      target_url: button.target_url,
      clicks: button.clicks,
      clicking_visitors: button.clickers.size,
    })).sort((a, b) => (
      (b.clicks - a.clicks)
      || compareText(a.page_path, b.page_path)
      || compareText(a.element_label, b.element_label)
    )).slice(0, 100);

    return {
      days: dates.length,
      page_views: pageViews,
      clicks,
      visitors: visitors.size,
      clicking_visitors: clickers.size,
      sessions: sessions.size,
      engagement_rate: roundRate(clickers.size, visitors.size),
      daily: dates.map((date) => {
        const day = dailyMap.get(date);
        return {
          date,
          page_views: day.pageViews,
          clicks: day.clicks,
          visitors: day.visitors.size,
          clicking_visitors: day.clickers.size,
          engagement_rate: roundRate(day.clickers.size, day.visitors.size),
        };
      }),
      pages: pageRows,
      buttons: buttonRows,
    };
  }

  function aggregateButtonCounts(events) {
    const groups = new Map();
    (Array.isArray(events) ? events : []).forEach((event) => {
      if (event.eventType !== 'click') return;
      const label = event.elementLabel || '(이름 없는 버튼)';
      const target = event.targetUrl || null;
      const key = `${label}\n${target || ''}`;
      if (!groups.has(key)) groups.set(key, { element_label: label, target_url: target, clicks: 0 });
      groups.get(key).clicks += 1;
    });
    return [...groups.values()]
      .sort((a, b) => (b.clicks - a.clicks) || compareText(a.element_label, b.element_label) || compareText(a.target_url, b.target_url))
      .slice(0, 500);
  }

  return {
    koreaToday,
    shiftDate,
    clampDays,
    aggregateVisitStats,
    aggregateUsageStats,
    aggregateButtonCounts,
  };
});
