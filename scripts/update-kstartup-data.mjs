import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const serviceKey = String(process.env.DATA_GO_KR_API_KEY || '').trim();

if (!serviceKey) throw new Error('DATA_GO_KR_API_KEY is required');

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
  } catch {
    return '';
  }
}

function normalizeItem(item) {
  const normalized = {};
  for (const [key, value] of Object.entries(item || {})) {
    if (value == null) normalized[key] = '';
    else if (/url$/i.test(key)) normalized[key] = normalizeUrl(value);
    else if (key === 'pbanc_ctnt') normalized[key] = stripHtml(value).slice(0, 4000);
    else normalized[key] = typeof value === 'string' ? value.trim() : value;
  }
  return normalized;
}

function dateDigits(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '').slice(0, 8);
  return digits.length === 8 ? digits : '';
}

function kstTodayDigits() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function uniqueValues(items, field, split = false) {
  const values = new Set();
  for (const item of items) {
    const parts = split ? String(item[field] || '').split(',') : [String(item[field] || '')];
    for (const part of parts) if (part.trim()) values.add(part.trim());
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'ko'));
}

async function fetchPage(page) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('ServiceKey', /%[0-9A-Fa-f]{2}/.test(serviceKey) ? decodeURIComponent(serviceKey) : serviceKey);
  url.searchParams.set('returnType', 'json');
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(PAGE_SIZE));
  url.searchParams.set('cond[rcrt_prgs_yn::EQ]', 'Y');
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'stargate-kstartup-daily/1.0' } });
  if (!response.ok) throw new Error(`K-Startup HTTP ${response.status}`);
  const payload = await response.json();
  return {
    items: Array.isArray(payload.data) ? payload.data.map(normalizeItem) : [],
    matchCount: payload.matchCount != null ? Number(payload.matchCount) : null,
    totalCount: Number(payload.totalCount || 0),
  };
}

const first = await fetchPage(1);
const matchingCount = first.matchCount ?? first.totalCount;
const pageCount = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
if (pageCount > MAX_PAGES) throw new Error(`Filtered result requires ${pageCount} pages; raise MAX_PAGES deliberately`);

const pages = [first];
for (let start = 2; start <= pageCount; start += 3) {
  const batch = [];
  for (let page = start; page < start + 3 && page <= pageCount; page += 1) batch.push(fetchPage(page));
  pages.push(...(await Promise.all(batch)));
}

const today = kstTodayDigits();
const seen = new Set();
const rawItems = pages.flatMap((page) => page.items).filter((item) => {
    const key = String(item.id || item.pbanc_sn || item.detl_pg_url || JSON.stringify(item));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
if (rawItems.length !== matchingCount) {
  throw new Error(`Incomplete upstream result: expected ${matchingCount}, received ${rawItems.length} unique rows`);
}

const items = rawItems
  .filter((item) => String(item.rcrt_prgs_yn || '').toUpperCase() === 'Y')
  .filter((item) => !dateDigits(item.pbanc_rcpt_end_dt) || dateDigits(item.pbanc_rcpt_end_dt) >= today)
  .sort((a, b) => (dateDigits(a.pbanc_rcpt_end_dt) || '99999999').localeCompare(dateDigits(b.pbanc_rcpt_end_dt) || '99999999'));

const output = {
  ok: true,
  source: '창업진흥원 K-Startup 조회서비스',
  fetchedAt: new Date().toISOString(),
  upstreamMatchCount: matchingCount,
  poolCount: items.length,
  facets: {
    regions: uniqueValues(items, 'supt_regin'),
    categories: uniqueValues(items, 'supt_biz_clsfc'),
    stages: uniqueValues(items, 'biz_enyy', true),
  },
  items,
};

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(here, '../data/kstartup/latest.json');
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Wrote ${items.length} active notices to ${outputPath}`);
