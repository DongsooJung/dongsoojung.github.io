// Vercel Git deployment verified from repository root: onbid-api
const LIST_URL = 'https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2';
const DETAIL_URL = 'https://apis.data.go.kr/B010003/OnbidRlstDtlSrvc2/getRlstDtlInf2';
const PAGE_SIZE = 100;
const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;
const PROPERTY_CODES = new Set(['0002','0003','0004','0005','0006','0007','0008','0010','0011','0013']);
const PRIVATE_CONTRACT = new Set(['Y', 'N']);
const ALLOWED_ORIGINS = new Set(['https://www.stargateedu.co.kr','https://stargateedu.co.kr','https://dongsoojung.github.io','http://localhost:3000','http://127.0.0.1:3000']);
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 90;
const rateBuckets = globalThis.__stargateOnbidRateBuckets || new Map();
globalThis.__stargateOnbidRateBuckets = rateBuckets;

function setHeaders(req, res) {
  const origin = String(req.headers?.origin || '');
  res.setHeader('access-control-allow-origin', ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.stargateedu.co.kr');
  res.setHeader('access-control-allow-methods', 'GET,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('vary', 'origin');
}

function requestOrigin(req) {
  const origin = String(req.headers?.origin || '').trim();
  if (origin) return origin;
  try { return new URL(String(req.headers?.referer || '')).origin; } catch { return ''; }
}

function enforceClientAccess(req) {
  if (!ALLOWED_ORIGINS.has(requestOrigin(req))) {
    const error = new Error('허용되지 않은 요청 출처입니다.'); error.code = 'origin_not_allowed'; error.status = 403; throw error;
  }
  const ip = cleanText(String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown').split(',')[0],80);
  const now = Date.now(); const current = rateBuckets.get(ip);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) rateBuckets.set(ip,{startedAt:now,count:1});
  else {
    current.count += 1;
    if (current.count > RATE_LIMIT) {
      const error = new Error('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'); error.code = 'rate_limit_exceeded'; error.status = 429; throw error;
    }
  }
  if (rateBuckets.size > 1000) for (const [key,value] of rateBuckets) if (now - value.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(key);
}
function encodeServiceKey(key) { return PCT_ENCODED.test(key) ? key : encodeURIComponent(key); }
function resolveServiceKey() {
  const key = String(process.env.ONBID_API_KEY || process.env.DATA_GO_KR_API_KEY || '').trim();
  if (!key) { const error = new Error('온비드 API 인증키가 아직 배포 환경에 연결되지 않았습니다.'); error.code = 'api_key_missing'; error.status = 503; throw error; }
  return key;
}
function cleanText(value, max = 200) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function asNumber(value) { const number = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(number) ? number : 0; }
function asArray(value) { return Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []; }
function safeUrl(value) { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function buildUrl(endpoint, params, apiKey) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) if (key !== 'serviceKey' && value != null && value !== '') query.set(key, String(value));
  const rest = query.toString();
  return `${endpoint}?serviceKey=${encodeServiceKey(apiKey)}${rest ? `&${rest}` : ''}`;
}
function parsePayload(text) {
  const source = String(text || '').trim();
  if (!source) throw new Error('온비드 API가 빈 응답을 반환했습니다.');
  let data;
  try { data = JSON.parse(source); }
  catch {
    const code = (source.match(/<(?:resultCode|returnReasonCode)>([^<]+)</i) || [])[1] || '';
    const message = (source.match(/<(?:resultMsg|returnAuthMsg)>([^<]+)</i) || [])[1] || '';
    const error = new Error(message || '온비드 API 응답을 해석하지 못했습니다.'); error.code = code || 'invalid_response'; throw error;
  }
  const response = data?.response || data; const header = response?.header || data?.header || {};
  const code = cleanText(header.resultCode || header.returnReasonCode || '00', 40); const message = cleanText(header.resultMsg || header.returnAuthMsg || '', 240);
  if (!['00','000','0','NORMAL_SERVICE','NORMAL SERVICE.'].includes(code)) {
    const error = new Error(message || `온비드 API 오류(${code})`); error.code = code;
    if (['20','30','31'].includes(code)) error.status = 403; if (['22','23'].includes(code)) error.status = 429; throw error;
  }
  const body = response?.body || data?.body || {}; let items = body?.items?.item ?? body?.items ?? body?.item ?? [];
  items = asArray(items).filter((item) => item && typeof item === 'object');
  return { items, totalCount: asNumber(body.totalCount) || items.length, pageNo: asNumber(body.pageNo) || 1, numOfRows: asNumber(body.numOfRows) || items.length };
}
function normalizeListItem(row) {
  return {
    id: cleanText(row.cltrMngNo,60), conditionNo: cleanText(row.pbctCdtnNo,60), onbidItemNo: cleanText(row.onbidCltrno,60), noticeNo: cleanText(row.onbidPbancNo,60), auctionNo: cleanText(row.pbctNo,60),
    title: cleanText(row.onbidCltrNm || row.cltrNm,300), propertyTypeCode: cleanText(row.prptDivCd,20), propertyType: cleanText(row.prptDivNm,80), disposition: cleanText(row.dspsMthodNm,60),
    category: cleanText(row.cltrUsgSclsCtgrNm || row.cltrUsgMclsCtgrNm || row.cltrUsgLclsCtgrNm,100), status: cleanText(row.pbctStatNm,80), address: cleanText(row.zadrNm || row.cltrRadr,300),
    province: cleanText(row.lctnSdnm,60), district: cleanText(row.lctnSggnm,80), neighborhood: cleanText(row.lctnEmdNm,80), bidStart: cleanText(row.cltrBidBgngDt,20), bidEnd: cleanText(row.cltrBidEndDt,20),
    appraisalAmount: asNumber(row.apslEvlAmt), minimumBidAmount: asNumber(row.lowstBidPrc || row.minBidPrc || row.lowstBidPrcAmt), minimumBidText: cleanText(row.lowstBidPrcIndctCont,120), appraisalRatio: asNumber(row.apslPrcCtrsLowstBidRto),
    landArea: asNumber(row.landSqms), buildingArea: asNumber(row.bldSqms), failedCount: asNumber(row.usbdNft), organization: cleanText(row.orgNm || row.rqstOrgNm,120), privateContract: cleanText(row.pvctTrgtYn,1), shareProperty: cleanText(row.alcYn,1),
  };
}
function normalizeDetail(row) {
  return {
    ...normalizeListItem(row), roadAddress: cleanText(row.cltrRadr,300), bidMethod: cleanText(row.bidMthodNm,80), competitionMethod: cleanText(row.cptnMthodNm,80), bidDivision: cleanText(row.bidDivNm,60),
    locationOverview: cleanText(row.locVntyPscdCont,1200), useOverview: cleanText(row.utlzPscdCont,1200), additionalConditions: cleanText(row.icdlCdtnCont,1200), otherInformation: cleanText(row.cltrEtcCont,1200),
    validRights: cleanText(row.dsplVldCont,1200), buyerQualification: cleanText(row.purrQlfcCont,1200), cautions: cleanText(row.pytnMtrsCont,1600), deliveryResponsibility: cleanText(row.evcRsbyTrgtCont,800),
    distributionDue: cleanText(row.dtbtRqrEdtmCont,120), rentMethod: cleanText(row.rentMthodNm,80), rentPeriod: cleanText(row.rentPerdCont,160),
    photos: asArray(row.potoUrlList).map((item) => safeUrl(item?.urlAdr || item)).filter(Boolean).slice(0,12),
    areaBreakdown: asArray(row.sqmsList).slice(0,30).map((item) => ({ type: cleanText(item.clandCont,80), area: cleanText(item.sqmsCont,80), share: cleanText(item.pursAlcCont,120), note: cleanText(item.dtlCltrNm,200) })),
    appraisals: asArray(row.apslEvlClgList).slice(0,20).map((item) => ({ organization: cleanText(item.apslEvlOrgNm,120), date: cleanText(item.apslEvlYmd,20), amount: asNumber(item.apslEvlAmt), reportUrl: safeUrl(item.urlAdr) })),
    corrections: asArray(row.crtnLstClgList).slice(0,30).map((item) => ({ date: cleanText(item.crtnYmd,20), field: cleanText(item.crtnItemCont,120), before: cleanText(item.bfmdfLstCont,500), after: cleanText(item.afmdfLstCont,500) })),
  };
}
function queryValue(query, key, max = 100) { return cleanText(query?.[key], max); }
async function requestOnbid(endpoint, params, apiKey) {
  const response = await fetch(buildUrl(endpoint, params, apiKey), { headers: { Accept: 'application/json', 'User-Agent': 'stargate-onbid-dashboard/1.0' } });
  const text = await response.text();
  if (!response.ok) {
    let code = `http_${response.status}`; let message = `온비드 API HTTP ${response.status}`;
    try { const data = JSON.parse(text); const header = data?.response?.header || data?.header || data || {}; code = cleanText(header.resultCode || header.returnReasonCode || header.code || code,40); message = cleanText(header.resultMsg || header.returnAuthMsg || header.message || message,240); }
    catch { code = cleanText((text.match(/<(?:resultCode|returnReasonCode)>([^<]+)/i)||[])[1] || code,40); message = cleanText((text.match(/<(?:resultMsg|returnAuthMsg)>([^<]+)/i)||[])[1] || message,240); }
    const error = new Error(message); error.code = code; error.status = response.status; throw error;
  }
  return parsePayload(text);
}
export default async function handler(req, res) {
  setHeaders(req,res); if (req.method === 'OPTIONS') return res.status(204).end(); if (req.method !== 'GET') return res.status(405).json({ok:false,error:'method_not_allowed'});
  try {
    enforceClientAccess(req);
    const apiKey = resolveServiceKey(); const action = queryValue(req.query,'action',20) || 'list';
    if (action === 'detail') {
      const cltrMngNo = queryValue(req.query,'cltrMngNo',60); const pbctCdtnNo = queryValue(req.query,'pbctCdtnNo',60);
      if (!cltrMngNo) return res.status(400).json({ok:false,error:'cltrMngNo_required'});
      const result = await requestOnbid(DETAIL_URL,{resultType:'json',pageNo:1,numOfRows:20,cltrMngNo,pbctCdtnNo},apiKey);
      res.setHeader('cache-control','s-maxage=600, stale-while-revalidate=3600');
      return res.status(200).json({ok:true,action,item:result.items.length?normalizeDetail(result.items[0]):null,roundCount:result.items.length,source:'한국자산관리공사 차세대 온비드 부동산 물건상세 조회서비스'});
    }
    if (action !== 'list') return res.status(400).json({ok:false,error:'unsupported_action'});
    const pageNo = Math.min(200,Math.max(1,asNumber(req.query?.pageNo)||1)); const propertyType = queryValue(req.query,'prptDivCd',20)||'0007'; const privateContract = queryValue(req.query,'pvctTrgtYn',1)||'N';
    if (!PROPERTY_CODES.has(propertyType)) return res.status(400).json({ok:false,error:'invalid_prptDivCd'}); if (!PRIVATE_CONTRACT.has(privateContract)) return res.status(400).json({ok:false,error:'invalid_pvctTrgtYn'});
    const params = {resultType:'json',pageNo,numOfRows:PAGE_SIZE,prptDivCd:propertyType,pvctTrgtYn:privateContract,dspsMthodCd:queryValue(req.query,'dspsMthodCd',10),bidDivCd:queryValue(req.query,'bidDivCd',10),pbctStatCd:queryValue(req.query,'pbctStatCd',10),lctnSdnm:queryValue(req.query,'lctnSdnm',60),lctnSggnm:queryValue(req.query,'lctnSggnm',80),onbidCltrNm:queryValue(req.query,'onbidCltrNm',120)};
    const result = await requestOnbid(LIST_URL,params,apiKey); res.setHeader('cache-control','s-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({ok:true,action,pageNo:result.pageNo||pageNo,pageSize:PAGE_SIZE,rowCount:result.items.length,totalCount:result.totalCount,items:result.items.map(normalizeListItem).filter((item)=>item.id),source:'한국자산관리공사 차세대 온비드 부동산 물건목록 조회서비스',updatedAt:new Date().toISOString()});
  } catch (caught) { const error = caught instanceof Error ? caught : new Error('온비드 조회에 실패했습니다.'); return res.status(Number(error.status)||502).json({ok:false,error:error.code||'onbid_request_failed',message:error.message}); }
}
export const __test = {PAGE_SIZE,PROPERTY_CODES,buildUrl,encodeServiceKey,parsePayload,normalizeListItem,normalizeDetail};
