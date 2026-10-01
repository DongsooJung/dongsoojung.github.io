/**
 * GH 주택청약·임대센터 공개 공고 -> existing LH Supabase pipeline.
 *
 * Reuses lh_sale_notices / lh_sale_fetch_logs so no new production DDL is required.
 */
const SUPABASE_FALLBACK_URL = 'https://inftexpcnfinglwlrvsj.supabase.co';
const SUPABASE_FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZnRleHBjbmZpbmdsd2xydnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTMyMzgsImV4cCI6MjA4ODQ4OTIzOH0.HONuULp0L3B5T0gTiwJMnowjJonJzzNHhUV_LtpDQoI';

const TABLE = 'lh_sale_notices';
const LOG_TABLE = 'lh_sale_fetch_logs';
const GH_CODES = {
  'rent-house': 'GH_RENT_HOUSE',
  'rent-store': 'GH_RENT_STORE',
  'buy-rent': 'GH_BUY_RENT',
};
const GH_CODE_SET = new Set(Object.values(GH_CODES));

const SOURCES = [
  { sourceType: 'rent-house', label: '임대주택', url: 'https://apply.gh.or.kr/sb/sr/sr7150/selectPbancRentHouseList.do' },
  { sourceType: 'rent-store', label: '임대상가', url: 'https://apply.gh.or.kr/sb/sr/sr7170/selectPbancRentSopsrtList.do' },
  { sourceType: 'buy-rent', label: '매입임대', url: 'https://apply.gh.or.kr/sb/sr/sr7155/selectPbancRentHouseList.do' },
];

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
  const url = String(process.env.SUPABASE_URL || SUPABASE_FALLBACK_URL).trim().replace(/\/$/, '');
  const serviceKey = String(
    process.env.SUPABASE_SERVICE_KEY ||
      process.env.WEOLBU_SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      '',
  ).trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || SUPABASE_FALLBACK_ANON_KEY || '').trim();
  // LH's existing RLS already permits anon upsert. Prefer service key when available,
  // otherwise use the same anon-key path as the established LH collector.
  return { url, readKey: serviceKey || anonKey, writeKey: serviceKey || anonKey, usesServiceKey: Boolean(serviceKey) };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function textOnly(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeDate(value) {
  const m = String(value || '').match(/(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
}

function asInt(value) {
  const n = Number(String(value || '').replace(/[^0-9-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseGhListHtml(html, source) {
  const rows = String(html || '').match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const out = [];
  for (const rowHtml of rows) {
    const linkMatch = rowHtml.match(
      /href=["']([^"']*selectPbancDetailView\.do\?[^"']*pbancNo=(\d+)[^"']*)["']/i,
    );
    if (!linkMatch) continue;

    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => textOnly(m[1]));
    if (cells.length < 4) continue;

    const anchorMatch = rowHtml.match(
      /<a\b[^>]*href=["'][^"']*selectPbancDetailView\.do\?[^"']*pbancNo=\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    const title = textOnly(anchorMatch?.[1] || cells[2] || '');
    if (!title) continue;

    const dates = cells.map(normalizeDate).filter(Boolean);
    const status =
      cells.find((v) => /(접수중|접수마감|모집중|모집마감|공고중|공고마감|접수예정|마감)/.test(v)) || '';
    const numericTail = [...cells].reverse().find((v) => /^\s*[\d,]+\s*$/.test(v) && asInt(v) > 0);

    let detailUrl = linkMatch[1].replace(/&amp;/g, '&');
    try { detailUrl = new URL(detailUrl, source.url).href; } catch (_) { detailUrl = source.url; }

    out.push({
      source_type: source.sourceType,
      source_label: source.label,
      pbanc_no: linkMatch[2],
      notice_type: cells[1] || source.label,
      title,
      region: cells[3] || '',
      posted_at: dates[0] || '',
      closed_at: dates[1] || '',
      status,
      views: asInt(numericTail),
      detail_url: detailUrl,
      source_url: source.url,
      raw: { cells },
      fetched_at: new Date().toISOString(),
    });
  }
  return out;
}

function toLhRow(row) {
  return {
    pan_id: `gh:${row.source_type}:${row.pbanc_no}`,
    pan_nm: row.title,
    upp_ais_tp_cd: GH_CODES[row.source_type] || 'GH',
    upp_ais_tp_nm: `GH ${row.source_label}`,
    ais_tp_cd: 'GH',
    ais_tp_cd_nm: row.notice_type,
    cnp_cd: '',
    cnp_cd_nm: row.region,
    pan_ss: row.status,
    pan_nt_st_dt: row.posted_at,
    clsg_dt: row.closed_at,
    all_cnt: 0,
    dtl_url: row.detail_url,
    spl_inf_tp_cd: row.source_type,
    ccr_cnnt_sys_ds_cd: 'GH',
    page_no: 1,
    raw: {
      provider: 'GH',
      source_type: row.source_type,
      source_label: row.source_label,
      pbanc_no: row.pbanc_no,
      source_url: row.source_url,
      views: row.views,
      cells: row.raw?.cells || [],
    },
    fetched_at: row.fetched_at,
  };
}

function fromLhRow(row) {
  const raw = row?.raw && typeof row.raw === 'object' ? row.raw : {};
  return {
    source_type: raw.source_type || row.spl_inf_tp_cd || '',
    source_label: raw.source_label || String(row.upp_ais_tp_nm || '').replace(/^GH\s*/, ''),
    pbanc_no: raw.pbanc_no || String(row.pan_id || '').split(':').pop() || '',
    notice_type: row.ais_tp_cd_nm || '',
    title: row.pan_nm || '',
    region: row.cnp_cd_nm || '',
    posted_at: row.pan_nt_st_dt || '',
    closed_at: row.clsg_dt || '',
    status: row.pan_ss || '',
    views: asInt(raw.views),
    detail_url: row.dtl_url || '',
    source_url: raw.source_url || '',
    fetched_at: row.fetched_at || '',
  };
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; STARGATE-GH-Collector/1.0; +https://www.stargateedu.co.kr)',
    },
    signal: AbortSignal.timeout(20_000),
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`${source.label} HTTP ${response.status}: ${html.slice(0, 160)}`);
  const items = parseGhListHtml(html, source);
  if (!items.length) throw new Error(`${source.label}: 공고 행 파싱 결과가 0건입니다.`);
  return { source, items };
}

async function collectGhNotices() {
  const settled = await Promise.allSettled(SOURCES.map(fetchSource));
  const items = [];
  const sourceStatus = [];
  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i];
    const source = SOURCES[i];
    if (result.status === 'fulfilled') {
      items.push(...result.value.items);
      sourceStatus.push({ source: source.sourceType, ok: true, rows: result.value.items.length });
    } else {
      sourceStatus.push({
        source: source.sourceType,
        ok: false,
        error: String(result.reason?.message || result.reason || 'fetch_failed').slice(0, 300),
      });
    }
  }
  if (!items.length) {
    throw new Error(
      `GH 공개 청약공고 수집 실패: ${sourceStatus.map((s) => `${s.source}=${s.error || '0 rows'}`).join('; ')}`,
    );
  }
  return {
    items: [...new Map(items.map((row) => [`${row.source_type}:${row.pbanc_no}`, row])).values()],
    sourceStatus,
  };
}

async function upsertRows(config, rows) {
  if (!config.writeKey) throw new Error('Supabase write key가 없습니다.');
  const lhRows = rows.map(toLhRow);
  if (!lhRows.length) return { saved: 0 };
  const response = await fetch(`${config.url}/rest/v1/${TABLE}?on_conflict=pan_id`, {
    method: 'POST',
    headers: {
      apikey: config.writeKey,
      Authorization: `Bearer ${config.writeKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(lhRows),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`supabase_upsert_${response.status}: ${detail.slice(0, 300)}`);
  }
  return { saved: lhRows.length };
}

async function insertLog(config, { rowCount, savedCount, sourceStatus, status, errorMessage = '' }) {
  if (!config.writeKey) return null;
  const payload = {
    page_no: 1,
    page_size: Math.max(rowCount, 1),
    row_count: rowCount,
    total_count: rowCount,
    params: { collector: 'gh', saved_count: savedCount, source_status: sourceStatus },
    status,
    error_message: errorMessage,
    fetched_at: new Date().toISOString(),
  };
  const response = await fetch(`${config.url}/rest/v1/${LOG_TABLE}`, {
    method: 'POST',
    headers: {
      apikey: config.writeKey,
      Authorization: `Bearer ${config.writeKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function listSaved(config, limit = 60) {
  if (!config.readKey) return [];
  const params = new URLSearchParams({
    select: '*',
    upp_ais_tp_cd: 'in.(GH_RENT_HOUSE,GH_RENT_STORE,GH_BUY_RENT)',
    order: 'pan_nt_st_dt.desc,fetched_at.desc',
    limit: String(Math.min(200, Math.max(1, limit))),
  });
  const response = await fetch(`${config.url}/rest/v1/${TABLE}?${params}`, {
    headers: { apikey: config.readKey, Authorization: `Bearer ${config.readKey}`, Accept: 'application/json' },
  });
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows.filter((row) => GH_CODE_SET.has(row.upp_ais_tp_cd)).map(fromLhRow) : [];
}

async function listLogs(config, limit = 20) {
  if (!config.readKey) return [];
  const params = new URLSearchParams({
    select: '*',
    order: 'fetched_at.desc',
    limit: '100',
  });
  const response = await fetch(`${config.url}/rest/v1/${LOG_TABLE}?${params}`, {
    headers: { apikey: config.readKey, Authorization: `Bearer ${config.readKey}`, Accept: 'application/json' },
  });
  if (!response.ok) return [];
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.params?.collector === 'gh')
    .slice(0, Math.min(50, Math.max(1, limit)))
    .map((row) => ({
      ...row,
      saved_count: row.params?.saved_count || 0,
      source_status: row.params?.source_status || [],
    }));
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const config = supabaseConfig();
  const wantsCollect = req.method === 'GET' && String(req.query?.action || '') === 'collect';

  if (req.method === 'GET' && !wantsCollect) {
    return res.status(200).json({
      ok: true,
      source: 'GH주택청약·임대센터 공개 청약공고',
      storage: 'lh_sale_notices',
      categories: SOURCES.map((s) => ({ sourceType: s.sourceType, label: s.label, url: s.url })),
      supabaseReadable: Boolean(config.readKey),
      supabaseWritable: Boolean(config.writeKey),
      usingServiceKey: config.usesServiceKey,
      saved: await listSaved(config, Number(req.query?.limit) || 60),
      logs: await listLogs(config, Number(req.query?.logLimit) || 20),
    });
  }

  if (req.method !== 'POST' && !wantsCollect) {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const collected = await collectGhNotices();
    const saved = (await upsertRows(config, collected.items)).saved;
    const log = await insertLog(config, {
      rowCount: collected.items.length,
      savedCount: saved,
      sourceStatus: collected.sourceStatus,
      status: 'ok',
    });
    return res.status(200).json({
      ok: true,
      rowCount: collected.items.length,
      saved,
      logId: log?.id || null,
      sourceStatus: collected.sourceStatus,
      items: collected.items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'gh_sale_fetch_failed';
    try {
      await insertLog(config, {
        rowCount: 0,
        savedCount: 0,
        sourceStatus: [],
        status: 'error',
        errorMessage: message.slice(0, 500),
      });
    } catch (_) {}
    return res.status(502).json({ ok: false, error: message });
  }
}

export const __test = { parseGhListHtml, normalizeDate, SOURCES, toLhRow, fromLhRow };
