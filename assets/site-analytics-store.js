(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StargateAnalyticsStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function aggregate() {
    const api = globalThis.StargateAnalyticsAggregate;
    if (!api) throw new Error('StargateAnalyticsAggregate is not loaded');
    return api;
  }

  function clip(value, limit) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, limit) : '';
  }

  function optional(value, limit) {
    const text = clip(value, limit);
    return text || null;
  }

  function assertVisitorId(visitorId) {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(String(visitorId || ''))) {
      throw new Error('visitor_id is required');
    }
  }

  function createMemoryBackend() {
    const visits = new Map();
    const events = new Map();
    return {
      async putVisit(id, data) {
        if (visits.has(id)) return false;
        visits.set(id, { ...data });
        return true;
      },
      async putEvent(id, data) {
        if (events.has(id)) return false;
        events.set(id, { ...data });
        return true;
      },
      async listVisits(start, end) {
        return [...visits.values()].filter((row) => row.visitDate >= start && row.visitDate <= end);
      },
      async countVisits() {
        return visits.size;
      },
      async listEvents(start, end) {
        return [...events.values()].filter((row) => row.day >= start && row.day <= end);
      },
      async listPageEvents(pagePath) {
        return [...events.values()].filter((row) => row.pagePath === pagePath);
      },
    };
  }

  function createAnalyticsStore(backend) {
    if (!backend) throw new Error('analytics backend is required');

    async function recordVisit({ visitorId, visitDate, path }, now = new Date()) {
      assertVisitorId(visitorId);
      const today = aggregate().koreaToday(now);
      if (visitDate !== today) throw new Error('visit_date must be the current date in Asia/Seoul');
      const id = `${visitorId}_${visitDate}`;
      return backend.putVisit(id, {
        visitorId,
        visitDate,
        path: clip(path, 512) || '/',
        createdAt: now.toISOString(),
      });
    }

    async function recordEvent(input, now = new Date()) {
      assertVisitorId(input.visitorId);
      if (!/^[A-Za-z0-9-]{8,64}$/.test(String(input.sessionId || ''))) {
        throw new Error('session_id is required');
      }
      const eventType = String(input.eventType || '').trim().toLowerCase();
      if (eventType !== 'page_view' && eventType !== 'click') throw new Error('unsupported event_type');
      const eventId = String(input.eventId || '');
      if (!/^[A-Za-z0-9-]{8,64}$/.test(eventId)) throw new Error('event_id is required');
      const device = ['mobile', 'tablet', 'desktop'].includes(input.deviceType) ? input.deviceType : null;
      return backend.putEvent(eventId, {
        visitorId: input.visitorId,
        sessionId: input.sessionId,
        eventType,
        pagePath: clip(input.pagePath, 512) || '/',
        pageTitle: optional(input.pageTitle, 240),
        elementLabel: optional(input.elementLabel, 160),
        elementKind: optional(input.elementKind, 48),
        targetUrl: optional(input.targetUrl, 1024),
        deviceType: device,
        day: aggregate().koreaToday(now),
        createdAt: now.toISOString(),
      });
    }

    async function getVisitStats(days = 30, now = new Date()) {
      const today = aggregate().koreaToday(now);
      const span = aggregate().clampDays(days);
      const start = aggregate().shiftDate(today, -(span - 1));
      const [rows, total] = await Promise.all([
        backend.listVisits(start, today),
        backend.countVisits(),
      ]);
      return aggregate().aggregateVisitStats({ rows, total, today, days: span });
    }

    async function getUsageStats(days = 30, now = new Date()) {
      const today = aggregate().koreaToday(now);
      const span = aggregate().clampDays(days);
      const start = aggregate().shiftDate(today, -(span - 1));
      const events = await backend.listEvents(start, today);
      return aggregate().aggregateUsageStats(events, { today, days: span });
    }

    async function getButtonClickCounts(pagePath) {
      const path = clip(pagePath, 512) || '/';
      const events = await backend.listPageEvents(path);
      return aggregate().aggregateButtonCounts(events);
    }

    return { recordVisit, recordEvent, getVisitStats, getUsageStats, getButtonClickCounts };
  }

  return { createMemoryBackend, createAnalyticsStore };
});
