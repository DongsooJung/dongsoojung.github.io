const VWORLD_SEARCH_ENDPOINT = "https://api.vworld.kr/req/search";
const VWORLD_DATA_ENDPOINT = "https://api.vworld.kr/req/data";
const TRADE_ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";

const ALLOWED_ORIGINS = new Set([
  "https://www.stargateedu.co.kr",
  "https://stargateedu.co.kr",
  "https://dongsoojung.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function getEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function setCors(req, res) {
  const origin = req.headers?.origin || "";
  res.setHeader(
    "access-control-allow-origin",
    ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://www.stargateedu.co.kr",
  );
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("cache-control", "no-store");
  res.setHeader("vary", "origin");
}

function normalizeQuery(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^서울시(?=\s|$)/, "서울특별시")
    .replace(/^부산시(?=\s|$)/, "부산광역시")
    .replace(/^대구시(?=\s|$)/, "대구광역시")
    .replace(/^인천시(?=\s|$)/, "인천광역시")
    .replace(/^광주시(?=\s|$)/, "광주광역시")
    .replace(/^대전시(?=\s|$)/, "대전광역시")
    .replace(/^울산시(?=\s|$)/, "울산광역시")
    .replace(/^경기(?=\s|$)/, "경기도")
    .replace(/^강원(?=\s|$)/, "강원특별자치도")
    .replace(/^충북(?=\s|$)/, "충청북도")
    .replace(/^충남(?=\s|$)/, "충청남도")
    .replace(/^전북(?=\s|$)/, "전북특별자치도")
    .replace(/^전남(?=\s|$)/, "전라남도")
    .replace(/^경북(?=\s|$)/, "경상북도")
    .replace(/^경남(?=\s|$)/, "경상남도")
    .replace(/^제주(?=\s|$)/, "제주특별자치도");
}

function validateInput(query, dealMonth, offset, limit) {
  if (query.length < 2 || query.length > 60) {
    throw new HttpError(400, "지역명은 2~60자로 입력해 주세요.");
  }
  if (!/[읍면동리]$/.test(query)) {
    throw new HttpError(
      400,
      "시·군·구와 읍·면·동까지 입력해 주세요. 예: 서울 관악구 대학동",
    );
  }
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(dealMonth)) {
    throw new HttpError(400, "거래월 형식은 YYYYMM이어야 합니다.");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new HttpError(400, "offset 값이 올바르지 않습니다.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HttpError(400, "limit 값은 1~100이어야 합니다.");
  }
}

class HttpError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "stargate-real-estate-api/1.0",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new HttpError(502, `${label} 응답을 확인할 수 없습니다.`);
  }
  if (payload.response?.status === "ERROR") {
    throw new HttpError(
      502,
      payload.response?.error?.text || `${label} 요청에 실패했습니다.`,
    );
  }
  return payload;
}

async function searchRegion(query, apiKey) {
  const params = new URLSearchParams({
    service: "search",
    request: "search",
    version: "2.0",
    crs: "EPSG:4326",
    size: "30",
    page: "1",
    query,
    type: "place",
    format: "json",
    errorformat: "json",
    key: apiKey,
  });
  const payload = await fetchJson(
    `${VWORLD_SEARCH_ENDPOINT}?${params}`,
    "VWorld 지역 검색",
  );
  const items = payload.response?.result?.items || [];
  const requestedName = query.split(" ").at(-1);
  const boundaryItems = items.filter(
    (item) =>
      item.title === requestedName &&
      String(item.category).includes("읍면동구역경계"),
  );
  const legalItem = boundaryItems.find((item) =>
    /법정동|>\s*읍$|>\s*면$/.test(String(item.category)),
  );
  const selected = legalItem || boundaryItems[0];

  if (!selected?.point?.x || !selected?.point?.y) {
    throw new HttpError(
      404,
      "입력한 읍·면·동을 찾지 못했습니다.",
      "시·도와 시·군·구를 함께 입력해 주세요.",
    );
  }

  return selected;
}

function vworldDataParams(apiKey, domain, extra) {
  return new URLSearchParams({
    service: "data",
    request: "GetFeature",
    data: "LT_C_ADEMD_INFO",
    key: apiKey,
    domain,
    format: "json",
    size: "100",
    page: "1",
    geometry: "true",
    attribute: "true",
    ...extra,
  });
}

async function legalDongAtPoint(point, apiKey, domain) {
  const params = vworldDataParams(apiKey, domain, {
    geomFilter: `point(${point.x} ${point.y})`,
  });
  const payload = await fetchJson(
    `${VWORLD_DATA_ENDPOINT}?${params}`,
    "VWorld 법정동 조회",
  );
  const feature =
    payload.response?.result?.featureCollection?.features?.[0] || null;
  if (!feature?.properties?.emd_cd) {
    throw new HttpError(404, "해당 지점의 법정동을 확인하지 못했습니다.");
  }
  return feature;
}

async function districtBoundaries(districtCode, apiKey, domain) {
  const params = vworldDataParams(apiKey, domain, {
    attrFilter: `emd_cd:like:${districtCode}`,
  });
  const payload = await fetchJson(
    `${VWORLD_DATA_ENDPOINT}?${params}`,
    "VWorld 법정동 경계 조회",
  );
  const features =
    payload.response?.result?.featureCollection?.features?.map((feature) => ({
      type: "Feature",
      id: feature.properties.emd_cd,
      properties: {
        code: feature.properties.emd_cd,
        name: feature.properties.emd_kor_nm,
        fullName: feature.properties.full_nm,
        district: feature.properties.full_nm.split(" ").at(-2),
      },
      geometry: simplifyGeometry(feature.geometry, 0.00006),
    })) || [];

  return {
    type: "FeatureCollection",
    source: "VWorld LT_C_ADEMD_INFO",
    features,
  };
}

function decodeXml(value = "") {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();
}

function readTag(xml, tag) {
  const match = String(xml).match(
    new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"),
  );
  return decodeXml(match?.[1] || "");
}

function toNumber(value) {
  const parsed = Number(String(value || "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchTradePage(districtCode, dealMonth, pageNo, rowsPerPage) {
  const serviceKey = getEnv("DATA_GO_KR_API_KEY");
  const params = new URLSearchParams({
    serviceKey,
    LAWD_CD: districtCode,
    DEAL_YMD: dealMonth,
    pageNo: String(pageNo),
    numOfRows: String(rowsPerPage),
  });
  const response = await fetch(`${TRADE_ENDPOINT}?${params}`, {
    headers: {
      accept: "application/xml",
      "user-agent": "stargate-real-estate-api/1.0",
    },
  });
  const xml = await response.text();
  const resultCode = readTag(xml, "resultCode");
  if (!response.ok || !["000", "00"].includes(resultCode)) {
    throw new HttpError(
      502,
      readTag(xml, "resultMsg") || `국토부 실거래 API 오류 ${response.status}`,
    );
  }
  return {
    totalCount: toNumber(readTag(xml, "totalCount")),
    items: xml.match(/<item>[\s\S]*?<\/item>/gi) || [],
  };
}

async function fetchDistrictTrades(districtCode, dealMonth) {
  const rowsPerPage = 1000;
  const first = await fetchTradePage(
    districtCode,
    dealMonth,
    1,
    rowsPerPage,
  );
  const blocks = [...first.items];
  const pages = Math.ceil(first.totalCount / rowsPerPage);
  if (pages > 12) {
    throw new HttpError(
      422,
      "해당 지역의 월 거래량이 조회 한도를 초과했습니다.",
    );
  }
  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchTradePage(
      districtCode,
      dealMonth,
      page,
      rowsPerPage,
    );
    blocks.push(...next.items);
  }
  return { totalCount: first.totalCount, blocks };
}

function parseTrade(block, context, globalIndex) {
  const year = readTag(block, "dealYear") || context.dealMonth.slice(0, 4);
  const month = (
    readTag(block, "dealMonth") || context.dealMonth.slice(4)
  ).padStart(2, "0");
  const day = readTag(block, "dealDay").padStart(2, "0");
  return {
    transaction_key: `${context.dealMonth}:${context.districtCode}:${globalIndex}`,
    global_index: globalIndex,
    district_code: context.districtCode,
    district_name: context.districtName,
    neighborhood: readTag(block, "umdNm"),
    apartment_name: readTag(block, "aptNm"),
    deal_date: `${year}-${month}-${day}`,
    price_manwon: Math.round(toNumber(readTag(block, "dealAmount"))),
    area_sqm: toNumber(readTag(block, "excluUseAr")),
    floor: Math.round(toNumber(readTag(block, "floor"))),
    build_year: Math.round(toNumber(readTag(block, "buildYear"))),
    jibun: readTag(block, "jibun"),
    deal_type: readTag(block, "dealingGbn"),
    agent_location: readTag(block, "estateAgentSggNm"),
    buyer_type: readTag(block, "buyerGbn"),
    seller_type: readTag(block, "slerGbn"),
    cancellation_date: readTag(block, "cdealDay"),
    registration_date: readTag(block, "rgstDate"),
  };
}

function matchesLegalDong(umdName, legalDongName) {
  return (
    umdName === legalDongName ||
    umdName.startsWith(`${legalDongName} `)
  );
}

function summarize(rows) {
  if (!rows.length) {
    return {
      averagePrice: 0,
      medianPrice: 0,
      maxPrice: 0,
      topApartment: "",
    };
  }
  const prices = rows
    .map((row) => row.price_manwon)
    .sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const median =
    prices.length % 2
      ? prices[middle]
      : Math.round((prices[middle - 1] + prices[middle]) / 2);
  const top = rows.reduce((best, row) =>
    row.price_manwon > best.price_manwon ? row : best,
  );
  return {
    averagePrice: Math.round(
      prices.reduce((sum, value) => sum + value, 0) / prices.length,
    ),
    medianPrice: median,
    maxPrice: prices.at(-1),
    topApartment: top.apartment_name || "",
  };
}

async function buildRegionResult({ query, dealMonth, offset, limit }) {
  const vworldKey = getEnv("VWORLD_API_KEY");
  const vworldDomain =
    process.env.VWORLD_DOMAIN || "https://www.stargateedu.co.kr";
  const searchItem = await searchRegion(query, vworldKey);
  const legalFeature = await legalDongAtPoint(
    searchItem.point,
    vworldKey,
    vworldDomain,
  );
  const legalCode = legalFeature.properties.emd_cd;
  const legalName = legalFeature.properties.emd_kor_nm;
  const fullName = legalFeature.properties.full_nm;
  const districtCode = legalCode.slice(0, 5);
  const fullParts = fullName.split(" ");
  const districtName = fullParts.at(-2);
  const inputType = String(searchItem.category).includes("행정동")
    ? "행정동"
    : "법정동";

  const [tradeResult, boundaries] = await Promise.all([
    fetchDistrictTrades(districtCode, dealMonth),
    districtBoundaries(districtCode, vworldKey, vworldDomain),
  ]);
  const matchingBlocks = tradeResult.blocks.filter((block) =>
    matchesLegalDong(readTag(block, "umdNm"), legalName),
  );
  const allRows = matchingBlocks.map((block, index) =>
    parseTrade(
      block,
      { dealMonth, districtCode, districtName },
      index,
    ),
  );
  const rows = allRows.slice(offset, offset + limit);

  return {
    ok: true,
    query,
    dealMonth,
    resolution: {
      inputName: searchItem.title,
      inputType,
      inputCategory: searchItem.category,
      legalDongCode: legalCode,
      legalDongName: legalName,
      legalDongFullName: fullName,
      districtCode,
      districtName,
      mapping:
        inputType === "행정동"
          ? `${searchItem.title}의 대표 지점이 속한 법정동 ${legalName}으로 집계`
          : `${legalName} 법정동으로 집계`,
      caveat:
        inputType === "행정동"
          ? `국토부 실거래 자료는 법정동 기준입니다. ${searchItem.title} 전용 수치가 아니라 ${legalName} 전체 거래량입니다.`
          : "",
    },
    totals: {
      district: tradeResult.totalCount,
      legalDong: allRows.length,
      returned: rows.length,
      offset,
      ...summarize(allRows),
    },
    rows,
    boundaries,
    sources: [
      {
        name: "국토교통부 아파트 매매 실거래가",
        grain: "계약 1건",
        month: dealMonth,
      },
      {
        name: "VWorld LT_C_ADEMD_INFO",
        grain: "법정동 경계",
      },
    ],
  };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const input = req.method === "GET" ? req.query || {} : req.body || {};
    if (!input.query && req.method === "GET") {
      return res.status(200).json({
        ok: true,
        service: "stargate-real-estate-region",
      });
    }
    const query = normalizeQuery(input.query);
    const dealMonth = String(input.dealMonth || "");
    const offset = Math.floor(Number(input.offset) || 0);
    const limit = Math.floor(Number(input.limit) || 100);
    validateInput(query, dealMonth, offset, limit);
    const result = await buildRegionResult({
      query,
      dealMonth,
      offset,
      limit,
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return res.status(status).json({
      ok: false,
      error:
        error instanceof Error ? error.message : "지역 조회에 실패했습니다.",
      detail: error?.detail || "",
    });
  }
}

function simplifyGeometry(geometry, tolerance) {
  if (!geometry) return geometry;
  const simplifyRing = (ring) => {
    if (ring.length <= 5) return ring;
    const closed = samePoint(ring[0], ring.at(-1));
    const points = closed ? ring.slice(0, -1) : ring;
    const simplified = simplifyDouglasPeucker(points, tolerance);
    if (simplified.length < 3) return ring;
    if (closed) simplified.push([...simplified[0]]);
    return simplified;
  };
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(simplifyRing),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map(simplifyRing),
      ),
    };
  }
  return geometry;
}

function simplifyDouglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const first = points[0];
  const last = points.at(-1);
  let maxSqDistance = sqTolerance;
  let index = -1;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = getSqSegmentDistance(points[i], first, last);
    if (distance > maxSqDistance) {
      index = i;
      maxSqDistance = distance;
    }
  }
  if (index === -1) return [first, last];
  const left = simplifyDouglasPeucker(points.slice(0, index + 1), tolerance);
  const right = simplifyDouglasPeucker(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

function getSqSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t =
      ((point[0] - x) * dx + (point[1] - y) * dy) /
      (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function samePoint(a, b) {
  return a?.[0] === b?.[0] && a?.[1] === b?.[1];
}

export const __test = {
  normalizeQuery,
  validateInput,
  matchesLegalDong,
  summarize,
  readTag,
  simplifyGeometry,
  buildRegionResult,
};
