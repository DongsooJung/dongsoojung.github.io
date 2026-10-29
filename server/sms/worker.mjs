import { DurableObject } from 'cloudflare:workers';
import {json,authorized,account,validate,send} from './service.mjs';
import {CRMStore} from './crm.mjs';
import {chatbotStorage} from './chatbot.mjs';

export class SmsRequest extends DurableObject {
  async chatbot(action,payload) { return chatbotStorage(this.ctx.storage,action,payload); }
  async crm(action,body) {
    const store=new CRMStore(this.ctx.storage);
    try {
      if(action==='contacts') return {ok:true,contacts:await store.list('contacts')};
      if(action==='templates') return {ok:true,templates:await store.templates()};
      if(action==='history') return {ok:true,history:await store.list('history')};
      if(action==='quota') {
        const since=new Date(Date.now()-3600000).toISOString();
        const used=(await store.list('history')).filter(v=>v.createdAt>=since).reduce((n,v)=>n+(v.recipients?.length||0),0);
        return {ok:true,used,limit:50,allowed:used+(body?.count||0)<=50};
      }
      if(action==='record') {await store.record(body.request,body.result);return {ok:true};}
      const [operation,kind]=action.split(':');
      if(operation==='save') return {ok:true,item:await store.save(kind,body)};
      if(operation==='remove') return {ok:true,...await store.remove(kind,body)};
      return {ok:false,message:'지원하지 않는 작업입니다.'};
    } catch(error) {return {ok:false,message:error.message};}
  }
  async submit(body) {
    // Commit the reservation before the external request. Unknown outcomes never auto-retry.
    const previous=await this.ctx.storage.transaction(async storage=>{
      const prior=await storage.get('result');
      if(prior) return prior;
      await storage.put('result',{ok:false,message:'이미 처리 중이거나 결과가 불확실한 요청입니다. 솔라피 발송 내역을 확인해 주세요.'});
      return null;
    });
    if(previous) return previous;
    const journal=this.env.SMS_REQUESTS.get(this.env.SMS_REQUESTS.idFromName('stargate-sms-crm-v1'));
    const logged=await journal.crm('record',{request:body,result:{ok:false,state:'processing',message:'처리 중 · 재발송 전 솔라피 내역 확인'}});
    if(!logged.ok) return {ok:false,message:'발송 기록을 저장하지 못했습니다. 발송하지 않았습니다.'};
    let result;
    try { result=await send(this.env,body); }
    catch { result={ok:false,message:'발송을 완료하지 못했습니다. 재발송 전 솔라피 내역과 잔액을 확인해 주세요.'}; }
    await this.ctx.storage.put('result',result);
    try {await journal.crm('record',{request:body,result});} catch { /* Pending journal entry remains visible if final storage fails. */ }
    return result;
  }
}
export {default} from './handler.mjs';
