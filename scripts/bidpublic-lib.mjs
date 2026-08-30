export const BASE_URL = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService';
export const OPERATIONS = Object.freeze({
  servc: { path: 'getBidPblancListInfoServc', label: '용역' },
  cnstwk: { path: 'getBidPblancListInfoCnstwk', label: '공사' },
  thng: { path: 'getBidPblancListInfoThng', label: '물품' },
  frgcpt: { path: 'getBidPblancListInfoFrgcpt', label: '외자' },
});
const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;

export function clean(value, max = 240) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
export function number(value) { const source = String(value ?? '').replace(/,/g, '').trim(); if (!source) return null; const parsed = Number(source); return Number.isFinite(parsed) ? parsed : null; }
export function encodeServiceKey(value) { const source = String(value || '').trim(); try { return encodeURIComponent(PCT_ENCODED.test(source) ? decodeURIComponent(source) : source); } catch { return encodeURIComponent(source); } }
export function safeUrl(value) { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) && /(^|\.)g2b\.go\.kr$/i.test(url.hostname) ? url.href : ''; } catch { return ''; } }

export function kstYmdHm(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${map.year}${map.month}${map.day}${map.hour === '24' ? '00' : map.hour}${map.minute}`;
}

export function buildUrl(operation, params, key) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) if (value !== '' && value != null) query.set(name, String(value));
  return `${BASE_URL}/${operation}?serviceKey=${encodeServiceKey(key)}&${query}`;
}

export function parsePayload(text) {
  const source = String(text || '').trim();
  if (!source) throw new Error('조달청 API가 빈 응답을 반환했습니다.');
  let data;
  try { data = JSON.parse(source); }
  catch { const code = clean((source.match(/<(?:resultCode|returnReasonCode)>([^<]+)/i) || [])[1], 40); const message = clean((source.match(/<(?:resultMsg|returnAuthMsg)>([^<]+)/i) || [])[1], 240); throw new Error(`[${code || 'invalid_response'}] ${message || '조달청 API 응답을 해석하지 못했습니다.'}`); }
  const response = data?.response || data; const header = response?.header || data?.header || {}; const code = clean(header.resultCode || header.returnReasonCode || '00', 40);
  if (!['00','000','0','NORMAL_SERVICE','NORMAL SERVICE.'].includes(code)) throw new Error(`[${code}] ${clean(header.resultMsg || header.returnAuthMsg, 240) || '조달청 API 오류'}`);
  const body = response?.body || data?.body || {}; let items = body?.items?.item ?? body?.items ?? body?.item ?? [];
  if (!Array.isArray(items)) items = items && typeof items === 'object' ? [items] : [];
  return { items, totalCount: number(body.totalCount) };
}

export function newestNotices(items, limit = 100) {
  const latestByNotice = new Map();
  for (const item of items) {
    if (!item.noticeNo || !item.title) continue;
    const prior = latestByNotice.get(item.noticeNo);
    if (!prior || Number(item.noticeOrder || 0) >= Number(prior.noticeOrder || 0)) latestByNotice.set(item.noticeNo, item);
  }
  return [...latestByNotice.values()].sort((a, b) => String(b.noticeAt).localeCompare(String(a.noticeAt))).slice(0, limit);
}

export function normalize(row, kind) {
  return {
    id: [row.bidNtceNo,row.bidNtceOrd].map((value) => clean(value, 40)).join('-'), kind,
    noticeNo: clean(row.bidNtceNo, 40), noticeOrder: clean(row.bidNtceOrd, 8), title: clean(row.bidNtceNm, 300),
    agency: clean(row.ntceInsttNm, 180), demandAgency: clean(row.dminsttNm, 180), method: clean(row.bidMethdNm, 100), contractMethod: clean(row.cntrctCnclsMthdNm, 120),
    noticeAt: clean(row.bidNtceDt || row.ntceDt, 30), closeAt: clean(row.bidClseDt, 30), openAt: clean(row.opengDt, 30),
    estimatedPrice: number(row.presmptPrce), budget: number(row.bdgtAmt), detailUrl: safeUrl(row.bidNtceDtlUrl || row.bidNtceUrl),
  };
}
