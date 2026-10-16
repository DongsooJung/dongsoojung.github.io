import resourceHandler from '../api/[resource].js';
import bidKindHandler from '../api/bid-pblanc/[kind].js';
import dailyCollect from '../api/cron/daily-collect.js';
import hwaseongRealEstate from '../api/hwaseong-real-estate.js';
import kstartup from '../api/kstartup.js';
import lhSaleInfo from '../api/lh-sale-info.js';
import onbidRealEstate from '../api/onbid-real-estate.js';
import publicDataCollector from '../api/public-data-collector.js';
import serviceStatus from '../api/service-status.js';
import sms from '../api/sms.js';
import supportSms from '../api/support-sms.js';
import weolbu from '../api/weolbu.js';

function handlerOf(mod, name) {
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod.default === 'function') return mod.default;
  throw new Error(`API handler ${name} is not a function`);
}

export const handlers = {
  exact: new Map([
    ['/api/cron/daily-collect', handlerOf(dailyCollect, 'daily-collect')],
    ['/api/hwaseong-real-estate', handlerOf(hwaseongRealEstate, 'hwaseong-real-estate')],
    ['/api/kstartup', handlerOf(kstartup, 'kstartup')],
    ['/api/lh-sale-info', handlerOf(lhSaleInfo, 'lh-sale-info')],
    ['/api/onbid-real-estate', handlerOf(onbidRealEstate, 'onbid-real-estate')],
    ['/api/public-data-collector', handlerOf(publicDataCollector, 'public-data-collector')],
    ['/api/service-status', handlerOf(serviceStatus, 'service-status')],
    ['/api/sms', handlerOf(sms, 'sms')],
    ['/api/support-sms', handlerOf(supportSms, 'support-sms')],
    ['/api/weolbu', handlerOf(weolbu, 'weolbu')],
  ]),
  resource: handlerOf(resourceHandler, 'resource'),
  bidKind: handlerOf(bidKindHandler, 'bid-pblanc'),
};
