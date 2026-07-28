/**
 * 나라장터 용역 입찰공고 → Supabase 프록시
 * GET/POST /api/bid-pblanc-servc
 */
import {
  createBidHandler,
  parseBidPayload,
  normalizeItem,
  buildUrl,
  encodeServiceKey,
  PAGE_SIZE,
  formatYmdHm,
  daysAgoYmdHm,
  KIND_CONFIG,
} from './_lib/bid-pblanc-core.js';

export default createBidHandler('servc');

export const __test = {
  parseBidPayload,
  normalizeItem,
  buildUrl: (params, apiKey) => buildUrl(KIND_CONFIG.servc.apiUrl, params, apiKey),
  encodeServiceKey,
  PAGE_SIZE,
  formatYmdHm,
  daysAgoYmdHm,
};
