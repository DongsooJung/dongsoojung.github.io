/**
 * Google Trends 급상승 검색어 프록시.
 * trends.google.com/trending 페이지의 AF_initDataCallback(ds:0)을 파싱해
 * 상위 N건(기본 100)을 JSON으로 반환한다.
 *
 * GET /api/google-trends?geo=KR&hours=48&limit=100
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CATEGORY_LABELS = {
  0: "전체",
  1: "자동차·교통",
  2: "미용·패션",
  3: "비즈니스·산업",
  4: "연예·엔터",
  5: "기후·날씨",
  6: "전자제품",
  7: "금융",
  8: "음식·음료",
  9: "게임",
  10: "건강",
  11: "취미·레저",
  12: "직업·교육",
  13: "법률·정부",
  14: "기타",
  15: "애완동물",
  16: "정치",
  17: "스포츠",
  18: "여행",
  19: "과학",
  20: "쇼핑",
  21: "사회",
};

const GEO_HL = {
  KR: "ko",
  US: "en-US",
  JP: "ja",
  GB: "en-GB",
  IN: "en-IN",
  DE: "de",
  FR: "fr",
  BR: "pt-BR",
  TW: "zh-TW",
  AU: "en-AU",
  CA: "en-CA",
  ID: "id",
  TH: "th",
  VN: "vi",
  MX: "es-MX",
  SG: "en-SG",
  HK: "zh-HK",
};

const allowedOrigins = new Set([
  "https://stargateedu.co.kr",
  "https://www.stargateedu.co.kr",
  "https://dongsoojung.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function categoryLabel(cats) {
  if (!Array.isArray(cats) || !cats.length) return "미분류";
  const id = Number(cats[0]);
  return CATEGORY_LABELS[id] || `카테고리 ${id}`;
}

function parseRows(html) {
  const m = html.match(
    /AF_initDataCallback\(\{key:\s*'ds:0'[\s\S]*?data:([\s\S]+?),\s*sideChannel:\s*\{\}\}\);/,
  );
  if (!m) throw new Error("ds0_payload_missing");
  const payload = JSON.parse(m[1]);
  const rows = payload?.[1];
  if (!Array.isArray(rows)) throw new Error("ds0_rows_invalid");
  return rows;
}

function mapRow(row, geo) {
  if (!Array.isArray(row) || !row[0] || typeof row[0] !== "string") return null;
  const title = row[0].trim();
  if (!title) return null;
  const startedAt =
    Array.isArray(row[3]) && row[3][0] != null ? Number(row[3][0]) : null;
  const volume = row[6] != null ? Number(row[6]) || 0 : 0;
  const related = Array.isArray(row[9])
    ? row[9].filter(Boolean).map(String).slice(0, 12)
    : [];
  const categories = Array.isArray(row[10])
    ? row[10].filter((x) => typeof x === "number").map(Number)
    : [];
  return {
    title,
    volume,
    geo,
    startedAt,
    related,
    categories,
    category: categoryLabel(categories),
    exploreUrl:
      `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}` +
      `&date=now+1-d&geo=${encodeURIComponent(geo)}&hl=ko`,
  };
}

function dedupeRank(items, limit) {
  const best = new Map();
  for (const it of items) {
    const key = it.title.toLowerCase();
    const prev = best.get(key);
    if (!prev || it.volume > prev.volume) best.set(key, it);
  }
  return [...best.values()]
    .sort((a, b) => b.volume - a.volume || a.title.localeCompare(b.title, "ko"))
    .slice(0, limit)
    .map((it, i) => ({ ...it, rank: i + 1 }));
}

function summarize(items) {
  const volumes = items.map((x) => x.volume).filter((v) => v > 0);
  const catCounts = {};
  for (const it of items) {
    const c = it.category || "미분류";
    catCounts[c] = (catCounts[c] || 0) + 1;
  }
  const categories = Object.entries(catCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, "ko"));
  const sum = volumes.reduce((a, b) => a + b, 0);
  return {
    count: items.length,
    totalVolume: sum,
    avgVolume: volumes.length ? Math.round(sum / volumes.length) : 0,
    maxVolume: volumes.length ? Math.max(...volumes) : 0,
    minVolume: volumes.length ? Math.min(...volumes) : 0,
    topTitle: items[0]?.title || null,
    categories,
  };
}

async function fetchGeo(geo, hours) {
  const hl = GEO_HL[geo] || "en";
  const url =
    `https://trends.google.com/trending?geo=${encodeURIComponent(geo)}` +
    `&hl=${encodeURIComponent(hl)}&hours=${hours}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`trends_http_${res.status}`);
  const html = await res.text();
  return parseRows(html)
    .map((row) => mapRow(row, geo))
    .filter(Boolean);
}

function parseParamList(raw, fallback) {
  const text = String(raw || fallback || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return text.length ? text : fallback.split(",");
}

export default async function handler(req, res) {
  const origin = String(req.headers.origin || "");
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  try {
    const q = req.query || {};
    const geos = parseParamList(q.geo, "KR").slice(0, 8);
    let hours = Number(q.hours || 48);
    if (![4, 24, 48, 168].includes(hours)) hours = 48;
    let limit = Number(q.limit || 100);
    if (!Number.isFinite(limit) || limit < 1) limit = 100;
    limit = Math.min(200, Math.floor(limit));

    const collected = [];
    const errors = [];
    for (const geo of geos) {
      try {
        const items = await fetchGeo(geo, hours);
        collected.push(...items);
      } catch (err) {
        errors.push({ geo, error: String(err?.message || err) });
      }
    }

    if (!collected.length) {
      res.status(502).json({
        error: "fetch_failed",
        message: "Google Trends 데이터를 가져오지 못했습니다.",
        errors,
      });
      return;
    }

    const items = dedupeRank(collected, limit);
    res.setHeader(
      "Cache-Control",
      "public, max-age=120, s-maxage=300, stale-while-revalidate=600",
    );
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      sourceMode: "api",
      source: "Google Trends (trends.google.com/trending)",
      geo: geos,
      hours,
      limit,
      fetchedCount: collected.length,
      uniqueCount: items.length,
      errors,
      summary: summarize(items),
      items,
    });
  } catch (err) {
    res.status(500).json({
      error: "internal_error",
      message: String(err?.message || err),
    });
  }
}
