/**
 * 월급쟁이부자들 공개 메인 강의 수집 → Supabase 적재
 *
 * - GitHub Actions에서 매일 09:00 KST에 CLI로 실행
 * - Vercel 호환 HTTP 핸들러도 함께 제공
 */

const BASE = 'https://weolbu.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://inftexpcnfinglwlrvsj.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_-D0A-aWNMTMTHXeL0oqBXg_9Tz0bdvs';
const TABLE = 'weolbu_classes';

async function get(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function matchArray(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) return [text.slice(start, i + 1), i + 1];
    }
  }
  return [null, start + 1];
}

function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function toTimestamp(value) {
  if (!value) return null;
  const normalized = String(value).replace(' ', 'T');
  return normalized.length === 10
    ? `${normalized}T00:00:00+09:00`
    : `${normalized.slice(0, 19)}+09:00`;
}

function discountRate(price, discountPrice) {
  if (!price || !discountPrice || price <= 0) return null;
  return Math.round(((price - discountPrice) / price) * 100);
}

function extractSections(html) {
  const sections = [];
  const namePattern = /"designModuleName":"(.*?)"/g;
  let position = 0;
  let currentName = '';

  for (;;) {
    const index = html.indexOf('"productList":[', position);
    if (index < 0) break;

    const preceding = html.slice(position, index);
    namePattern.lastIndex = 0;
    let match;
    let lastName = null;
    while ((match = namePattern.exec(preceding)) !== null) lastName = match[1];
    if (lastName) currentName = lastName;

    const arrayStart = index + '"productList":'.length;
    const [raw, end] = matchArray(html, arrayStart);
    position = end;
    if (!raw) continue;

    try {
      const items = JSON.parse(raw);
      if (Array.isArray(items) && items.length) {
        sections.push([currentName || '기타', items]);
      }
    } catch {
      // 다른 스크립트 조각은 건너뛴다.
    }
  }
  return sections;
}

function toRows(sections, collectedDate) {
  const rows = [];
  const seen = new Set();

  for (const [section, items] of sections) {
    for (const item of items) {
      const classId = item.displaySeq;
      if (classId == null) continue;
      const uniqueKey = `${section}|${classId}`;
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);

      const tags = (item.displayTags || [])
        .map((tag) => tag.tagName)
        .filter(Boolean);

      rows.push({
        collected_date: collectedDate,
        section,
        title: (item.displayName || '').trim(),
        instructors: (item.creatorNames || []).join(', '),
        sale_start: toTimestamp(item.saleStartDt),
        sale_end: toTimestamp(item.saleEndDt),
        open_date: null,
        duration: null,
        price: item.price ?? null,
        discount_price: item.discountPrice ?? null,
        discount_rate: discountRate(item.price, item.discountPrice),
        rating: item.reviewPoint ? Number(item.reviewPoint) : null,
        review_count: item.reviewCount ?? 0,
        tags: tags.join(', '),
        is_original: item.originalYn === 'Y',
        status: item.endYn === 'Y' ? '마감' : '판매중',
        class_id: classId,
        url: `${BASE}/product/${classId}`,
      });
    }
  }
  return rows;
}

const START_DATE_PATTERN = /강의시작일\s*(\d{4}-\d{2}-\d{2})/;
const DURATION_PATTERN = /(\d+)\s*일\s*\(강의시작일/;

async function fillDetails(rows, concurrency = 8) {
  const ids = [...new Set(rows.map((row) => row.class_id))];
  const details = new Map();

  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const html = await get(`${BASE}/product/${id}`, 12000);
          const startDate = START_DATE_PATTERN.exec(html);
          const duration = DURATION_PATTERN.exec(html);
          details.set(id, [
            startDate ? startDate[1] : null,
            duration ? `${duration[1]}일` : null,
          ]);
        } catch {
          details.set(id, [null, null]);
        }
      }),
    );
  }

  for (const row of rows) {
    const detail = details.get(row.class_id);
    if (detail) {
      [row.open_date, row.duration] = detail;
    }
  }
  return rows;
}

async function upsert(rows) {
  const url =
    `${SUPABASE_URL}/rest/v1/${TABLE}` +
    '?on_conflict=collected_date,section,class_id';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(
      `Supabase upsert 실패 ${response.status}: ${await response.text()}`,
    );
  }
  return rows.length;
}

async function runScrape({ detail = true } = {}) {
  const started = Date.now();
  const collectedDate = seoulToday();
  const html = await get(`${BASE}/`, 20000);
  const sections = extractSections(html);
  let rows = toRows(sections, collectedDate);

  if (!rows.length) {
    throw new Error('수집 결과 0건 — weolbu.com 구조가 변경되었을 수 있습니다.');
  }
  if (detail) rows = await fillDetails(rows);

  const count = await upsert(rows);
  return {
    ok: true,
    collected_date: collectedDate,
    sections: sections.length,
    count,
    open_date_filled: rows.filter((row) => row.open_date).length,
    elapsed_ms: Date.now() - started,
  };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const result = await runScrape({ detail: (req.query?.detail ?? '1') !== '0' });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: String(error?.message || error),
    });
  }
}

module.exports = handler;
module.exports.runScrape = runScrape;

if (require.main === module) {
  const detail = !process.argv.includes('--detail=0');
  runScrape({ detail })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
