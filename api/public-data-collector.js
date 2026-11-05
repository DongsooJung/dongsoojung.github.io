/**
 * 공공데이터포털 수집 → CSV 생성 → Supabase Storage 저장
 *
 * GET  /api/public-data-collector          카탈로그·최근 로그
 * POST /api/public-data-collector          선택 API 수집 후 CSV 업로드
 *
 * 중요: serviceKey 이중 인코딩을 막기 위해 URLSearchParams로 키를 넣지 않는다.
 * 인코딩 키(%2F 등)는 그대로 결합하고, 디코딩 키만 encodeURIComponent 1회 적용한다.
 */

const SUPABASE_FALLBACK_URL = 'https://inftexpcnfinglwlrvsj.supabase.co';
const COLLECTOR_VERSION = '20261106-scope-v1';
const STORAGE_BUCKET = 'public-data-csv';
const LOG_TABLE = 'public_data_collection_logs';
const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;
const FATAL_CODES = new Set(['12', '20', '30', '31', '32', '33']);
const OK_CODES = new Set(['00', '0', '000', 'NORMAL_SERVICE', 'NORMAL SERVICE.']);

const ALLOWED_ORIGINS = new Set([
  'https://www.stargateedu.co.kr',
  'https://stargateedu.co.kr',
  'https://dongsoojung.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function seoulParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return map;
}

function seoulStamp(date = new Date()) {
  const p = seoulParts(date);
  return {
    ymd: `${p.year}${p.month}${p.day}`,
    ym: `${p.year}${p.month}`,
    isoDate: `${p.year}-${p.month}-${p.day}`,
    fileStamp: `${p.year}${p.month}${p.day}_${p.hour}${p.minute}${p.second}`,
  };
}

function previousMonthYmd() {
  const p = seoulParts();
  const year = Number(p.year);
  const month = Number(p.month);
  if (month === 1) return `${year - 1}12`;
  return `${year}${String(month - 1).padStart(2, '0')}`;
}

const API_CATALOG = [
  {
    id: 'apt_trade',
    name: '부동산_실거래가',
    description: '국토부 아파트 매매 실거래가 (기본: 강남구·전월)',
    // Dev 엔드포인트는 활용신청 전이면 403이 나므로 일반 조회 URL을 사용한다.
    url: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade',
    params: { LAWD_CD: '11680' },
    dynamicParams: () => ({ DEAL_YMD: previousMonthYmd() }),
    maxPages: 5,
    rowsPerPage: 1000,
  },
  {
    id: 'store_dong',
    name: '서울_상권정보',
    description: '상가업소 행정동 조회 (설정 코드 1168010100·동명 미검증)',
    url: 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong',
    params: { divId: 'adongCd', key: '1168010100', type: 'json' },
    maxPages: 5,
    rowsPerPage: 1000,
  },
  {
    id: 'store_upjong',
    name: '소상공인_상권분석',
    description: '상가업소 업종 조회 (Q·1168011800 적용 범위 미검증)',
    url: 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong',
    params: {
      indsLclsCd: 'Q',
      divId: 'adongCd',
      key: '1168011800',
      type: 'json',
    },
    maxPages: 5,
    rowsPerPage: 1000,
  },
  {
    id: 'village_fcst',
    name: '기상청_단기예보',
    description: '단기예보 조회 (기본: 강남구 격자 nx=61, ny=126)',
    url: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst',
    params: { dataType: 'JSON', base_time: '0500', nx: '61', ny: '126' },
    dynamicParams: () => ({ base_date: seoulStamp().ymd }),
    maxPages: 2,
    rowsPerPage: 1000,
  },
];

class DataGoKrError extends Error {
  constructor(code, message, fatal = false) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.fatal = fatal;
  }
}

function supabaseConfig() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key) return null;
  return {
    url: (process.env.SUPABASE_URL || SUPABASE_FALLBACK_URL).replace(/\/$/, ''),
    key,
  };
}

function resolveServiceKey() {
  const key = (process.env.DATA_GO_KR_API_KEY || '').trim();
  if (!key) throw new DataGoKrError('30', 'DATA_GO_KR_API_KEY가 설정되어 있지 않습니다.', true);
  return key;
}

function encodeServiceKey(apiKey) {
  return PCT_ENCODED.test(apiKey) ? apiKey : encodeURIComponent(apiKey);
}

function buildUrl(baseUrl, params, apiKey) {
  const rest = { ...params };
  delete rest.serviceKey;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const encoded = query.toString();
  const keyPart = `serviceKey=${encodeServiceKey(apiKey)}`;
  return encoded ? `${baseUrl}?${keyPart}&${encoded}` : `${baseUrl}?${keyPart}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeXml(value = '') {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .trim();
}

function readTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeXml(match?.[1] || '');
}

function raiseIfXmlError(text) {
  const code = readTag(text, 'returnReasonCode') || readTag(text, 'resultCode') || readTag(text, 'errMsg');
  const msg = readTag(text, 'returnAuthMsg') || readTag(text, 'resultMsg') || code;
  if (code && !OK_CODES.has(code)) {
    throw new DataGoKrError(code, msg || '상세 메시지 없음', FATAL_CODES.has(code));
  }
}

function raiseIfJsonError(data) {
  if (!data || typeof data !== 'object') return;
  const header = data.header || data.response?.header || {};
  if (!header || typeof header !== 'object') return;
  const code = String(header.resultCode || header.returnReasonCode || '').trim();
  const msg = String(header.resultMsg || header.returnAuthMsg || '').trim();
  if (code && !OK_CODES.has(code)) {
    throw new DataGoKrError(code, msg || '상세 메시지 없음', FATAL_CODES.has(code));
  }
}

function asInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonPayload(data) {
  if (Array.isArray(data)) {
    return { items: data.filter((row) => row && typeof row === 'object'), totalCount: null, pageNo: 1, numOfRows: data.length };
  }

  let body = data;
  if (data.response && typeof data.response === 'object') body = data.response.body || {};
  else if (data.body && typeof data.body === 'object') body = data.body;

  let items = body?.items ?? [];
  if (items && typeof items === 'object' && !Array.isArray(items)) items = items.item ?? [];
  if (items && typeof items === 'object' && !Array.isArray(items)) items = [items];
  if (!Array.isArray(items)) items = [];

  return {
    items: items.filter((row) => row && typeof row === 'object' && !Array.isArray(row)),
    totalCount: body?.totalCount == null ? null : asInt(body.totalCount, null),
    pageNo: asInt(body?.pageNo, 1),
    numOfRows: asInt(body?.numOfRows, 0),
  };
}

function parseXmlPayload(text) {
  const blocks = text.match(/<item>[\s\S]*?<\/item>/gi) || [];
  const items = blocks.map((block) => {
    const row = {};
    const tags = block.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g);
    for (const match of tags) {
      if (match[1].toLowerCase() === 'item') continue;
      row[match[1]] = decodeXml(match[2]);
    }
    return row;
  }).filter((row) => Object.keys(row).length);

  return {
    items,
    totalCount: readTag(text, 'totalCount') === '' ? null : asInt(readTag(text, 'totalCount'), null),
    pageNo: asInt(readTag(text, 'pageNo'), 1),
    numOfRows: asInt(readTag(text, 'numOfRows'), items.length),
  };
}

function parseResponse(text) {
  const stripped = (text || '').trim();
    if (/^<!doctype\s+html|^<html\b/i.test(stripped)) throw new DataGoKrError('99', 'API 자료 대신 HTML 안내문을 받았습니다.');
    if (stripped.startsWith('<') && !/<(?:response|body)\b/i.test(stripped)) {
      raiseIfXmlError(stripped);
      throw new DataGoKrError('99', 'API XML 구조를 확인할 수 없습니다.');
    }
  if (!stripped) {
    throw new DataGoKrError('99', '빈 응답을 받았습니다.');
  }
  if (stripped.startsWith('<')) {
    raiseIfXmlError(stripped);
    return parseXmlPayload(stripped);
  }
  let data;
  try {
    data = JSON.parse(stripped);
  } catch (error) {
    throw new DataGoKrError('99', `응답을 파싱할 수 없습니다: ${error.message}. 원문: ${stripped.slice(0, 200)}`);
  }
  raiseIfJsonError(data);
    if (!Array.isArray(data) && (!data || typeof data !== 'object' || !('items' in (data?.response?.body || data?.body || data)))) throw new DataGoKrError('99', 'API items 구조를 확인할 수 없습니다.');
  return parseJsonPayload(data);
}

async function fetchPage(baseUrl, params, apiKey) {
  const url = buildUrl(baseUrl, params, apiKey);
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json, text/xml, */*',
          'User-Agent': 'stargate-public-data-collector/1.0',
        },
      });

      if ([429, 500, 502, 503, 504].includes(response.status)) {
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (response.status === 403) {
        throw new DataGoKrError(
          '30',
          'HTTP 403. 인증키 형식 또는 해당 API 활용신청 승인 여부를 확인하십시오.',
          true,
        );
      }

      const text = await response.text();
      if (!response.ok) {
        throw new DataGoKrError(String(response.status), text.slice(0, 200) || `HTTP ${response.status}`);
      }
      return parseResponse(text);
    } catch (error) {
      if (error instanceof DataGoKrError) throw error;
      lastError = error;
      await sleep(500 * 2 ** attempt);
    }
  }

  throw lastError || new Error('요청 실패');
}

async function paginate(api, overrideParams, apiKey) {
  const baseParams = {
    ...api.params,
    ...(typeof api.dynamicParams === 'function' ? api.dynamicParams() : {}),
    ...(overrideParams || {}),
  };
  delete baseParams.serviceKey;
  delete baseParams.pageNo;
  delete baseParams.numOfRows;

  const collected = [];
  let reportedTotal = null, pagesFetched = 0, termination = 'page_limit';
  const maxPages = api.maxPages || 5;
  const rowsPerPage = api.rowsPerPage || 1000;

  for (let page = 1; page <= maxPages; page += 1) {
    if (page > 1) await sleep(1100);
    const result = await fetchPage(
      api.url,
      { ...baseParams, pageNo: String(page), numOfRows: String(rowsPerPage) },
      apiKey,
    );

    pagesFetched += 1;
    if (result.totalCount != null) reportedTotal = result.totalCount;
    if (!result.items.length) { termination = 'empty_page'; break; }
    collected.push(...result.items);
    if (reportedTotal != null && collected.length >= reportedTotal) { termination = 'reported_total_reached'; break; }
    if (result.items.length < rowsPerPage && reportedTotal == null) { termination = 'short_page'; break; }
  }

  return { items: collected, params: baseParams, coverage: { pagesFetched, maxPages, rowsPerPage, reportedTotal, returnedRows: collected.length, termination, complete: reportedTotal != null && collected.length === reportedTotal } };
}

function toCsv(rows) {
  if (!rows.length) return '\uFEFFid\n';
  const fields = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        fields.push(key);
      }
    }
  }

  const escape = (value) => {
    const text = value == null ? '' : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  };

  const lines = [fields.join(',')];
  for (const row of rows) {
    lines.push(fields.map((field) => escape(row[field])).join(','));
  }
  return `\uFEFF${lines.join('\n')}\n`;
}

async function uploadCsv(config, path, csv) {
  const response = await fetch(`${config.url}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'text/csv',
      'x-upsert': 'true',
    },
    body: csv,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`supabase_storage_${response.status}: ${detail.slice(0, 240)}`);
  }
  return `${config.url}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

async function insertLog(config, row) {
  const response = await fetch(`${config.url}/rest/v1/${LOG_TABLE}`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`supabase_log_${response.status}: ${detail.slice(0, 240)}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function listLogs(config, limit = 20) {
  if (!config) return [];
  const response = await fetch(
    `${config.url}/rest/v1/${LOG_TABLE}?select=*&order=collected_at.desc&limit=${limit}`,
    {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Accept: 'application/json',
      },
    },
  );
  if (!response.ok) return [];
  return response.json();
}

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('access-control-allow-origin', origin);
  } else {
    res.setHeader('access-control-allow-origin', 'https://www.stargateedu.co.kr');
  }
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('vary', 'origin');
}

function catalogPayload() {
  return API_CATALOG.map((api) => ({
    id: api.id,
    name: api.name,
    description: api.description,
    defaultParams: {
      ...api.params,
      ...(typeof api.dynamicParams === 'function' ? api.dynamicParams() : {}),
    },
    maxPages: api.maxPages,
  }));
}

async function collectSelected(body = {}) {
  const apiKey = resolveServiceKey();
  const requested = Array.isArray(body.apis) && body.apis.length
    ? body.apis.map(String)
    : API_CATALOG.map((api) => api.id);
  const overrides = body.overrides && typeof body.overrides === 'object' ? body.overrides : {};
  const saveToSupabase = body.saveToSupabase !== false;
  const includeCsv = body.includeCsv !== false;
  const previewLimit = Math.min(50, Math.max(1, Number(body.previewLimit) || 12));

  const stamp = seoulStamp();
  const config = supabaseConfig();
  const results = [];

  for (const id of requested) {
    const api = API_CATALOG.find((item) => item.id === id);
    if (!api) {
      results.push({ id, ok: false, error: 'unknown_api' });
      continue;
    }

    try {
      const { items, params, coverage } = await paginate(api, overrides[id], apiKey);
      const csv = toCsv(items);
      // Storage object key는 ASCII만 허용된다.
      const fileName = `${api.id}_${stamp.fileStamp}.csv`;
      const storagePath = `${stamp.isoDate}/${api.id}/${fileName}`;
      let publicUrl = null;
      let log = null;

      if (saveToSupabase) {
        if (!config) throw new Error('SUPABASE_SERVICE_KEY(또는 ANON_KEY)가 없습니다.');
        publicUrl = await uploadCsv(config, storagePath, csv);
        log = await insertLog(config, {
          api_id: api.id,
          api_name: api.name,
          row_count: items.length,
          file_name: fileName,
          storage_path: storagePath,
          public_url: publicUrl,
          params,
          status: 'ok',
          collected_at: new Date().toISOString(),
        });
      }

      results.push({
        id: api.id,
        name: api.name,
        ok: true,
        rowCount: items.length,
        collectorVersion: COLLECTOR_VERSION,
        collectedAt: new Date().toISOString(),
        dataReference: api.id === 'apt_trade' ? { kind: 'contract_month', value: params.DEAL_YMD } : api.id === 'village_fcst' ? { kind: 'forecast_issue_time', value: `${params.base_date} ${params.base_time}`, observationMonth: null } : { kind: 'source_snapshot_date_unknown', value: null },
        coverage,
        params,
        fileName,
        storagePath: saveToSupabase ? storagePath : null,
        publicUrl,
        logId: log?.id || null,
        preview: items.slice(0, previewLimit),
        csv: includeCsv ? csv : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (saveToSupabase && config) {
        try {
          await insertLog(config, {
            api_id: api.id,
            api_name: api.name,
            row_count: 0,
            file_name: '',
            storage_path: '',
            public_url: '',
            params: overrides[api.id] || api.params,
            status: 'error',
            error_message: message.slice(0, 500),
            collected_at: new Date().toISOString(),
          });
        } catch (_) {
          /* 로그 실패는 본 오류를 가리지 않음 */
        }
      }

      results.push({
        id: api.id,
        name: api.name,
        ok: false,
        error: message,
        fatal: Boolean(error?.fatal),
      });

      if (error?.fatal) break;
    }
  }

  return {
    ok: results.some((row) => row.ok),
    collectedAt: new Date().toISOString(),
    seoulDate: stamp.isoDate,
    savedToSupabase: Boolean(saveToSupabase && config),
    results,
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const config = supabaseConfig();
      return res.status(200).json({
        ok: true,
        collectorVersion: COLLECTOR_VERSION,
        apis: catalogPayload(),
        supabaseConfigured: Boolean(config),
        dataGoKrConfigured: Boolean((process.env.DATA_GO_KR_API_KEY || '').trim()),
        storageBucket: STORAGE_BUCKET,
        logs: await listLogs(config, Number(req.query?.limit) || 20),
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    const payload = await collectSelected(req.body || {});
    return res.status(payload.ok ? 200 : 502).json(payload);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'collect_failed',
    });
  }
}

export const __test = {
  buildUrl,
  paginate,
  COLLECTOR_VERSION,
  toCsv,
  parseResponse,
  encodeServiceKey,
  API_CATALOG,
};
