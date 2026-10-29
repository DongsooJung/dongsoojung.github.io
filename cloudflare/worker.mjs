import { DurableObject } from 'cloudflare:workers';
import { AnalyticsStore, RequestError, prepareHistoryImport } from './analytics.mjs';
import { handleRequest } from './routes.mjs';
import { DashboardStore } from './dashboard-refresh.mjs';
import { SiteAlerts } from './site-alerts.mjs';
import {handleChatbot,channelOverlay} from '../server/sms/chatbot.mjs';
import {chatbotAdmin} from '../server/sms/chatbot-admin.mjs';

export class VisitorAnalytics extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new AnalyticsStore(ctx.storage);
    this.dashboards = new DashboardStore(ctx.storage);
    this.dashboardEnv = env;
    this.alerts = new SiteAlerts(ctx.storage,env);
  }
  async analytics(method, payload, notify=false, geo=null) {
    const result = this.store.call(method, payload, Date.now(), geo);
    if(notify&&method==='record_site_usage_event'&&result===true) {
      try {await this.alerts.record(payload);} catch {console.error('Site alert enqueue failed');}
    }
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 86400000);
    return result;
  }
  async boardLimit() {
    return this.ctx.storage.transaction(async storage => {
      const previous=await storage.get('boardLastPost') || 0;
      if(Date.now()-previous<60000) return false;
      await storage.put('boardLastPost',Date.now());
      await storage.setAlarm(Date.now()+120000);
      return true;
    });
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
  siteAlertStatus() { return this.alerts.status(); }
  async alarm() {
    if(await this.ctx.storage.get('boardLastPost')) { await this.ctx.storage.deleteAll(); return; }
    await this.alerts.flush();
    this.store.prune();
    const next=await this.alerts.nextAlarm();
    const existing=await this.ctx.storage.getAlarm();
    await this.ctx.storage.setAlarm(existing!==null&&existing>Date.now()?Math.min(next,existing):next);
  }
}

export default {
  async fetch(request,env,ctx) {
    const path=new URL(request.url).pathname;
    if(path==='/admin/kakao/')return chatbotAdmin(request,env);
    if(path.startsWith('/api/kakao/'))return handleChatbot(request,env);
    return channelOverlay(await handleRequest(request,env,ctx),path);
  },
  scheduled(controller,env,ctx) {
    const object=env.VISITOR_ANALYTICS.get(env.VISITOR_ANALYTICS.idFromName('stargate-visitors-v1'));
    ctx.waitUntil(object.refreshDashboards('scheduled'));
  },
};

export {SmsRequest} from '../server/sms/worker.mjs';

