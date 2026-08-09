import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PAGE_SIZE = 100;
const MAX_RECORDS = 10_000;
const DEMO_RECORDS = 300;
const outputPath = resolve("strategy/used-car/data/latest.json");
const feedUrl = process.env.USED_CAR_FEED_URL?.trim();
const feedToken = process.env.USED_CAR_FEED_TOKEN?.trim();
const licensedDirectFeed = /^true$/i.test(process.env.USED_CAR_FEED_LICENSED ?? "");

const makes = ["현대", "기아", "제네시스", "쉐보레", "KG모빌리티", "르노코리아", "BMW", "벤츠", "아우디", "테슬라"];
const models = ["그랜저", "쏘나타", "아반떼", "싼타페", "쏘렌토", "카니발", "G80", "스포티지", "5시리즈", "E클래스", "모델3", "Q5"];
const fuels = ["가솔린", "디젤", "하이브리드", "전기", "LPG"];
const regions = ["서울", "경기", "인천", "대전", "대구", "부산", "광주", "온라인"];

function demoListings() {
  const today = new Date().toISOString();
  return Array.from({ length: DEMO_RECORDS }, (_, index) => {
    const year = 2017 + (index % 10);
    const mileage = 8_000 + ((index * 7_931) % 178_000);
    return {
      externalId: `DEMO-${String(index + 1).padStart(4, "0")}`,
      make: makes[index % makes.length],
      model: models[(index * 5) % models.length],
      trim: ["프리미엄", "모던", "인스퍼레이션", "럭셔리", "기본형"][index % 5],
      year,
      mileage,
      fuel: fuels[(index * 3) % fuels.length],
      transmission: "자동",
      region: regions[(index * 7) % regions.length],
      price: Math.round(650 + (year - 2017) * 215 + ((index * 137) % 2_900)),
      provider: "익명 샘플",
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
  if (!feedUrl) return { listings: demoListings(), mode: "demo", source: "익명 샘플 데이터" };
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
    listingUrl: listingUrl && /^https:\/\//i.test(String(listingUrl)) ? String(listingUrl).slice(0, 500) : null,
    updatedAt: safeUpdated.toISOString(),
  };
}

const { listings, mode, source } = await loadListings();
const normalized = listings.slice(0, MAX_RECORDS).map(normalize).filter((item) => item.price > 0 && item.model !== "미기재");
const prices = normalized.map((item) => item.price).sort((a, b) => a - b);
const average = prices.length ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length) : 0;
const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
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
    acquisition: mode === "authorized" ? "licensed-feed" : "anonymous-demo",
    note: mode === "authorized"
      ? "제휴·라이선스가 확인된 CSV/JSON 피드만 적재합니다."
      : "실매물 가격이 아닙니다. USED_CAR_FEED_URL 등록 시 승인된 일일 피드로 전환됩니다.",
  },
  summary: { averagePrice: average, medianPrice: median, minPrice: prices[0] ?? 0, maxPrice: prices.at(-1) ?? 0 },
  listings: normalized,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`중고차 매물 ${normalized.length}건 갱신 완료 (${mode}, 페이지당 ${PAGE_SIZE}건)`);

