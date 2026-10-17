import { DurableObject } from 'cloudflare:workers';
import {json,authorized,account,validate,send} from './service.mjs';

export class SmsRequest extends DurableObject {
  async submit(body) {
    // Commit the reservation before the external request. Unknown outcomes never auto-retry.
    const previous=await this.ctx.storage.transaction(async storage=>{
      const prior=await storage.get('result');
      if(prior) return prior;
      await storage.put('result',{ok:false,message:'이미 처리 중이거나 결과가 불확실한 요청입니다. 솔라피 발송 내역을 확인해 주세요.'});
      return null;
    });
    if(previous) return previous;
    let result;
    try { result=await send(this.env,body); }
    catch { result={ok:false,message:'발송을 완료하지 못했습니다. 재발송 전 솔라피 내역과 잔액을 확인해 주세요.'}; }
    await this.ctx.storage.put('result',result);
    return result;
  }
}
export {default} from './handler.mjs';
