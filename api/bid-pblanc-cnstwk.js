/**
 * 나라장터 공사 입찰공고(getBidPblancListInfoCnstwk) → Supabase 저장 프록시
 *
 * GET  /api/bid-pblanc-cnstwk   최근 저장 목록·로그
 * POST /api/bid-pblanc-cnstwk   100건 조회 후 upsert
 *
 * 요청주소:
 * https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk
 */

const SUPABASE_FALLBACK_URL = 'https://inftexpcnfinglwlrvsj.supabase.co';
// 공개 anon 키(정적 대시보드에도 동일하게 노출됨). RLS 정책으로 insert/update만 허용.
const SUPABASE_FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZnRleHBjbmZpbmdsd2xydnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTMyMzgsImV4cCI6MjA4ODQ4OTIzOH0.HONuULp0L3B5T0gTiwJMnowjJonJzzNHhUV_LtpDQoI';
const API_URL =
  'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk';
const TABLE = 'bid_pblanc_cnstwk';
const LOG_TABLE = 'bid_pblanc_cnstwk_fetch_logs';
const PAGE_SIZE = 100;
const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;

const ALLOWED_ORIGINS = new Set([
  'https://www.stargateedu.co.kr',
  'https://stargateedu.co.kr',
  'https://dongsoojung.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

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

function formatYmdHm(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}${map.month}${map.day}${hour}${map.minute}`;
}

function daysAgoYmdHm(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatYmdHm(d);
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

function asNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
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
  const bidNtceNo = pick(row, 'bidNtceNo', 'bid_ntce_no', 'BID_NTCE_NO');
  const bidNtceNm = pick(row, 'bidNtceNm', 'bid_ntce_nm', 'BID_NTCE_NM');
  if (!bidNtceNo && !bidNtceNm) return null;
  const bidNtceOrd = pick(row, 'bidNtceOrd', 'bid_ntce_ord', 'BID_NTCE_ORD') || '00';
  return {
    bid_ntce_no: bidNtceNo || `name:${bidNtceNm}`,
    bid_ntce_ord: bidNtceOrd,
    bid_ntce_nm: bidNtceNm,
    ntce_instt_nm: pick(row, 'ntceInsttNm', 'ntce_instt_nm', 'NTCE_INSTT_NM'),
    dminstt_nm: pick(row, 'dminsttNm', 'dminstt_nm', 'DMINSTT_NM'),
    bid_methd_nm: pick(row, 'bidMethdNm', 'bid_methd_nm', 'BID_METHD_NM'),
    cntrct_cncls_mthd_nm: pick(
      row,
      'cntrctCnclsMthdNm',
      'cntrct_cncls_mthd_nm',
      'CNTRCT_CNCLS_MTHD_NM',
    ),
    ntce_dt: pick(row, 'ntceDt', 'bidNtceDt', 'ntce_dt', 'bid_ntce_dt', 'NTCE_DT'),
    bid_clse_dt: pick(row, 'bidClseDt', 'bid_clse_dt', 'BID_CLSE_DT'),
    openg_dt: pick(row, 'opengDt', 'openg_dt', 'OPENG_DT'),
    presmpt_prce: asNumber(pick(row, 'presmptPrce', 'presmpt_prce', 'PRESMPT_PRCE')),
    bdgt_amt: asNumber(pick(row, 'bdgtAmt', 'bdgt_amt', 'BDGT_AMT')),
    bsns_div_nm: pick(row, 'bsnsDivNm', 'bsns_div_nm', 'BSNS_DIV_NM'),
    re_ntce_yn: pick(row, 'reNtceYn', 're_ntce_yn', 'RE_NTCE_YN'),
    bid_ntce_dtl_url: pick(row, 'bidNtceDtlUrl', 'bid_ntce_dtl_url', 'BID_NTCE_DTL_URL'),
    bid_ntce_url: pick(row, 'bidNtceUrl', 'bid_ntce_url', 'BID_NTCE_URL'),
    page_no: pageNo,
    raw: row,
    fetched_at: new Date().toISOString(),
  };
}

function looksLikeBidRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  return Boolean(
    row.bidNtceNo ||
      row.bid_ntce_no ||
      row.bidNtceNm ||
      row.bid_ntce_nm ||
      row.ntceInsttNm ||
      row.dminsttNm ||
      row.cntrctCnclsMthdNm,
  );
}

function extractListArrays(data) {
  const lists = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      const rows = node.filter(looksLikeBidRow);
      if (rows.length) lists.push(rows);
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;
    for (const value of Object.values(node)) visit(value);
  };
  visit(data);
  return lists;
}

function parseBidPayload(text) {
  const stripped = String(text || '').trim();
  if (!stripped) throw new Error('빈 응답을 받았습니다.');
  if (/^forbidden$/i.test(stripped)) {
    throw new Error(
      '나라장터 API 403 Forbidden. 공공데이터포털에서 「조달청_나라장터 입찰공고정보서비스」 활용신청이 승인됐는지 확인하세요. (해외 IP는 차단될 수 있습니다.)',
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
    const total = asInt((stripped.match(/<totalCount>([^<]+)</i) || [])[1], items.length);
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
  } else {
    let body = data?.response?.body || data?.body || data;
    let rawItems = body?.items ?? body?.item ?? [];
    if (rawItems && typeof rawItems === 'object' && !Array.isArray(rawItems)) {
      rawItems = rawItems.item ?? [rawItems];
    }
    if (!Array.isArray(rawItems)) rawItems = [];
    items = rawItems;
  }

  const totalCount = asInt(
    data?.response?.body?.totalCount ?? data?.body?.totalCount,
    items.length,
  );
  return { items, totalCount };
}

async function fetchBidPage({
  apiKey,
  pageNo,
  pageSize,
  inqryDiv,
  inqryBgnDt,
  inqryEndDt,
  bidNtceNo,
}) {
  const div = String(inqryDiv || '1');
  const params = {
    pageNo: String(pageNo || 1),
    numOfRows: String(pageSize || PAGE_SIZE),
    inqryDiv: div,
    type: 'json',
  };

  if (div === '2') {
    if (!bidNtceNo) throw new Error('inqryDiv=2(입찰공고번호)일 때 bidNtceNo가 필요합니다.');
    params.bidNtceNo = String(bidNtceNo);
  } else {
    params.inqryBgnDt = inqryBgnDt || daysAgoYmdHm(7);
    params.inqryEndDt = inqryEndDt || formatYmdHm();
  }

  const url = buildUrl(params, apiKey);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/xml, */*',
      'User-Agent': 'stargateedu-research-dashboard/1.0',
    },
  });
  const text = await response.text();
  if (response.status === 403 || /^forbidden$/i.test(text.trim())) {
    throw new Error(
      '나라장터 API 403 Forbidden. 「조달청_나라장터 입찰공고정보서비스」 활용신청·승인 여부와 국내 IP(Vercel icn1)를 확인하세요.',
    );
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const parsed = parseBidPayload(text);
  const normalized = parsed.items.map((row) => normalizeItem(row, pageNo)).filter(Boolean);
  return {
    items: normalized,
    totalCount: parsed.totalCount || normalized.length,
    params,
  };
}

async function upsertRows(config, rows) {
  if (!rows.length) return { saved: 0 };
  const response = await fetch(`${config.url}/rest/v1/${TABLE}?on_conflict=bid_ntce_no,bid_ntce_ord`, {
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

async function listSaved(config, limit = 100) {
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
        api: 'getBidPblancListInfoCnstwk',
        note: '나라장터 공사 입찰공고목록을 100건씩 조회·저장합니다.',
        supabaseConfigured: Boolean(config),
        dataGoKrConfigured: Boolean((process.env.DATA_GO_KR_API_KEY || '').trim()),
        saved: await listSaved(config, Number(req.query?.limit) || 100),
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
    const saveToSupabase = body.saveToSupabase !== false;
    const apiKey = resolveServiceKey(body.apiKey);

    const result = await fetchBidPage({
      apiKey,
      pageNo,
      pageSize,
      inqryDiv: body.inqryDiv || '1',
      inqryBgnDt: body.inqryBgnDt || '',
      inqryEndDt: body.inqryEndDt || '',
      bidNtceNo: body.bidNtceNo || '',
    });

    let saved = 0;
    let log = null;
    let saveWarning = '';
    if (saveToSupabase) {
      if (!config) {
        saveWarning = 'SUPABASE_SERVICE_KEY(또는 ANON_KEY)가 없어 조회만 반환합니다.';
      } else {
        try {
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
        } catch (saveError) {
          saveWarning =
            saveError instanceof Error
              ? saveError.message
              : 'supabase_save_failed';
          try {
            log = await insertLog(config, {
              page_no: pageNo,
              page_size: pageSize,
              row_count: 0,
              total_count: result.totalCount,
              params: result.params,
              status: 'error',
              error_message: saveWarning.slice(0, 500),
              fetched_at: new Date().toISOString(),
            });
          } catch (_) {
            /* ignore */
          }
        }
      }
    }

    return res.status(200).json({
      ok: true,
      pageNo,
      pageSize,
      rowCount: result.items.length,
      totalCount: result.totalCount,
      savedToSupabase: Boolean(saveToSupabase && config && saved > 0 && !saveWarning),
      saved,
      saveWarning: saveWarning || undefined,
      logId: log?.id || null,
      params: result.params,
      items: result.items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'bid_pblanc_fetch_failed';
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
  parseBidPayload,
  normalizeItem,
  buildUrl,
  encodeServiceKey,
  PAGE_SIZE,
  formatYmdHm,
  daysAgoYmdHm,
};
