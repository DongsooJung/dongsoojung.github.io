// Local Wrangler only: synthetic events must never be sent to production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { koreaDay } from '../cloudflare/analytics.mjs';

const base = process.env.ANALYTICS_TEST_URL;
if (base && !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Synthetic analytics tests require localhost');

async function rpc(name, payload, headers = {}) {
  const response = await fetch(`${base}/api/analytics/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
}

test('local Durable Object validates HTTP, deduplicates writes and serves aggregates', { skip: !base, timeout: 90000 }, async () => {
  let before;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { before = await rpc('get_site_visit_stats', {}); if (before.status === 200) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.equal(before?.status, 200, 'Wrangler analytics API must become ready');
  assert.equal(before.cache, 'no-store');
  assert.equal(before.data.source, 'cloudflare');
  assert.ok(!Number.isNaN(Date.parse(before.data.started_at)));
  const usageBefore = (await rpc('get_site_usage_stats', {})).data;
  const visitor = randomUUID(), session = randomUUID(), id = randomUUID();
  const path = `/__local_analytics_test__/${id}/`;
  const visit = { p_visitor_id: visitor, p_visit_date: koreaDay(), p_path: path };
  assert.equal((await rpc('record_site_visit', { ...visit, p_visitor_id: 'bad' })).status, 400);
  assert.equal((await rpc('record_site_visit', visit, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await rpc('record_site_visit', { ...visit, padding: 'x'.repeat(9000) })).status, 413);
  const malformed = await fetch(`${base}/api/analytics/record_site_visit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await rpc('record_site_visit', visit)).data, true);
  assert.equal((await rpc('record_site_visit', visit)).data, false);
  const pageView = { p_event_id: id, p_visitor_id: visitor, p_session_id: session, p_event_type: 'page_view', p_page_path: path };
  assert.equal((await rpc('record_site_usage_event', pageView)).data, true);
  assert.equal((await rpc('record_site_usage_event', { ...pageView, p_visitor_id: randomUUID() })).data, false);
  const click = { ...pageView, p_event_id: randomUUID(), p_event_type: 'click', p_element_label: 'local test', p_target_url: '/research/' };
  assert.equal((await rpc('record_site_usage_event', click)).data, true);
  assert.equal((await rpc('record_site_usage_event', click)).data, false);
  const visits = (await rpc('get_site_visit_stats', {})).data;
  const usage = (await rpc('get_site_usage_stats', {})).data;
  assert.equal(visits.total, before.data.total + 1);
  assert.equal(visits.today, before.data.today + 1);
  assert.equal(visits.started_at, before.data.started_at);
  assert.equal(usage.page_views, usageBefore.page_views + 1);
  assert.equal(usage.clicks, usageBefore.clicks + 1);
  const page = usage.pages.find(row => row.page_path === path);
  assert.deepEqual({ page_views: page.page_views, clicks: page.clicks, visitors: page.visitors, clicking_visitors: page.clicking_visitors, engagement_rate: page.engagement_rate }, { page_views: 1, clicks: 1, visitors: 1, clicking_visitors: 1, engagement_rate: 100 });
  assert.deepEqual((await rpc('get_site_button_click_counts', { p_page_path: path })).data, [{ element_label: 'local test', target_url: '/research/', clicks: 1 }]);
  assert.equal((await fetch(`${base}/api/analytics/get_site_visit_stats`)).status, 405);
  assert.equal((await rpc('not-a-method', {})).status, 404);
  assert.equal((await fetch(`${base}/api/sms.js`)).status, 404);
  assert.equal((await fetch(`${base}/cloudflare/worker.mjs`)).status, 404);
});
