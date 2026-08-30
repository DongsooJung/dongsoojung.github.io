const ENDPOINT = 'https://apis.data.go.kr/B553881/newRegistlnfoService_02/getnewRegistlnfoService02';
const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;
const VEHICLE_TYPES = [
  ['1', '승용'],
  ['2', '승합'],
  ['3', '화물'],
  ['4', '특수'],
];

function encodeServiceKey(key) {
  return PCT_ENCODED.test(key) ? key : encodeURIComponent(key);
}

function readTag(xml, tag) {
  return String(xml || '').match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.trim() || '';
}

function parseCount(xml) {
  const code = readTag(xml, 'resultCode');
  const message = readTag(xml, 'resultMsg');
  if (code !== '00') {
    const error = new Error(message || `공공데이터 API 오류(${code || 'unknown'})`);
    error.code = code || 'invalid_response';
    if (['20', '30', '31'].includes(code)) error.status = 403;
    if (['22', '23'].includes(code)) error.status = 429;
    throw error;
  }
  const count = Number(readTag(xml, 'dtaCo'));
  if (!Number.isFinite(count) || count < 0) throw new Error('신규등록 통계건수를 해석하지 못했습니다.');
  return count;
}

function previousSeoulMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const current = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, 1));
  current.setUTCMonth(current.getUTCMonth() - 1);
  return { year: current.getUTCFullYear(), month: current.getUTCMonth() + 1 };
}

function validatePeriod(yearValue, monthValue, now = new Date()) {
  const fallback = previousSeoulMonth(now);
  const year = yearValue == null || yearValue === '' ? fallback.year : Number(yearValue);
  const month = monthValue == null || monthValue === '' ? fallback.month : Number(monthValue);
  if (!Number.isInteger(year) || year < 2015 || year > fallback.year) throw new Error('year는 2015년부터 최근 완료월까지 입력해야 합니다.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('month는 1~12 사이여야 합니다.');
  if (year === fallback.year && month > fallback.month) throw new Error('아직 완료되지 않은 월은 조회할 수 없습니다.');
  return { year, month };
}

function shiftPeriod(period, offset) {
  const date = new Date(Date.UTC(period.year, period.month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function buildUrl(apiKey, period, filters = {}) {
  const query = new URLSearchParams();
  query.set('registYy', String(period.year));
  query.set('registMt', String(period.month).padStart(2, '0'));
  for (const [key, value] of Object.entries(filters)) if (value != null && value !== '') query.set(key, String(value));
  return `${ENDPOINT}?serviceKey=${encodeServiceKey(apiKey)}&${query}`;
}

async function requestCount(apiKey, period, filters = {}) {
  const response = await fetch(buildUrl(apiKey, period, filters), {
    headers: { Accept: 'application/xml', 'User-Agent': 'stargate-used-car-registration/1.0' },
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`공공데이터 API HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return parseCount(text);
}

function pctChange(current, previous) {
  return previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : null;
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const apiKey = String(process.env.DATA_GO_KR_API_KEY || '').trim();
    if (!apiKey) {
      const error = new Error('DATA_GO_KR_API_KEY가 배포 환경에 설정되지 않았습니다.');
      error.status = 503;
      throw error;
    }
    const selected = validatePeriod(req.query?.year, req.query?.month);
    const periods = Array.from({ length: 12 }, (_, index) => shiftPeriod(selected, index - 11));
    const tasks = [
      ...periods.map((period) => requestCount(apiKey, period)),
      ...VEHICLE_TYPES.map(([code]) => requestCount(apiKey, selected, { vhctyAsortCode: code })),
      requestCount(apiKey, selected, { hmmdImpSeNm: '국산' }),
      requestCount(apiKey, selected, { hmmdImpSeNm: '외산' }),
    ];
    const values = await Promise.all(tasks);
    const trendValues = values.slice(0, periods.length);
    const total = trendValues.at(-1) || 0;
    const typeStart = periods.length;
    const vehicleTypes = VEHICLE_TYPES.map(([code, label], index) => ({
      code,
      label,
      count: values[typeStart + index],
      share: total ? Number(((values[typeStart + index] / total) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.count - a.count);
    const domestic = values[typeStart + VEHICLE_TYPES.length];
    const imported = values[typeStart + VEHICLE_TYPES.length + 1];

    res.setHeader('cache-control', 's-maxage=43200, stale-while-revalidate=86400');
    return res.status(200).json({
      ok: true,
      source: '한국교통안전공단 자동차종합정보 신규등록정보 서비스',
      sourceUrl: 'https://www.data.go.kr/data/15059401/openapi.do',
      metric: '신규등록 통계건수',
      caveat: '중고차 실거래량이 아니라 신차 수요를 보여주는 보조지표입니다.',
      period: `${selected.year}-${String(selected.month).padStart(2, '0')}`,
      updatedAt: new Date().toISOString(),
      total,
      monthOverMonth: pctChange(total, trendValues.at(-2) || 0),
      domestic: { count: domestic, share: total ? Number(((domestic / total) * 100).toFixed(1)) : 0 },
      imported: { count: imported, share: total ? Number(((imported / total) * 100).toFixed(1)) : 0 },
      vehicleTypes,
      trend: periods.map((period, index) => ({
        period: `${period.year}-${String(period.month).padStart(2, '0')}`,
        count: trendValues[index],
      })),
    });
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error('신규등록 통계 조회에 실패했습니다.');
    return res.status(Number(error.status) || 502).json({ ok: false, error: error.code || 'registration_request_failed', message: error.message });
  }
}

export const __test = { VEHICLE_TYPES, encodeServiceKey, parseCount, previousSeoulMonth, validatePeriod, shiftPeriod, buildUrl, pctChange };
