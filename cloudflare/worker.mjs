import { DurableObject } from 'cloudflare:workers';
import { AnalyticsStore, RequestError, prepareHistoryImport } from './analytics.mjs';
import { handleRequest } from './routes.mjs';
import { DashboardStore } from './dashboard-refresh.mjs';

export class VisitorAnalytics extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new AnalyticsStore(ctx.storage);
    this.dashboards = new DashboardStore(ctx.storage);
    this.dashboardEnv = env;
  }
  async analytics(method, payload) {
    const result = this.store.call(method, payload);
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 86400000);
    return result;
  }
  async importHistory(payload) {
    try { return { status: 200, result: this.store.importHistory(await prepareHistoryImport(payload)) }; }
    catch (error) {
      if (error instanceof RequestError) return { status: error.status, result: { error: error.message } };
      throw error;
    }
  }
  async refreshDashboards(trigger='scheduled') { return this.dashboards.refresh(this.dashboardEnv,{trigger}); }
  getDashboard(name) { return this.dashboards.get(name); }
  dashboardStatus() { return this.dashboards.status(); }
  async alarm() {
    this.store.prune();
    await this.ctx.storage.setAlarm(Date.now() + 86400000);
  }
}

export default {
  fetch:handleRequest,
  scheduled(controller,env,ctx) {
    const object=env.VISITOR_ANALYTICS.get(env.VISITOR_ANALYTICS.idFromName('stargate-visitors-v1'));
    ctx.waitUntil(object.refreshDashboards('scheduled'));
  },
};
