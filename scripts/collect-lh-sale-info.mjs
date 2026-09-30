#!/usr/bin/env node
/**
 * LH 분양정보 수집기
 * 1) data.go.kr lhLeaseNoticeInfo1 시도
 * 2) 403 등 실패 시 apply.lh.or.kr 분양공고 HTML(mi=1027) 파싱
 * 결과를 Supabase lh_sale_notices 에 upsert
 */
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.WEOLBU_SUPABASE_URL ||
  'https://inftexpcnfinglwlrvsj.supabase.co'
).replace(/\/$/, '');
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.WEOLBU_SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();
const DATA_GO_KR_API_KEY = (process.env.DATA_GO_KR_API_KEY || '').trim();
const PAGE_SIZE = Math.min(100, Math.max(1, Number(process.env.LH_PAGE_SIZE) || 30));
const PAGE_NO = Math.max(1, Number(process.env.LH_PAGE_NO) || 1);
const TYPE_CODE = process.env.LH_TYPE_CODE || '05';
const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;
const API_URL = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1';
const PORTAL_URL = 'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancList.do';

function log(msg) {
  console.log(msg);
}

function encodeServiceKey(apiKey) {
  return PCT_ENCODED.test(apiKey) ? apiKey : encodeURIComponent(apiKey);
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
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return formatDotDate(d);
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

function decodeHtml(value = '') {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeItem(row, pageNo, source) {
  const panId = pick(row, 'pan_id', 'PAN_ID');
  const panNm = pick(row, 'pan_nm', 'PAN_NM');
  if (!panId && !panNm) return null;
  return {
    pan_id: panId || `name:${panNm}`,
    pan_nm: panNm,
    upp_ais_tp_cd: pick(row, 'upp_ais_tp_cd', 'UPP_AIS_TP_CD'),
    upp_ais_tp_nm: pick(row, 'upp_ais_tp_nm', 'UPP_AIS_TP_NM'),
    ais_tp_cd: pick(row, 'ais_tp_cd', 'AIS_TP_CD'),
    ais_tp_cd_nm: pick(row, 'ais_tp_cd_nm', 'AIS_TP_CD_NM'),
    cnp_cd: pick(row, 'cnp_cd', 'CNP_CD'),
    cnp_cd_nm: pick(row, 'cnp_cd_nm', 'CNP_CD_NM'),
    pan_ss: pick(row, 'pan_ss', 'PAN_SS'),
    pan_nt_st_dt: pick(row, 'pan_nt_st_dt', 'PAN_NT_ST_DT', 'pan_dt', 'PAN_DT'),
    clsg_dt: pick(row, 'clsg_dt', 'CLSG_DT'),
    all_cnt: asInt(pick(row, 'all_cnt', 'ALL_CNT'), 0),
    dtl_url: pick(row, 'dtl_url', 'DTL_URL', 'detail_url'),
    spl_inf_tp_cd: pick(row, 'spl_inf_tp_cd', 'SPL_INF_TP_CD'),
    ccr_cnnt_sys_ds_cd: pick(row, 'ccr_cnnt_sys_ds_cd', 'CCR_CNNT_SYS_DS_CD'),
    page_no: pageNo,
    raw: { ...(row.raw && typeof row.raw === 'object' ? row.raw : row), _source: source },
    fetched_at: new Date().toISOString(),
  };
}

function looksLikeNoticeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  return Boolean(row.PAN_ID || row.pan_id || row.PAN_NM || row.pan_nm);
}

function extractListArrays(data) {
  const named = [];
  const generic = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      const rows = node.filter(looksLikeNoticeRow);
      if (rows.length) generic.push(rows);
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        const rows = value.filter(looksLikeNoticeRow);
        if (rows.length) (/^dsList/i.test(key) ? named : generic).push(rows);
      } else visit(value);
    }
  };
  visit(data);
  return named.length ? named : generic;
}

function parseOpenApiPayload(text) {
  const stripped = String(text || '').trim();
  if (!stripped) throw new Error('빈 응답');
  if (/^forbidden$/i.test(stripped)) throw new Error('403 Forbidden');
  if (stripped.startsWith('<')) {
    const code = (stripped.match(/<(?:returnReasonCode|resultCode)>([^<]+)</i) || [])[1] || '';
    const msg = (stripped.match(/<(?:returnAuthMsg|resultMsg)>([^<]+)</i) || [])[1] || code;
    if (code && !['00', '000', '0'].includes(code.trim())) throw new Error(`[${code}] ${msg}`);
    const blocks = stripped.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const items = blocks.map((block) => {
      const row = {};
      for (const match of block.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
        if (match[1].toLowerCase() === 'item') continue;
        row[match[1]] = decodeHtml(match[2]);
      }
      return row;
    });
    return { items, totalCount: asInt((stripped.match(/<ALL_CNT>([^<]+)</i) || [])[1], items.length) };
  }
  const data = JSON.parse(stripped);
  const lists = extractListArrays(data);
  const items = lists.length ? lists.reduce((a, b) => (b.length > a.length ? b : a), []) : [];
  const totalCount = asInt(items[0]?.ALL_CNT ?? items[0]?.all_cnt, items.length);
  return { items, totalCount };
}

async function fetchFromOpenApi() {
  if (!DATA_GO_KR_API_KEY) throw new Error('DATA_GO_KR_API_KEY 없음');
  const params = new URLSearchParams({
    PG_SZ: String(PAGE_SIZE),
    PAGE: String(PAGE_NO),
    PAN_NT_ST_DT: yearsAgoDot(2),
    CLSG_DT: formatDotDate(),
  });
  if (TYPE_CODE && TYPE_CODE !== 'all') params.set('UPP_AIS_TP_CD', TYPE_CODE);
  const url = `${API_URL}?serviceKey=${encodeServiceKey(DATA_GO_KR_API_KEY)}&${params}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json, text/xml, */*', 'User-Agent': 'stargate-lh-collector/1.0' },
  });
  const text = await response.text();
  if (!response.ok || /^forbidden$/i.test(text.trim())) {
    throw new Error(`openapi_http_${response.status}: ${text.slice(0, 120)}`);
  }
  const parsed = parseOpenApiPayload(text);
  const items = parsed.items
    .map((row) =>
      normalizeItem(
        {
          pan_id: pick(row, 'PAN_ID', 'pan_id'),
          pan_nm: pick(row, 'PAN_NM', 'pan_nm'),
          upp_ais_tp_cd: pick(row, 'UPP_AIS_TP_CD', 'upp_ais_tp_cd'),
          upp_ais_tp_nm: pick(row, 'UPP_AIS_TP_NM', 'upp_ais_tp_nm'),
          ais_tp_cd: pick(row, 'AIS_TP_CD', 'ais_tp_cd'),
          ais_tp_cd_nm: pick(row, 'AIS_TP_CD_NM', 'ais_tp_cd_nm'),
          cnp_cd_nm: pick(row, 'CNP_CD_NM', 'cnp_cd_nm'),
          pan_ss: pick(row, 'PAN_SS', 'pan_ss'),
          pan_nt_st_dt: pick(row, 'PAN_NT_ST_DT', 'PAN_DT', 'pan_nt_st_dt'),
          clsg_dt: pick(row, 'CLSG_DT', 'clsg_dt'),
          all_cnt: pick(row, 'ALL_CNT', 'all_cnt'),
          dtl_url: pick(row, 'DTL_URL', 'dtl_url'),
          spl_inf_tp_cd: pick(row, 'SPL_INF_TP_CD', 'spl_inf_tp_cd'),
          ccr_cnnt_sys_ds_cd: pick(row, 'CCR_CNNT_SYS_DS_CD', 'ccr_cnnt_sys_ds_cd'),
          raw: row,
        },
        PAGE_NO,
        'data.go.kr',
      ),
    )
    .filter(Boolean);
  return { items, totalCount: parsed.totalCount || items.length, source: 'data.go.kr' };
}

async function fetchFromPortal() {
  const body = new URLSearchParams({
    mi: '1027', // 분양공고
    currPage: String(PAGE_NO),
    listCo: String(PAGE_SIZE),
    uppAisTpCd: TYPE_CODE === 'all' ? '' : TYPE_CODE,
    srchUppAisTpCd: TYPE_CODE === 'all' ? '' : TYPE_CODE,
    panSs: '',
    srchY: 'Y',
    xssChk: 'N',
  });
  const response = await fetch(PORTAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html',
      'User-Agent': 'stargate-lh-collector/1.0',
    },
    body,
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`portal_http_${response.status}`);

  const tbody = (html.match(/<tbody[\s\S]*?<\/tbody>/i) || [])[0] || html;
  const rows = [];
  for (const tr of tbody.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const btn = tr.match(
      /class="[^"]*wrtancInfoBtn[^"]*"[^>]*data-id1="([^"]*)"[^>]*data-id2="([^"]*)"[^>]*data-id3="([^"]*)"[^>]*data-id4="([^"]*)"/i,
    ) || tr.match(
      /data-id1="([^"]*)"[^>]*data-id2="([^"]*)"[^>]*data-id3="([^"]*)"[^>]*data-id4="([^"]*)"[^>]*class="[^"]*wrtancInfoBtn[^"]*"/i,
    );
    if (!btn) continue;
    const titleHtml = (tr.match(/class="[^"]*wrtancInfoBtn[^"]*"[\s\S]*?<span>([\s\S]*?)<\/span>/i) || [])[1] || '';
    const title = decodeHtml(titleHtml.replace(/<em[\s\S]*?<\/em>/gi, ''));
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => decodeHtml(m[1]));
    // expected: #, type, title, region, file, start, end, status, views
    const panId = btn[1];
    const ccr = btn[2];
    const upp = btn[3];
    const ais = btn[4];
    const typeNm = tds[1] || '';
    const region = tds[3] || '';
    const start = tds[5] || '';
    const end = tds[6] || '';
    const status = tds[7] || '';
    const detail = `https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=${encodeURIComponent(panId)}&ccrCnntSysDsCd=${encodeURIComponent(ccr)}&uppAisTpCd=${encodeURIComponent(upp)}&aisTpCd=${encodeURIComponent(ais)}&mi=1027`;
    rows.push(
      normalizeItem(
        {
          pan_id: panId,
          pan_nm: title,
          upp_ais_tp_cd: upp,
          upp_ais_tp_nm: typeNm,
          ais_tp_cd: ais,
          ais_tp_cd_nm: typeNm,
          cnp_cd_nm: region,
          pan_ss: status,
          pan_nt_st_dt: start,
          clsg_dt: end,
          dtl_url: detail,
          ccr_cnnt_sys_ds_cd: ccr,
          all_cnt: 0,
          raw: { panId, ccr, upp, ais, tds },
        },
        PAGE_NO,
        'apply.lh.or.kr',
      ),
    );
  }

  const items = rows.filter(Boolean);
  if (!items.length) throw new Error('portal_parse_empty');
  return { items, totalCount: items.length, source: 'apply.lh.or.kr' };
}

async function upsertRows(items) {
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_KEY/ANON_KEY 없음');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/lh_sale_notices?on_conflict=pan_id`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(items),
  });
  if (!response.ok) {
    throw new Error(`supabase_upsert_${response.status}: ${(await response.text()).slice(0, 240)}`);
  }
}

async function insertLog(payload) {
  if (!SUPABASE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/lh_sale_fetch_logs`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });
}

async function main() {
  let result;
  let error = null;
  try {
    try {
      result = await fetchFromOpenApi();
      log(`OK openapi rows=${result.items.length}`);
    } catch (openApiError) {
      log(`WARN openapi failed: ${openApiError.message}`);
      result = await fetchFromPortal();
      log(`OK portal rows=${result.items.length} source=${result.source}`);
    }

    await upsertRows(result.items);
    await insertLog({
      page_no: PAGE_NO,
      page_size: PAGE_SIZE,
      row_count: result.items.length,
      total_count: result.totalCount,
      params: { typeCode: TYPE_CODE, source: result.source },
      status: 'ok',
      fetched_at: new Date().toISOString(),
    });

    const previewPath = 'lh-sale-info/data/latest.json';
    try {
      writeFileSync(
        previewPath,
        JSON.stringify(
          {
            collectedAt: new Date().toISOString(),
            source: result.source,
            pageNo: PAGE_NO,
            pageSize: PAGE_SIZE,
            rowCount: result.items.length,
            items: result.items,
          },
          null,
          2,
        ),
      );
      log(`Wrote ${previewPath}`);
    } catch (_) {
      /* optional in CI */
    }

    log(`DONE saved=${result.items.length} source=${result.source}`);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    log(`FAIL ${error}`);
    try {
      await insertLog({
        page_no: PAGE_NO,
        page_size: PAGE_SIZE,
        row_count: 0,
        total_count: 0,
        params: { typeCode: TYPE_CODE },
        status: 'error',
        error_message: error.slice(0, 500),
        fetched_at: new Date().toISOString(),
      });
    } catch (_) {
      /* ignore */
    }
    process.exitCode = 1;
  }
}

await main();
