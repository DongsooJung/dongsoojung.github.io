import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PAGE_SIZE = 100;
const MAX_RECORDS = 10_000;
const DEMO_RECORDS = 300;
const outputPath = resolve("strategy/used-car/data/latest.json");
const feedUrl = process.env.USED_CAR_FEED_URL?.trim();
const feedToken = process.env.USED_CAR_FEED_TOKEN?.trim();
const licensedDirectFeed = /^true$/i.test(process.env.USED_CAR_FEED_LICENSED ?? "");

const SAMPLE_SEED = 20_260_810;
const makeTargets = [
  ["현대", 0.27], ["기아", 0.24], ["제네시스", 0.09], ["쉐보레", 0.07], ["KG모빌리티", 0.06],
  ["르노코리아", 0.05], ["BMW", 0.07], ["벤츠", 0.07], ["아우디", 0.04], ["테슬라", 0.04],
];
const fuelTargets = [["가솔린", 0.45], ["디젤", 0.23], ["하이브리드", 0.18], ["전기", 0.08], ["LPG", 0.06]];
const ageTargets = [["0–2년", 0.12], ["3–5년", 0.28], ["6–9년", 0.32], ["10–14년", 0.20], ["15년 이상", 0.08]];
const regionTargets = [["서울", 0.18], ["경기", 0.30], ["인천", 0.08], ["부산", 0.09], ["대구", 0.07], ["대전", 0.05], ["광주", 0.05], ["울산", 0.03], ["기타", 0.15]];
const modelCatalog = {
  "현대": [["그랜저", 5_400], ["쏘나타", 3_600], ["아반떼", 2_700], ["싼타페", 4_700], ["투싼", 3_700]],
  "기아": [["쏘렌토", 4_900], ["카니발", 5_100], ["스포티지", 3_800], ["K5", 3_500], ["K8", 4_600]],
  "제네시스": [["G80", 7_600], ["GV70", 6_500], ["GV80", 8_300], ["G70", 5_200]],
  "쉐보레": [["트레일블레이저", 3_200], ["트랙스", 2_900], ["스파크", 1_500], ["콜로라도", 4_500]],
  "KG모빌리티": [["토레스", 3_500], ["렉스턴", 4_700], ["티볼리", 2_500], ["코란도", 3_000]],
  "르노코리아": [["QM6", 3_500], ["SM6", 3_000], ["XM3", 2_900], ["아르카나", 3_300]],
  "BMW": [["5시리즈", 7_900], ["3시리즈", 6_100], ["X3", 7_800], ["X5", 11_200]],
  "벤츠": [["E클래스", 8_200], ["C클래스", 6_800], ["GLC", 8_000], ["GLE", 11_400]],
  "아우디": [["A6", 7_500], ["A4", 5_800], ["Q5", 7_700], ["Q7", 10_500]],
  "테슬라": [["모델3", 5_200], ["모델Y", 6_200], ["모델S", 11_000], ["모델X", 13_000]],
};

function seededRandom(seed = SAMPLE_SEED) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function quotaValues(targets, size) {
  const quotas = targets.map(([label, share]) => ({ label, share, exact: share * size, count: Math.floor(share * size) }));
  let remainder = size - quotas.reduce((sum, item) => sum + item.count, 0);
  quotas.sort((a, b) => (b.exact - b.count) - (a.exact - a.count));
  for (let index = 0; index < remainder; index += 1) quotas[index].count += 1;
  return quotas.flatMap((item) => Array(item.count).fill(item.label));
}

function shuffle(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function ageFromBand(band, random) {
  const ranges = { "0–2년": [0, 2], "3–5년": [3, 5], "6–9년": [6, 9], "10–14년": [10, 14], "15년 이상": [15, 20] };
  const [minimum, maximum] = ranges[band];
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function demoListings() {
  const today = new Date().toISOString();
  const random = seededRandom();
  const sampledMakes = shuffle(quotaValues(makeTargets, DEMO_RECORDS), random);
  const sampledFuels = shuffle(quotaValues(fuelTargets, DEMO_RECORDS), random);
  const sampledAges = shuffle(quotaValues(ageTargets, DEMO_RECORDS), random);
  const sampledRegions = shuffle(quotaValues(regionTargets, DEMO_RECORDS), random);
  const teslaIndexes = sampledMakes.map((make, index) => make === "테슬라" ? index : -1).filter((index) => index >= 0);
  const electricDonors = sampledFuels.map((fuel, index) => fuel === "전기" && sampledMakes[index] !== "테슬라" ? index : -1).filter((index) => index >= 0);
  for (const teslaIndex of teslaIndexes) {
    if (sampledFuels[teslaIndex] === "전기") continue;
    const donorIndex = electricDonors.pop();
    if (donorIndex === undefined) break;
    [sampledFuels[teslaIndex], sampledFuels[donorIndex]] = [sampledFuels[donorIndex], sampledFuels[teslaIndex]];
  }
  return Array.from({ length: DEMO_RECORDS }, (_, index) => {
    const make = sampledMakes[index];
    const fuel = sampledFuels[index];
    const ageBand = sampledAges[index];
    const vehicleAge = ageFromBand(ageBand, random);
    const year = new Date().getUTCFullYear() - vehicleAge;
    const catalog = modelCatalog[make];
    const [model, newPrice] = catalog[Math.floor(random() * catalog.length)];
    const annualMileage = 9_000 + Math.round(random() * 10_000);
    const mileage = Math.max(2_000, vehicleAge * annualMileage + Math.round(random() * 8_000 - 4_000));
    const fuelFactor = { "가솔린": 1, "디젤": 0.96, "하이브리드": 1.08, "전기": 1.04, "LPG": 0.88 }[fuel] ?? 1;
    const depreciation = Math.max(0.16, Math.pow(0.86, vehicleAge));
    const conditionFactor = 0.88 + random() * 0.24;
    const mileagePenalty = Math.max(0.72, 1 - Math.max(0, mileage - vehicleAge * 12_000) / 600_000);
    const price = Math.max(250, Math.round((newPrice * fuelFactor * depreciation * conditionFactor * mileagePenalty) / 10) * 10);
    return {
      externalId: `STAT-${String(index + 1).padStart(4, "0")}`,
      make,
      model,
      trim: ["프리미엄", "모던", "인스퍼레이션", "럭셔리", "기본형"][index % 5],
      year,
      mileage,
      fuel,
      transmission: "자동",
      region: sampledRegions[index],
      price,
      sampleStratum: make,
      ageBand,
      sampleWeight: 1,
      provider: "합성 층화표본",
      listingUrl: null,
      updatedAt: today,
    };
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const [headers = [], ...body] = rows.filter((item) => item.some((cell) => cell.trim()));
  return body.map((cells) => Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index] ?? ""])));
}

async function loadListings() {
  if (!feedUrl) return { listings: demoListings(), mode: "demo", source: "합성 층화표본 데이터" };
  const url = new URL(feedUrl);
  if (url.protocol !== "https:") throw new Error("매물 피드는 HTTPS URL이어야 합니다.");
  if (!licensedDirectFeed && /(^|\.)(encar\.com|kbchachacha\.com)$/i.test(url.hostname)) {
    throw new Error("플랫폼 원사이트 직접 수집은 차단됩니다. 제휴·라이선스 피드 URL을 사용하세요.");
  }
  const headers = { accept: "text/csv, application/json", "user-agent": "STARGATE-Used-Car-Market/1.0" };
  if (feedToken) headers.authorization = `Bearer ${feedToken}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`매물 피드 요청 실패: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const payload = /json/i.test(contentType) || /^[\s\r\n]*[\[{]/.test(text) ? JSON.parse(text) : parseCsv(text);
  const listings = Array.isArray(payload) ? payload : payload.listings ?? payload.vehicles ?? payload.data;
  if (!Array.isArray(listings)) throw new Error("피드는 배열 또는 listings/vehicles/data 배열이어야 합니다.");
  return { listings, mode: "authorized", source: url.hostname };
}

const pick = (item, keys, fallback = "") => keys.map((key) => item[key]).find((value) => value !== undefined && value !== null && value !== "") ?? fallback;
const number = (value, fallback = 0) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

function normalize(item, index) {
  const updated = new Date(pick(item, ["updatedAt", "updated_at", "수정일", "등록일"], Date.now()));
  const safeUpdated = Number.isNaN(updated.getTime()) ? new Date() : updated;
  const listingUrl = pick(item, ["listingUrl", "listing_url", "url", "매물URL"], null);
  return {
    id: String(pick(item, ["externalId", "id", "vehicleId", "매물번호"], `CAR-${index + 1}`)).slice(0, 100),
    make: String(pick(item, ["make", "manufacturer", "brand", "제조사", "브랜드"], "미기재")).slice(0, 50),
    model: String(pick(item, ["model", "modelName", "차명", "모델"], "미기재")).slice(0, 80),
    trim: String(pick(item, ["trim", "grade", "등급", "트림"], "")).slice(0, 100),
    year: Math.round(number(pick(item, ["year", "modelYear", "연식", "연형"]), 0)),
    mileage: Math.max(0, Math.round(number(pick(item, ["mileage", "odometer", "주행거리"]), 0))),
    fuel: String(pick(item, ["fuel", "fuelType", "연료"], "미기재")).slice(0, 30),
    transmission: String(pick(item, ["transmission", "변속기"], "미기재")).slice(0, 30),
    region: String(pick(item, ["region", "location", "지역"], "미기재")).slice(0, 50),
    price: Math.max(0, Math.round(number(pick(item, ["price", "priceManwon", "판매가격", "가격"]), 0))),
    provider: String(pick(item, ["provider", "platform", "source", "플랫폼"], "승인 피드")).slice(0, 60),
    sampleStratum: String(pick(item, ["sampleStratum", "sample_stratum", "표본층"], "미분류")).slice(0, 50),
    ageBand: String(pick(item, ["ageBand", "age_band", "차령구간"], "미분류")).slice(0, 30),
    sampleWeight: Math.max(0, number(pick(item, ["sampleWeight", "sample_weight", "표본가중치"], 1), 1)),
    listingUrl: listingUrl && /^https:\/\//i.test(String(listingUrl)) ? String(listingUrl).slice(0, 500) : null,
    updatedAt: safeUpdated.toISOString(),
  };
}

const { listings, mode, source } = await loadListings();
const normalized = listings.slice(0, MAX_RECORDS).map(normalize).filter((item) => item.price > 0 && item.model !== "미기재");
const prices = normalized.map((item) => item.price).sort((a, b) => a - b);
const average = prices.length ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length) : 0;
const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
const variance = prices.length > 1 ? prices.reduce((sum, price) => sum + (price - average) ** 2, 0) / (prices.length - 1) : 0;
const standardError = prices.length ? Math.sqrt(variance / prices.length) : 0;
const confidenceMargin = Math.round(1.96 * standardError);
const maxMarginOfErrorPct = prices.length ? Number((1.96 * Math.sqrt(0.25 / prices.length) * 100).toFixed(1)) : 0;
const distribution = (key) => Object.entries(normalized.reduce((counts, item) => ({ ...counts, [item[key]]: (counts[item[key]] ?? 0) + 1 }), {}))
  .map(([label, count]) => ({ label, count, share: Number((count / normalized.length).toFixed(4)) }))
  .sort((a, b) => b.count - a.count);
const updatedAt = new Date();
const nextRunAt = new Date(updatedAt.getTime() + 86_400_000);
nextRunAt.setUTCHours(0, 30, 0, 0);

const output = {
  source,
  mode,
  updatedAt: updatedAt.toISOString(),
  nextRunAt: nextRunAt.toISOString(),
  pageSize: PAGE_SIZE,
  pageCount: Math.ceil(normalized.length / PAGE_SIZE),
  recordCount: normalized.length,
  priceUnit: "만원",
  policy: {
    acquisition: mode === "authorized" ? "licensed-feed" : "synthetic-stratified-sample",
    note: mode === "authorized"
      ? "제휴·라이선스가 확인된 CSV/JSON 피드만 적재합니다."
      : "실매물·실측 시장통계가 아닌 재현 가능한 합성 층화표본입니다. 제조사·연료·차령·지역 구성비를 할당해 기능과 분석 흐름을 검증합니다.",
  },
  sampling: mode === "authorized" ? {
    design: "authorized-feed-census",
    note: "승인 피드에 포함된 유효 매물 전체를 요약합니다. 모집단 포괄률은 공급계약 범위에 따릅니다.",
  } : {
    design: "synthetic-stratified-quota",
    seed: SAMPLE_SEED,
    sampleSize: normalized.length,
    primaryStratum: "제조사",
    allocationMargins: ["연료", "차령", "지역"],
    confidenceLevel: 0.95,
    maxMarginOfErrorPct,
    weighting: "할당 구성비와 생성 표본 구성비가 일치하여 기본가중치 1.0 적용",
    populationFrame: "분석 기능 검증용 가상 모집단 구성비",
    limitation: "가상 구성비를 사용하므로 실제 국내 중고차 시장의 점유율·가격을 추정할 수 없습니다.",
    targets: {
      make: makeTargets.map(([label, share]) => ({ label, share })),
      fuel: fuelTargets.map(([label, share]) => ({ label, share })),
      ageBand: ageTargets.map(([label, share]) => ({ label, share })),
      region: regionTargets.map(([label, share]) => ({ label, share })),
    },
    observed: { make: distribution("make"), fuel: distribution("fuel"), ageBand: distribution("ageBand"), region: distribution("region") },
  },
  summary: {
    averagePrice: average,
    medianPrice: median,
    minPrice: prices[0] ?? 0,
    maxPrice: prices.at(-1) ?? 0,
    meanPrice95CI: { lower: Math.max(0, average - confidenceMargin), upper: average + confidenceMargin },
  },
  listings: normalized,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`중고차 매물 ${normalized.length}건 갱신 완료 (${mode}, 페이지당 ${PAGE_SIZE}건)`);
