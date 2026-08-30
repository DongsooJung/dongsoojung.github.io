export const BASE_URL = 'https://apis.data.go.kr/1230000/as/ScsbidInfoService';
export const OPERATIONS = Object.freeze({
  servc: { path: 'getScsbidListSttusServc', label: '용역' },
  cnstwk: { path: 'getScsbidListSttusCnstwk', label: '공사' },
  thng: { path: 'getScsbidListSttusThng', label: '물품' },
  frgcpt: { path: 'getScsbidListSttusFrgcpt', label: '외자' },
});
const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;

export function clean(value, max = 240) { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
export function number(value) { const parsed = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : 0; }
export function encodeServiceKey(value) {
  const source = String(value || '').trim();
  try { return encodeURIComponent(PCT_ENCODED.test(source) ? decodeURIComponent(source) : source); }
  catch { return encodeURIComponent(source); }
}

export function kstYmdHm(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${map.year}${map.month}${map.day}${map.hour === '24' ? '00' : map.hour}${map.minute}`;
}

export function buildUrl(operation, params, key) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) if (value !== '' && value != null) query.set(name, String(value));
  return `${BASE_URL}/${operation}?ServiceKey=${encodeServiceKey(key)}&${query}`;
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

export function normalize(row, kind) {
  return {
    id: [row.bidNtceNo,row.bidNtceOrd,row.bidClsfcNo,row.rbidNo].map((value) => clean(value, 40)).join('-'), kind,
    noticeNo: clean(row.bidNtceNo, 40), title: clean(row.bidNtceNm, 300), winner: clean(row.bidwinnrNm, 160), amount: number(row.sucsfbidAmt),
    rate: number(row.sucsfbidRate), participants: number(row.prtcptCnum), agency: clean(row.dminsttNm, 180), openedAt: clean(row.rlOpengDt, 30), awardedAt: clean(row.fnlSucsfDate || row.rgstDt, 30),
  };
}
