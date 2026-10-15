import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AnalyticsStore, koreaDay, readPayload, validatePayload } from '../cloudflare/analytics.mjs';

const beforeMidnight = Date.parse('2026-10-15T14:59:59Z');
const afterMidnight = Date.parse('2026-10-15T15:00:00Z');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const event = (id, visitor = 1, type = 'page_view', path = '/') => ({
  p_event_id: uid(id), p_visitor_id: uid(visitor), p_session_id: uid(visitor + 100),
  p_event_type: type, p_page_path: path, p_element_label: type === 'click' ? '버튼' : null, p_target_url: type === 'click' ? '/research/' : null,
});

function database(now = beforeMidnight) {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: { exec(sql, ...bindings) {
      if (sql.includes('CREATE TABLE')) { db.exec(sql); return { toArray: () => [] }; }
      const rows = db.prepare(sql).all(...bindings).map(row => ({ ...row }));
      return { toArray: () => rows };
    } },
    transactionSync(fn) {
      db.exec('BEGIN');
      try { const result = fn(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, storage, store: new AnalyticsStore(storage, now) };
}

test('Korean midnight, atomic daily dedupe and collection start are correct', () => {
  assert.equal(koreaDay(beforeMidnight), '2026-10-15');
  assert.equal(koreaDay(afterMidnight), '2026-10-16');
  const { db, storage, store } = database();
  try {
    assert.deepEqual(store.call('get_site_visit_stats', { p_days: 30 }, beforeMidnight).daily, [{ date: '2026-10-15', visits: 0 }]);
    const visit = { p_visitor_id: uid(1), p_visit_date: '2026-10-15', p_path: '/' };
    assert.equal(store.call('record_site_visit', visit, beforeMidnight), true);
    assert.equal(store.call('record_site_visit', visit, beforeMidnight), false);
    store.call('record_site_visit', { ...visit, p_visitor_id: uid(2) }, beforeMidnight);
    store.call('record_site_usage_event', event(1), afterMidnight);
    assert.equal(store.call('record_site_visit', { ...visit, p_visit_date: '2026-10-16' }, afterMidnight), false);
    const stats = store.call('get_site_visit_stats', { p_days: 2 }, afterMidnight);
    assert.deepEqual({ today: stats.today, total: stats.total, period: stats.period }, { today: 1, total: 3, period: 3 });
    assert.deepEqual(stats.daily, [{ date: '2026-10-15', visits: 2 }, { date: '2026-10-16', visits: 1 }]);
    assert.equal(new AnalyticsStore(storage, afterMidnight).startedAt, new Date(beforeMidnight).toISOString());
  } finally { db.close(); }
});

test('event-id retries do not change any counts and distinct users span days', () => {
  const { db, store } = database();
  try {
    store.call('record_site_usage_event', event(1, 1), beforeMidnight);
    store.call('record_site_usage_event', event(2, 1, 'click'), beforeMidnight);
    store.call('record_site_usage_event', event(3, 1, 'click'), afterMidnight);
    store.call('record_site_usage_event', event(4, 2, 'click'), afterMidnight);
    assert.equal(store.call('record_site_usage_event', event(1, 3, 'page_view', '/other/'), afterMidnight), false);
    const stats = store.call('get_site_usage_stats', { p_days: 30 }, afterMidnight);
    assert.equal(stats.page_views, 1);
    assert.equal(stats.clicks, 3);
    assert.equal(stats.clicking_visitors, 2);
    assert.equal(stats.sessions, 2);
    assert.equal(stats.engagement_rate, 200);
    assert.equal(stats.pages[0].clicking_visitors, 2);
    assert.equal(stats.buttons[0].clicking_visitors, 2);
    assert.equal(store.call('get_site_visit_stats', {}, afterMidnight).total, 1);
    assert.deepEqual(store.call('get_site_button_click_counts', { p_page_path: '/' }, afterMidnight), [{ element_label: '버튼', target_url: '/research/', clicks: 3 }]);
  } finally { db.close(); }
});

test('90-day raw retention preserves lifetime visitor-days and button counts', () => {
  const { db, store } = database();
  try {
    store.call('record_site_usage_event', event(1), beforeMidnight);
    store.call('record_site_usage_event', event(2, 1, 'click'), beforeMidnight);
    const future = beforeMidnight + 91 * 86400000;
    const stats = store.call('get_site_usage_stats', { p_days: 90 }, future);
    assert.equal(stats.page_views, 0);
    assert.equal(stats.clicks, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visits').get().n, 0);
    assert.equal(store.call('get_site_visit_stats', {}, future).total, 1);
    assert.equal(store.call('get_site_button_click_counts', { p_page_path: '/' }, future)[0].clicks, 1);
  } finally { db.close(); }
});

test('bad identifiers, event types, dates, paths and oversized JSON are rejected', async () => {
  for (const change of [{ p_visitor_id: 'invalid' }, { p_event_type: 'form_input' }, { p_page_path: 'https://example.com/' }, { p_page_path: '//evil/path' }, { p_page_path: '/a/%2e%2e/' }, { p_page_path: '/?email=test' }, { p_element_label: 'x'.repeat(161) }, { p_target_url: 'javascript:alert(1)' }, { p_target_url: 'https://user:password@example.com/' }]) {
    assert.throws(() => validatePayload('record_site_usage_event', { ...event(1), ...change }, beforeMidnight));
  }
  assert.throws(() => validatePayload('record_site_visit', { p_visitor_id: uid(1), p_visit_date: '2026-10-14' }, beforeMidnight));
  assert.throws(() => validatePayload('get_site_visit_stats', { p_days: 91 }));
  assert.throws(() => validatePayload('get_site_visit_stats', []));
  assert.throws(() => validatePayload('unknown', {}), error => error.status === 404);
  assert.equal(validatePayload('record_site_usage_event', { ...event(1), p_target_url: 'https://example.com/path?email=private#hash' }).p_target_url, 'https://example.com/path');
  await assert.rejects(readPayload(new Request('https://example.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: '가'.repeat(4000) }) })), error => error.status === 413);
  await assert.rejects(readPayload(new Request('https://example.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })), /Invalid JSON/);
});
