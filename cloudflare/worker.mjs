import { DurableObject } from 'cloudflare:workers';
import { AnalyticsStore, METHODS, RequestError, readPayload, validatePayload } from './analytics.mjs';

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export class VisitorAnalytics extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new AnalyticsStore(ctx.storage);
  }
  async analytics(method, payload) {
    const result = this.store.call(method, payload);
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 86400000);
    return result;
  }
  async alarm() {
    this.store.prune();
    await this.ctx.storage.setAlarm(Date.now() + 86400000);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/analytics/')) return env.ASSETS.fetch(request);
    const method = url.pathname.slice('/api/analytics/'.length);
    if (!METHODS.has(method)) return json({ error: 'Unknown analytics method' }, 404);
    if (request.method !== 'POST') return json({ error: 'Use POST for analytics' }, 405);
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Cross-origin analytics request rejected' }, 403);
    try {
      const payload = validatePayload(method, await readPayload(request));
      const object = env.VISITOR_ANALYTICS.get(env.VISITOR_ANALYTICS.idFromName('stargate-visitors-v1'));
      return json(await object.analytics(method, payload));
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status);
      console.error('Cloudflare analytics request failed');
      return json({ error: 'Analytics temporarily unavailable' }, 503);
    }
  },
};
