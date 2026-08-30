/**
 * 창업진흥원 K-Startup 조회서비스 보안 프록시
 *
 * GET /api/kstartup?type=announcement&page=1&perPage=20
 *   &keyword=&region=&category=&stage=&recruiting=Y
 *
 * 공공데이터포털 인증키는 서버 환경변수에만 둔다. 원천 API가 공고 검색
 * 조건을 간헐적으로 무시하므로 최근 공고 풀을 짧게 캐시한 뒤 서버에서
 * 다시 검색·필터·정렬한다.
 */

const BASE_URL = 'https://apis.data.go.kr/B552735/kisedKstartupService01';
const CACHE_TTL_MS = 15 * 60 * 1000;
const UPSTREAM_PAGE_SIZE = 100;
const ANNOUNCEMENT_PAGES = 5;
const MAX_FILTERED_PAGES = 20;

const OPERATIONS = {
  announcement: {
    path: 'getAnnouncementInformation01',
    pages: ANNOUNCEMENT_PAGES,
  },
  business: {
    path: 'getBusinessInformation01',
    pages: 2,
  },
  content: {
    path: 'getContentInformation01',
    pages: 2,
  },
  statistical: {
    path: 'getStatisticalInformation01',
    pages: 1,
  },
};

const ALLOWED_ORIGINS = new Set([
  'https://www.stargateedu.co.kr',
  'https://stargateedu.co.kr',
  'https://dongsoojung.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]);

const memoryCache = new Map();
const inflightCache = new Map();

function setCors(req, res) {
  const origin = String(req.headers?.origin || '');
  res.setHeader(
    'Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.stargateedu.co.kr',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
}

function resolveServiceKey() {
  let key = String(
    process.env.KSTARTUP_API_KEY || process.env.DATA_GO_KR_API_KEY || '',
  ).trim();
  if (!key) throw new Error('K-Startup API 연결 설정이 필요합니다.');
  if (/%[0-9A-Fa-f]{2}/.test(key)) {
    try {
      key = decodeURIComponent(key);
    } catch (_) {
      // URLSearchParams가 안전하게 인코딩하도록 원문을 유지한다.
    }
  }
  return key;
}

function asPositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function normalizeQueryValue(value, maxLength = 120) {
  return String(Array.isArray(value) ? value[0] : value ?? '')
    .trim()
    .slice(0, maxLength);
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(value) {
  let raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw.replace(/^\/+/, '')}`;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (_) {
    return '';
  }
}

function normalizeItem(item, type) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const normalized = {};
  for (const [key, value] of Object.entries(item)) {
    if (value == null) normalized[key] = '';
    else if (/url$/i.test(key)) normalized[key] = normalizeUrl(value);
    else if (['pbanc_ctnt', 'ctnt'].includes(key)) normalized[key] = stripHtml(value).slice(0, 4000);
    else normalized[key] = typeof value === 'string' ? value.trim() : value;
  }
  normalized._type = type;
  return normalized;
}

function upstreamError(payload, status) {
  const header =
    payload?.response?.header ||
    payload?.header ||
    payload?.OpenAPI_ServiceResponse?.cmmMsgHeader ||
    {};
  const code = String(
    header.resultCode || header.returnReasonCode || payload?.resultCode || '',
  ).trim();
  if (status >= 400 || (code && !['00', '0', 'NORMAL_SERVICE'].includes(code))) {
    if (['20', '30', '31'].includes(code)) return 'K-Startup API 인증 또는 이용승인 상태를 확인하세요.';
    if (['22', '23'].includes(code)) return 'K-Startup API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.';
    return 'K-Startup 원천 서비스가 일시적으로 응답하지 않습니다.';
  }
  return '';
}

function errorFromNonJson(text, status) {
  const code = String(
    (String(text).match(/<(?:returnReasonCode|resultCode)>([^<]+)</i) || [])[1] || '',
  ).trim();
  if (['20', '30', '31'].includes(code)) return 'K-Startup API 인증 또는 이용승인 상태를 확인하세요.';
  if (['22', '23'].includes(code)) return 'K-Startup API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.';
  if (status >= 400 || code) return 'K-Startup 원천 서비스가 일시적으로 응답하지 않습니다.';
  return 'K-Startup 원천 응답을 해석하지 못했습니다.';
}

async function fetchUpstreamPage(type, page, serviceKey, upstreamParams = {}) {
  const operation = OPERATIONS[type];
  const url = new URL(`${BASE_URL}/${operation.path}`);
  url.searchParams.set('ServiceKey', serviceKey);
  url.searchParams.set('returnType', 'json');
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(UPSTREAM_PAGE_SIZE));
  for (const [key, value] of Object.entries(upstreamParams)) {
    if (value !== '') url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'stargate-kstartup-radar/1.0',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      throw new Error(errorFromNonJson(text, response.status));
    }
    const message = upstreamError(payload, response.status);
    if (message) throw new Error(message);
    const rows = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload?.response?.body?.items?.item)
        ? payload.response.body.items.item
        : [];
    return {
      items: rows.map((row) => normalizeItem(row, type)).filter(Boolean),
      totalCount: Number(payload.totalCount || payload?.response?.body?.totalCount || rows.length),
      matchCount: payload.matchCount != null || payload?.response?.body?.matchCount != null
        ? Number(payload.matchCount ?? payload.response.body.matchCount)
        : null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('K-Startup 원천 서비스 응답 시간이 초과됐습니다.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getPool(type, serviceKey, recruiting = '') {
  const cacheKey = `${type}:${recruiting}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached;
  if (inflightCache.has(cacheKey)) return inflightCache.get(cacheKey);

  const loading = (async () => {
    const operation = OPERATIONS[type];
    const upstreamParams =
      type === 'announcement' && recruiting
        ? { 'cond[rcrt_prgs_yn::EQ]': recruiting }
        : {};
    const first = await fetchUpstreamPage(type, 1, serviceKey, upstreamParams);
    const filteredUpstream = type === 'announcement' && recruiting;
    const upstreamTotalCount = filteredUpstream
      ? (first.matchCount ?? first.totalCount)
      : first.totalCount;
    const requiredPages = Math.max(1, Math.ceil(upstreamTotalCount / UPSTREAM_PAGE_SIZE));
    if (filteredUpstream && requiredPages > MAX_FILTERED_PAGES) {
      throw new Error('모집 중 공고가 안전 조회 범위를 초과했습니다. 수집 설정을 조정해야 합니다.');
    }
    const pageCount = filteredUpstream ? requiredPages : Math.min(operation.pages, requiredPages);
    const pages = [first];
    for (let start = 2; start <= pageCount; start += 2) {
      const batch = [];
      for (let page = start; page < start + 2 && page <= pageCount; page += 1) {
        batch.push(fetchUpstreamPage(type, page, serviceKey, upstreamParams));
      }
      pages.push(...(await Promise.all(batch)));
    }
    const seen = new Set();
    const items = pages.flatMap((page) => page.items).filter((item) => {
      const key = String(item.id || item.pbanc_sn || item.detl_pg_url || JSON.stringify(item));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const result = {
      cachedAt: Date.now(),
      items,
      upstreamTotalCount: upstreamTotalCount || items.length,
    };
    memoryCache.set(cacheKey, result);
    return result;
  })();

  inflightCache.set(cacheKey, loading);
  try {
    return await loading;
  } finally {
    inflightCache.delete(cacheKey);
  }
}

function includes(value, needle) {
  if (!needle) return true;
  return String(value ?? '').toLocaleLowerCase('ko-KR').includes(needle.toLocaleLowerCase('ko-KR'));
}

function searchableText(item) {
  return Object.entries(item)
    .filter(([key]) => !/url$/i.test(key))
    .map(([, value]) => (typeof value === 'string' ? value : ''))
    .join(' ');
}

function dateDigits(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '').slice(0, 8);
  return digits.length === 8 ? digits : '';
}

function kstTodayDigits(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
  return `${values.year}${values.month}${values.day}`;
}

function filterItems(items, type, query) {
  const keyword = normalizeQueryValue(query.keyword);
  const region = normalizeQueryValue(query.region);
  const category = normalizeQueryValue(query.category);
  const stage = normalizeQueryValue(query.stage);
  const recruiting = normalizeQueryValue(query.recruiting, 1).toUpperCase();
  const today = kstTodayDigits();

  return items
    .filter((item) => includes(searchableText(item), keyword))
    .filter((item) => type !== 'announcement' || includes(item.supt_regin, region))
    .filter((item) => type !== 'announcement' || includes(item.supt_biz_clsfc, category))
    .filter((item) => type !== 'announcement' || includes(item.biz_enyy, stage))
    .filter((item) => {
      if (type !== 'announcement' || !recruiting) return true;
      const end = dateDigits(item.pbanc_rcpt_end_dt);
      return String(item.rcrt_prgs_yn || '').toUpperCase() === recruiting && (!end || end >= today);
    })
    .sort((a, b) => {
      if (type === 'announcement') {
        const aEnd = dateDigits(a.pbanc_rcpt_end_dt) || '99999999';
        const bEnd = dateDigits(b.pbanc_rcpt_end_dt) || '99999999';
        return aEnd.localeCompare(bEnd);
      }
      const aDate = dateDigits(a.fstm_reg_dt || a.biz_yr) || '00000000';
      const bDate = dateDigits(b.fstm_reg_dt || b.biz_yr) || '00000000';
      return bDate.localeCompare(aDate);
    });
}

function uniqueValues(items, field, split = false) {
  const values = new Set();
  for (const item of items) {
    const raw = String(item[field] || '');
    const parts = split ? raw.split(',') : [raw];
    for (const part of parts) {
      const value = part.trim();
      if (value) values.add(value);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'ko'));
}

function daysUntil(value, now = new Date()) {
  const digits = dateDigits(value);
  if (!digits) return null;
  const target = Date.UTC(
    Number(digits.slice(0, 4)),
    Number(digits.slice(4, 6)) - 1,
    Number(digits.slice(6, 8)),
  );
  const today = kstTodayDigits(now);
  const base = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(4, 6)) - 1,
    Number(today.slice(6, 8)),
  );
  return Math.ceil((target - base) / 86400000);
}

function summarize(items, type) {
  if (type !== 'announcement') return { matched: items.length };
  return {
    matched: items.length,
    recruiting: items.filter((item) => String(item.rcrt_prgs_yn).toUpperCase() === 'Y').length,
    closingSoon: items.filter((item) => {
      const days = daysUntil(item.pbanc_rcpt_end_dt);
      return days != null && days >= 0 && days <= 7;
    }).length,
    nationwide: items.filter((item) => String(item.supt_regin || '').includes('전국')).length,
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET 요청만 지원합니다.' });

  try {
    const query = req.query || {};
    const type = normalizeQueryValue(query.type || 'announcement', 20).toLowerCase();
    if (!OPERATIONS[type]) return res.status(400).json({ ok: false, error: '지원하지 않는 조회 유형입니다.' });
    const page = asPositiveInt(query.page, 1, 1000);
    const perPage = asPositiveInt(query.perPage, 20, 50);
    const recruiting = type === 'announcement'
      ? normalizeQueryValue(query.recruiting, 1).toUpperCase()
      : '';
    const pool = await getPool(type, resolveServiceKey(), recruiting);
    const available = filterItems(pool.items, type, { recruiting });
    const filtered = filterItems(available, type, query);
    const offset = (page - 1) * perPage;

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({
      ok: true,
      type,
      page,
      perPage,
      currentCount: Math.max(0, Math.min(perPage, filtered.length - offset)),
      matchCount: filtered.length,
      totalCount: filtered.length,
      upstreamTotalCount: pool.upstreamTotalCount,
      poolCount: pool.items.length,
      partialDataset: pool.items.length < pool.upstreamTotalCount,
      fetchedAt: new Date(pool.cachedAt).toISOString(),
      summary: summarize(filtered, type),
      facets: type === 'announcement' ? {
        regions: uniqueValues(available, 'supt_regin'),
        categories: uniqueValues(available, 'supt_biz_clsfc'),
        stages: uniqueValues(available, 'biz_enyy', true),
      } : {},
      items: filtered.slice(offset, offset + perPage),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'K-Startup 조회에 실패했습니다.';
    return res.status(502).json({ ok: false, error: message });
  }
}

export const __test = {
  normalizeItem,
  normalizeUrl,
  stripHtml,
  filterItems,
  summarize,
  daysUntil,
  dateDigits,
  kstTodayDigits,
  OPERATIONS,
  memoryCache,
  inflightCache,
};
