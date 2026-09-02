const API_BASES = [
  'https://api.odcloud.kr/api/getAPRTPsgrCongestion/v1/aprtPsgrCongestion\u200b',
  'https://api.odcloud.kr/api/getAPRTPsgrCongestion_v2/v1/aprtPsgrCongestion\u200bV2',
];
const LEVELS = { 0: '정보 없음', 1: '원활', 2: '보통', 3: '혼잡', 4: '매우 혼잡' };
const ZONES = [
  ['A', '1구간', '체크인 → 신분확인', 'CGDR_A_LVL'],
  ['B', '2구간', '신분확인 → 보안검색', 'CGDR_B_LVL'],
  ['C', '3구간', '보안검색 → 항공기 탑승', 'CGDR_C_LVL'],
];
const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;

function encodeServiceKey(value) {
  const key = String(value || '').trim();
  return PCT_ENCODED.test(key) ? key : encodeURIComponent(key);
}

function kstLabel(date = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
}

function buildUrl(base, key) {
  const query = new URLSearchParams({ page: '1', perPage: '100', returnType: 'JSON' });
  query.set('cond[IATA_APCD::EQ]', 'GMP');
  return `${base}?serviceKey=${encodeServiceKey(key)}&${query}`;
}

async function fetchPayload(base, key) {
  const response = await fetch(buildUrl(base, key), {
    signal: AbortSignal.timeout(12_000),
    headers: { accept: 'application/json', 'user-agent': 'stargate-gimpo-airport/1.0' },
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`공항 혼잡도 API HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error('공항 혼잡도 API 응답을 해석하지 못했습니다.'); }
  if (!Array.isArray(payload?.data)) throw new Error('공항 혼잡도 API 데이터가 없습니다.');
  return payload;
}

function normalize(payload, endpoint, now = new Date()) {
  const rows = payload.data.filter((row) => String(row?.IATA_APCD || '').toUpperCase() === 'GMP');
  if (!rows.length) throw new Error('김포공항 혼잡도 관측값이 없습니다.');
  const item = rows.at(-1);
  const overallLevel = Number(item.CGDR_ALL_LVL);
  return {
    status: 'ok',
    generated_at: now.toISOString(),
    generated_at_kst: kstLabel(now),
    source: '한국공항공사 공항 혼잡도 정보_GW',
    source_url: 'https://www.data.go.kr/data/15159598/openapi.do',
    source_endpoint: endpoint.replace(/\u200b/g, ''),
    airport: { code: 'GMP', name: '김포국제공항', terminal: '국내선' },
    observed_at: String(item.PRC_HR || ''),
    overall: { level: overallLevel, text: LEVELS[overallLevel] || '정보 없음' },
    zones: ZONES.map(([id, name, route, field]) => {
      const level = Number(item[field]);
      return { id, name, route, level, text: LEVELS[level] || '정보 없음' };
    }),
    record_count: rows.length,
    message: '한국공항공사 공식 혼잡도 데이터를 실시간으로 제공합니다.',
    delivery: { mode: 'live', region: process.env.VERCEL_REGION || 'local' },
  };
}

function setHeaders(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,OPTIONS');
  res.setHeader('cache-control', 'public, max-age=30');
  res.setHeader('vercel-cdn-cache-control', 'public, max-age=300, stale-while-revalidate=1200');
}

export default async function handler(req, res) {
  setHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const key = String(process.env.DATA_GO_KR_API_KEY || '').trim();
  if (!key) return res.status(503).json({ ok: false, error: 'api_key_not_configured', message: '서버 공공데이터 인증키가 설정되지 않았습니다.' });

  let lastStatus = 502;
  for (const endpoint of API_BASES) {
    try {
      return res.status(200).json(normalize(await fetchPayload(endpoint, key), endpoint));
    } catch (caught) {
      lastStatus = Number(caught?.status) || lastStatus;
    }
  }
  return res.status(lastStatus === 401 || lastStatus === 403 ? 403 : 502).json({
    ok: false,
    error: 'gimpo_congestion_unavailable',
    message: '김포공항 혼잡도 활용승인 또는 공공데이터 인증키를 확인해 주세요.',
  });
}

export const __test = { API_BASES, LEVELS, ZONES, encodeServiceKey, buildUrl, normalize };
