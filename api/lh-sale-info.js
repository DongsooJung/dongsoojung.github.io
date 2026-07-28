/**
 * LH 분양정보(분양임대공고문 · 분양주택) → Supabase 저장 프록시
 *
 * GET  /api/lh-sale-info   최근 저장 목록·로그
 * POST /api/lh-sale-info   30건 조회 후 upsert
 *
 * 공지사항(lhNotice*)가 아니라 분양임대공고문(lhLeaseNoticeInfo1)을 사용합니다.
 * 기본 유형: UPP_AIS_TP_CD=05 (분양주택)
 */

const SUPABASE_FALLBACK_URL = 'https://inftexpcnfinglwlrvsj.supabase.co';
// 공개 anon 키(정적 대시보드에도 동일하게 노출됨). RLS 정책으로 insert/update만 허용.
const SUPABASE_FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZnRleHBjbmZpbmdsd2xydnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTMyMzgsImV4cCI6MjA4ODQ4OTIzOH0.HONuULp0L3B5T0gTiwJMnowjJonJzzNHhUV_LtpDQoI';
const API_URL = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1';
const TABLE = 'lh_sale_notices';
const LOG_TABLE = 'lh_sale_fetch_logs';
const PAGE_SIZE = 30;
const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;

const ALLOWED_ORIGINS = new Set([
  'https://www.stargateedu.co.kr',
  'https://stargateedu.co.kr',
  'https://dongsoojung.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const SALE_TYPE_CODES = new Set(['05', '39', '01']); // 분양주택, 신혼희망타운, 토지

function setCors(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader(
    'access-control-allow-origin',
    ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.stargateedu.co.kr',
  );
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('vary', 'origin');
}

function supabaseConfig() {
  const key = String(
    process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      SUPABASE_FALLBACK_KEY ||
      '',
  ).trim();
  if (!key) return null;
  return {
    url: String(process.env.SUPABASE_URL || SUPABASE_FALLBACK_URL)
      .trim()
      .replace(/\/$/, ''),
    key,
  };
}

function encodeServiceKey(apiKey) {
  return PCT_ENCODED.test(apiKey) ? apiKey : encodeURIComponent(apiKey);
}

function resolveServiceKey(bodyKey) {
  const key = String(bodyKey || process.env.DATA_GO_KR_API_KEY || '').trim();
  if (!key) throw new Error('DATA_GO_KR_API_KEY(또는 요청 body.apiKey)가 필요합니다.');
  return key;
}

function formatDotDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${map.year}.${map.month}.${map.day}`;
}

function yearsAgoDot(years) {
  const now = new Date();
  now.setFullYear(now.getFullYear() - years);
  return formatDotDate(now);
}

function buildUrl(params, apiKey) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (key === 'serviceKey' || value == null || value === '') continue;
    query.set(key, String(value));
  }
  const rest = query.toString();
  const keyPart = `serviceKey=${encodeServiceKey(apiKey)}`;
  return rest ? `${API_URL}?${keyPart}&${rest}` : `${API_URL}?${keyPart}`;
}

function asInt(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (row?.[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim();
  }
  return '';
}

function normalizeItem(row, pageNo) {
  if (!row || typeof row !== 'object') return null;
  const panId = pick(row, 'PAN_ID', 'pan_id', 'PanId');
  const panNm = pick(row, 'PAN_NM', 'pan_nm', 'PanNm');
  if (!panId && !panNm) return null;
  return {
    pan_id: panId || `name:${panNm}`,
    pan_nm: panNm,
    upp_ais_tp_cd: pick(row, 'UPP_AIS_TP_CD', 'upp_ais_tp_cd'),
    upp_ais_tp_nm: pick(row, 'UPP_AIS_TP_NM', 'upp_ais_tp_nm'),
    ais_tp_cd: pick(row, 'AIS_TP_CD', 'ais_tp_cd'),
    ais_tp_cd_nm: pick(row, 'AIS_TP_CD_NM', 'ais_tp_cd_nm'),
    cnp_cd: pick(row, 'CNP_CD', 'cnp_cd'),
    cnp_cd_nm: pick(row, 'CNP_CD_NM', 'cnp_cd_nm'),
    pan_ss: pick(row, 'PAN_SS', 'pan_ss'),
    pan_nt_st_dt: pick(row, 'PAN_NT_ST_DT', 'PAN_DT', 'pan_nt_st_dt', 'pan_dt'),
    clsg_dt: pick(row, 'CLSG_DT', 'clsg_dt'),
    all_cnt: asInt(pick(row, 'ALL_CNT', 'all_cnt'), 0),
    dtl_url: pick(row, 'DTL_URL', 'detail_url', 'dtl_url'),
    spl_inf_tp_cd: pick(row, 'SPL_INF_TP_CD', 'spl_inf_tp_cd'),
    ccr_cnnt_sys_ds_cd: pick(row, 'CCR_CNNT_SYS_DS_CD', 'ccr_cnnt_sys_ds_cd'),
    page_no: pageNo,
    raw: row,
    fetched_at: new Date().toISOString(),
  };
}

function looksLikeNoticeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  return Boolean(
    row.PAN_ID ||
      row.pan_id ||
      row.PAN_NM ||
      row.pan_nm ||
      row.UPP_AIS_TP_CD ||
      row.upp_ais_tp_cd ||
      row.DTL_URL ||
      row.dtl_url,
  );
}

function extractListArrays(data) {
  const namedLists = [];
  const genericLists = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      const rows = node.filter(looksLikeNoticeRow);
      if (rows.length) genericLists.push(rows);
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        const rows = value.filter(looksLikeNoticeRow);
        if (rows.length) {
          if (/^dsList/i.test(key)) namedLists.push(rows);
          else genericLists.push(rows);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(data);
  return namedLists.length ? namedLists : genericLists;
}

function parseLhPayload(text) {
  const stripped = String(text || '').trim();
  if (!stripped) throw new Error('빈 응답을 받았습니다.');
  if (/^forbidden$/i.test(stripped)) {
    throw new Error(
      'LH API 403 Forbidden. 공공데이터포털에서 「분양임대공고문 조회 서비스」 활용신청이 승인됐는지 확인하세요.',
    );
  }
  if (stripped.startsWith('<')) {
    const code = (stripped.match(/<(?:returnReasonCode|resultCode)>([^<]+)</i) || [])[1] || '';
    const msg = (stripped.match(/<(?:returnAuthMsg|resultMsg)>([^<]+)</i) || [])[1] || code;
    if (code && !['00', '000', '0'].includes(code.trim())) {
      throw new Error(`[${code}] ${msg}`);
    }
    const blocks = stripped.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const items = blocks.map((block) => {
      const row = {};
      for (const match of block.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
        if (match[1].toLowerCase() === 'item') continue;
        row[match[1]] = match[2]
          .replaceAll('&lt;', '<')
          .replaceAll('&gt;', '>')
          .replaceAll('&quot;', '"')
          .replaceAll('&apos;', "'")
          .replaceAll('&amp;', '&')
          .trim();
      }
      return row;
    });
    const total = asInt((stripped.match(/<ALL_CNT>([^<]+)</i) || [])[1], items.length);
    return { items, totalCount: total };
  }

  let data;
  try {
    data = JSON.parse(stripped);
  } catch (error) {
    throw new Error(`응답 파싱 실패: ${error.message}. 원문: ${stripped.slice(0, 180)}`);
  }

  const header = data?.header || data?.response?.header;
  if (header) {
    const code = String(header.resultCode || header.returnReasonCode || '').trim();
    const msg = String(header.resultMsg || header.returnAuthMsg || '').trim();
    if (code && !['00', '000', '0', 'NORMAL_SERVICE', 'NORMAL SERVICE.'].includes(code)) {
      throw new Error(`[${code}] ${msg || '상세 메시지 없음'}`);
    }
  }

  let items = [];
  const listArrays = extractListArrays(data);
  if (listArrays.length) {
    items = listArrays.reduce((a, b) => (b.length > a.length ? b : a), []);
  } else if (Array.isArray(data)) {
    items = data.filter((row) => row && typeof row === 'object' && !Array.isArray(row) && (row.PAN_NM || row.pan_nm || row.PAN_ID));
  } else {
    let body = data?.response?.body || data?.body || data;
    let rawItems = body?.items ?? body?.item ?? [];
    if (rawItems && typeof rawItems === 'object' && !Array.isArray(rawItems)) rawItems = rawItems.item ?? [rawItems];
    if (!Array.isArray(rawItems)) rawItems = [];
    items = rawItems;
  }

  const totalCount =
    asInt(items[0]?.ALL_CNT ?? items[0]?.all_cnt, 0) ||
    asInt(data?.response?.body?.totalCount ?? data?.body?.totalCount, items.length);

  return { items, totalCount };
}

async function fetchLhPage({ apiKey, pageNo, pageSize, typeCode, regionCode, status, startDate, endDate }) {
  const params = {
    PG_SZ: String(pageSize || PAGE_SIZE),
    PAGE: String(pageNo || 1),
    PAN_NT_ST_DT: startDate || yearsAgoDot(2),
    CLSG_DT: endDate || formatDotDate(),
  };
  if (typeCode) params.UPP_AIS_TP_CD = String(typeCode);
  if (regionCode) params.CNP_CD = String(regionCode);
  if (status) params.PAN_SS = String(status);

  const url = buildUrl(params, apiKey);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/xml, */*',
      'User-Agent': 'stargate-lh-sale-info/1.0',
    },
  });
  const text = await response.text();
  if (response.status === 403 || /^forbidden$/i.test(text.trim())) {
    throw new Error(
      'LH API 403 Forbidden. 「한국토지주택공사_분양임대공고문 조회 서비스」 활용신청·승인 여부를 확인하세요.',
    );
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const parsed = parseLhPayload(text);
  const normalized = parsed.items
    .map((row) => normalizeItem(row, pageNo))
    .filter(Boolean)
    .filter((row) => {
      if (!typeCode) return SALE_TYPE_CODES.has(row.upp_ais_tp_cd) || !row.upp_ais_tp_cd;
      return true;
    });
  return {
    items: normalized,
    totalCount: parsed.totalCount || normalized[0]?.all_cnt || normalized.length,
    params,
  };
}

async function upsertRows(config, rows) {
  if (!rows.length) return { saved: 0 };
  const response = await fetch(`${config.url}/rest/v1/${TABLE}?on_conflict=pan_id`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`supabase_upsert_${response.status}: ${detail.slice(0, 240)}`);
  }
  return { saved: rows.length };
}

async function insertLog(config, row) {
  if (!config) return null;
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
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function listSaved(config, limit = 30) {
  if (!config) return [];
  const response = await fetch(
    `${config.url}/rest/v1/${TABLE}?select=*&order=fetched_at.desc&limit=${limit}`,
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

async function listLogs(config, limit = 20) {
  if (!config) return [];
  const response = await fetch(
    `${config.url}/rest/v1/${LOG_TABLE}?select=*&order=fetched_at.desc&limit=${limit}`,
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

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const config = supabaseConfig();

    const wantsCollect =
      req.method === 'GET' && String(req.query?.action || '') === 'collect';

    if (req.method === 'GET' && !wantsCollect) {
      return res.status(200).json({
        ok: true,
        pageSize: PAGE_SIZE,
        api: 'lhLeaseNoticeInfo1',
        note: '공지사항이 아닌 LH 분양임대공고문(기본: 분양주택 05)을 조회합니다.',
        supabaseConfigured: Boolean(config),
        dataGoKrConfigured: Boolean((process.env.DATA_GO_KR_API_KEY || '').trim()),
        saved: await listSaved(config, Number(req.query?.limit) || 30),
        logs: await listLogs(config, Number(req.query?.logLimit) || 20),
      });
    }

    if (req.method !== 'POST' && !wantsCollect) {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    let body = wantsCollect ? req.query || {} : req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        body = {};
      }
    }
    const pageNo = Math.max(1, Number(body.pageNo) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(body.pageSize) || PAGE_SIZE));
    const typeCode = body.typeCode == null || body.typeCode === '' ? '05' : String(body.typeCode);
    const saveToSupabase = body.saveToSupabase !== false;
    const apiKey = resolveServiceKey(body.apiKey);

    const result = await fetchLhPage({
      apiKey,
      pageNo,
      pageSize,
      typeCode: typeCode === 'all' ? '' : typeCode,
      regionCode: body.regionCode || '',
      status: body.status || '',
      startDate: body.startDate || '',
      endDate: body.endDate || '',
    });

    let saved = 0;
    let log = null;
    if (saveToSupabase) {
      if (!config) throw new Error('SUPABASE_SERVICE_KEY(또는 ANON_KEY)가 없습니다.');
      saved = (await upsertRows(config, result.items)).saved;
      log = await insertLog(config, {
        page_no: pageNo,
        page_size: pageSize,
        row_count: result.items.length,
        total_count: result.totalCount,
        params: result.params,
        status: 'ok',
        fetched_at: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      ok: true,
      pageNo,
      pageSize,
      rowCount: result.items.length,
      totalCount: result.totalCount,
      savedToSupabase: Boolean(saveToSupabase && config),
      saved,
      logId: log?.id || null,
      params: result.params,
      items: result.items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'lh_sale_fetch_failed';
    const config = supabaseConfig();
    if (config) {
      try {
        await insertLog(config, {
          page_no: Number(req.body?.pageNo) || 1,
          page_size: Number(req.body?.pageSize) || PAGE_SIZE,
          row_count: 0,
          total_count: 0,
          params: req.body || {},
          status: 'error',
          error_message: message.slice(0, 500),
          fetched_at: new Date().toISOString(),
        });
      } catch (_) {
        /* ignore */
      }
    }
    return res.status(502).json({ ok: false, error: message });
  }
}

export const __test = {
  parseLhPayload,
  normalizeItem,
  buildUrl,
  encodeServiceKey,
  PAGE_SIZE,
};
