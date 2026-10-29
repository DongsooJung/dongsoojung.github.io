import {solapi} from '../server/sms/service.mjs';
import {koreaDay} from './analytics.mjs';

const REQUIRED=['SOLAPI_API_KEY','SOLAPI_API_SECRET','CLICK_ALERT_TO','CLICK_ALERT_PFID','CLICK_ALERT_TEMPLATE_ID'];
const WINDOW_MS=60000, DAILY_LIMIT=30, MAX_KEYS=1000;
export const ALERT_TEMPLATE=`[스타게이트 웹 이용 알림]
운영자님, 홈페이지 이용 기록이 도착했습니다.
집계 시각: #{시각}
페이지 접속: #{접속수}회
링크 클릭: #{클릭수}회
최근 페이지: #{페이지}
최근 클릭 링크: #{링크}
이 알림은 익명 이용 통계이며 고객의 이름이나 연락처를 포함하지 않습니다.`;

export function alertConfig(env) {
  const missing=REQUIRED.filter(name=>!env[name]);
  if(env.CLICK_ALERT_TO&&!/^010\d{8}$/.test(env.CLICK_ALERT_TO)) missing.push('CLICK_ALERT_TO_FORMAT');
  return {enabled:env.CLICK_ALERTS_ENABLED==='true',ready:env.CLICK_ALERTS_ENABLED==='true'&&missing.length===0,missing,mode:env.SITE_ALERT_MODE==='visits'?'visits':'usage',windowSeconds:60,dailyLimit:DAILY_LIMIT};
}
// Never transmit URL queries, fragments, labels, user-entered text or visitor IDs.
function safeUrl(value,base='https://www.stargateedu.co.kr') {
  try {const url=new URL(value,base);if(!['http:','https:'].includes(url.protocol))return '없음';return (url.origin+url.pathname).slice(0,240);}catch{return '없음';}
}
function initial(now) {return {day:koreaDay(now),keys:[],views:0,clicks:0,attempts:0,last:null};}

export class SiteAlerts {
  constructor(storage,env,{now=()=>Date.now(),fetcher=fetch}={}) {this.storage=storage;this.env=env;this.now=now;this.fetcher=fetcher;}
  async status() {
    const stored=await this.storage.get('siteAlerts');
    const state=stored?.day===koreaDay(this.now())?stored:initial(this.now());
    return {...alertConfig(this.env),pending:{pageViews:state.views,clicks:state.clicks},attemptsToday:state.attempts,last:state.last};
  }
  async record(payload) {
    if(!alertConfig(this.env).ready||!['page_view','click'].includes(payload.p_event_type)) return false;
    if(this.env.SITE_ALERT_MODE==='visits'&&payload.p_event_type!=='page_view')return false;
    if(payload.p_event_type==='click'&&payload.p_element_kind!=='link')return false;
    const now=this.now();
    const page=safeUrl(payload.p_page_path),link=payload.p_event_type==='click'?safeUrl(payload.p_target_url):'없음';
    const identity=this.env.SITE_ALERT_MODE==='visits'?[payload.p_visitor_id,'visit']:[payload.p_visitor_id,payload.p_event_type,page,link];
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(identity)));
    const key=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
    const added=await this.storage.transaction(async storage=>{
      let state=await storage.get('siteAlerts');if(state?.day!==koreaDay(now))state=initial(now);
      if(state.attempts>=DAILY_LIMIT||state.keys.length>=MAX_KEYS)return false;
      if(state.keys.includes(key))return false;
      state.keys.push(key);state[payload.p_event_type==='click'?'clicks':'views']++;
      state.page=page;if(payload.p_event_type==='click')state.link=link;
      await storage.put('siteAlerts',state);return true;
    });
    if(added) {
      const alarm=await this.storage.getAlarm();
      if(alarm===null||alarm>now+WINDOW_MS)await this.storage.setAlarm(now+WINDOW_MS);
    }
    return added;
  }
  async flush() {
    if(!alertConfig(this.env).ready)return;
    const now=this.now();
    // Reserve before the paid external request. A timeout is not safe to retry.
    const batch=await this.storage.transaction(async storage=>{
      const state=await storage.get('siteAlerts');
      if(!state||state.day!==koreaDay(now)||!(state.views+state.clicks)||state.attempts>=DAILY_LIMIT)return null;
      const snapshot={...state};state.views=0;state.clicks=0;state.attempts++;
      state.last={at:new Date(now).toISOString(),status:'unknown'};
      await storage.put('siteAlerts',state);return snapshot;
    });
    if(!batch)return;
    const variables={'#{시각}':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(now),'#{접속수}':String(batch.views),'#{클릭수}':String(batch.clicks),'#{페이지}':batch.page||'없음','#{링크}':batch.clicks?batch.link||'없음':'없음'};
    const text=ALERT_TEMPLATE.replace(/#\{[^}]+\}/g,key=>variables[key]);
    let outcome={at:new Date(now).toISOString(),status:'unknown'};
    try {
      const data=await solapi(this.env,'/messages/v4/send-many/detail',{messages:[{type:'ATA',to:this.env.CLICK_ALERT_TO,text,kakaoOptions:{pfId:this.env.CLICK_ALERT_PFID,templateId:this.env.CLICK_ALERT_TEMPLATE_ID,disableSms:true,variables}}],strict:true,allowDuplicates:false,showMessageList:true},this.fetcher);
      const groupId=data.groupInfo?.groupId||data.groupId;
      outcome={...outcome,status:data.failedMessageList?.length?'rejected':groupId?'accepted':'unknown',...(groupId?{groupId}: {})};
    }catch{/* Keep unknown; check SOLAPI records before any manual resend. */}
    await this.storage.transaction(async storage=>{
      const state=await storage.get('siteAlerts');
      if(state?.day===batch.day){state.last=outcome;await storage.put('siteAlerts',state);}
    });
  }
  async nextAlarm() {
    const state=await this.storage.get('siteAlerts');
    return alertConfig(this.env).ready&&state?.day===koreaDay(this.now())&&(state.views+state.clicks)>0&&state.attempts<DAILY_LIMIT?this.now()+WINDOW_MS:this.now()+86400000;
  }
}
