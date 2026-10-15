import assert from 'node:assert/strict';
import '../assets/site-analytics-aggregate.js';
import '../assets/site-analytics-store.js';

const { aggregateVisitStats, aggregateUsageStats, aggregateButtonCounts, koreaToday } = globalThis.StargateAnalyticsAggregate;
const { createAnalyticsStore, createMemoryBackend } = globalThis.StargateAnalyticsStore;

const now = new Date('2026-10-15T03:00:00Z');
const today = koreaToday(now);
assert.equal(today, '2026-10-15');

const store = createAnalyticsStore(createMemoryBackend());
const visitor = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const session = '33333333-3333-4333-8333-333333333333';

assert.equal(await store.recordVisit({ visitorId: visitor, visitDate: today, path: '/' }, now), true);
assert.equal(await store.recordVisit({ visitorId: visitor, visitDate: today, path: '/' }, now), false);
await store.recordVisit({ visitorId: other, visitDate: today, path: '/research/' }, now);
await assert.rejects(
  () => store.recordVisit({ visitorId: visitor, visitDate: '2026-10-14', path: '/' }, now),
  /visit_date/,
);

const yesterday = new Date('2026-10-14T03:00:00Z');
await store.recordVisit({ visitorId: visitor, visitDate: '2026-10-14', path: '/strategy/' }, yesterday);

const visits = await store.getVisitStats(30, now);
assert.equal(visits.today, 2);
assert.equal(visits.total, 3);
assert.equal(visits.period, 3);
assert.equal(visits.daily.length, 30);
assert.equal(visits.daily.at(-1).date, '2026-10-15');
assert.equal(visits.daily.at(-1).visits, 2);
assert.equal(visits.daily.at(-2).visits, 1);
assert.equal(visits.daily[0].visits, 0);

await store.recordEvent({
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  visitorId: visitor,
  sessionId: session,
  eventType: 'page_view',
  pagePath: '/',
  pageTitle: '홈',
  deviceType: 'desktop',
}, now);
await store.recordEvent({
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  visitorId: other,
  sessionId: '44444444-4444-4444-8444-444444444444',
  eventType: 'page_view',
  pagePath: '/',
  deviceType: 'mobile',
}, now);
await store.recordEvent({
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  visitorId: visitor,
  sessionId: session,
  eventType: 'click',
  pagePath: '/',
  elementLabel: '전략',
  elementKind: 'link',
  targetUrl: '/strategy/',
  deviceType: 'desktop',
}, now);
await store.recordEvent({
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  visitorId: visitor,
  sessionId: session,
  eventType: 'click',
  pagePath: '/',
  elementLabel: '전략',
  targetUrl: '/strategy/',
}, now);
await store.recordEvent({
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
  visitorId: other,
  sessionId: '44444444-4444-4444-8444-444444444444',
  eventType: 'page_view',
  pagePath: '/strategy/',
}, now);

const usage = await store.getUsageStats(30, now);
assert.equal(usage.page_views, 3);
assert.equal(usage.clicks, 1);
assert.equal(usage.visitors, 2);
assert.equal(usage.clicking_visitors, 1);
assert.equal(usage.sessions, 2);
assert.equal(usage.engagement_rate, 50);
assert.equal(usage.pages[0].page_path, '/');
assert.equal(usage.pages[0].clicks, 1);
assert.equal(usage.pages[0].page_views, 2);
assert.equal(usage.pages[0].engagement_rate, 50);
assert.equal(usage.pages[1].page_path, '/strategy/');
assert.equal(usage.pages[1].engagement_rate, 0);
assert.equal(usage.buttons[0].element_label, '전략');
assert.equal(usage.buttons[0].target_url, '/strategy/');
assert.equal(usage.buttons[0].clicking_visitors, 1);
assert.equal(usage.daily.at(-1).page_views, 3);

const counts = await store.getButtonClickCounts('/');
assert.deepEqual(counts, [{ element_label: '전략', target_url: '/strategy/', clicks: 1 }]);

const unnamed = aggregateButtonCounts([
  { eventType: 'click', elementLabel: '', targetUrl: null },
  { eventType: 'page_view', pagePath: '/' },
]);
assert.equal(unnamed[0].element_label, '(이름 없는 버튼)');
assert.equal(unnamed[0].clicks, 1);

const rate = aggregateUsageStats([
  { day: today, eventType: 'page_view', pagePath: '/a/', visitorId: 'u1', sessionId: 's1' },
  { day: today, eventType: 'page_view', pagePath: '/a/', visitorId: 'u2', sessionId: 's2' },
  { day: today, eventType: 'page_view', pagePath: '/a/', visitorId: 'u3', sessionId: 's3' },
  { day: today, eventType: 'click', pagePath: '/a/', visitorId: 'u1', sessionId: 's1', elementLabel: '버튼' },
], { today, days: 7 });
assert.equal(rate.pages[0].engagement_rate, 33.3);
assert.equal(rate.days, 7);

const wide = await store.getUsageStats(0, now);
assert.equal(wide.days, 1);
const capped = await store.getVisitStats(120, now);
assert.equal(capped.daily.length, 90);

console.log('site analytics tests passed');
