import fs from "node:fs/promises";
import path from "node:path";

const API_ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";
const DEAL_MONTH = "202606";
const BATCH_SIZE = 100;
const API_KEY = process.env.DATA_GO_KR_API_KEY?.trim();
const OUTPUT_DIR = path.resolve("hwaseong-real-estate/data");
const DISTRICTS = [
  { code: "41591", name: "만세구" },
  { code: "41593", name: "효행구" },
  { code: "41595", name: "병점구" },
  { code: "41597", name: "동탄구" },
];

if (!API_KEY) {
  throw new Error("DATA_GO_KR_API_KEY is required");
}

const decodeXml = (value = "") =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .trim();

const readTag = (xml, tag) => {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXml(match?.[1] ?? "");
};

const toNumber = (value) => {
  const number = Number(String(value).replaceAll(",", "").trim());
  return Number.isFinite(number) ? number : 0;
};

async function fetchXml(districtCode, pageNo, numOfRows = 100) {
  const params = new URLSearchParams({
    serviceKey: API_KEY,
    LAWD_CD: districtCode,
    DEAL_YMD: DEAL_MONTH,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  });
  const response = await fetch(`${API_ENDPOINT}?${params}`, {
    headers: {
      accept: "application/xml",
      "user-agent": "stargate-hwaseong-real-estate/1.0",
    },
  });
  const xml = await response.text();
  const resultCode = readTag(xml, "resultCode");
  if (!response.ok || !["000", "00"].includes(resultCode)) {
    throw new Error(
      `${districtCode} page ${pageNo}: ${response.status} ${
        readTag(xml, "resultMsg") || resultCode
      }`,
    );
  }
  return xml;
}

function parseItems(xml, district, globalStart, localStart) {
  return (xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []).map((block, index) => {
    const dealYear = readTag(block, "dealYear") || "2026";
    const dealMonth = readTag(block, "dealMonth").padStart(2, "0");
    const dealDay = readTag(block, "dealDay").padStart(2, "0");
    const globalIndex = globalStart + localStart + index;
    return {
      transaction_key: `${DEAL_MONTH}:${district.code}:${globalIndex}`,
      global_index: globalIndex,
      district_code: district.code,
      district_name: district.name,
      neighborhood: readTag(block, "umdNm"),
      apartment_name: readTag(block, "aptNm"),
      deal_date: `${dealYear}-${dealMonth}-${dealDay}`,
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
  });
}

async function fetchAll() {
  const rows = [];
  const totals = [];
  let globalStart = 0;

  for (const district of DISTRICTS) {
    const first = await fetchXml(district.code, 1, BATCH_SIZE);
    const total = toNumber(readTag(first, "totalCount"));
    const pages = Math.ceil(total / BATCH_SIZE);
    rows.push(...parseItems(first, district, globalStart, 0));

    for (let page = 2; page <= pages; page += 1) {
      const xml = await fetchXml(district.code, page, BATCH_SIZE);
      rows.push(
        ...parseItems(xml, district, globalStart, (page - 1) * BATCH_SIZE),
      );
    }

    totals.push({ ...district, total });
    globalStart += total;
  }

  rows.sort((a, b) => a.global_index - b.global_index);
  return { rows, totals };
}

const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const csvColumns = [
  ["global_index", "순번"],
  ["district_code", "구코드"],
  ["district_name", "구"],
  ["neighborhood", "법정동"],
  ["apartment_name", "아파트"],
  ["deal_date", "계약일"],
  ["price_manwon", "거래금액(만원)"],
  ["area_sqm", "전용면적(㎡)"],
  ["floor", "층"],
  ["build_year", "건축년도"],
  ["jibun", "지번"],
  ["deal_type", "거래유형"],
  ["agent_location", "중개사소재지"],
  ["buyer_type", "매수자"],
  ["seller_type", "매도자"],
  ["cancellation_date", "해제사유발생일"],
  ["registration_date", "등기일자"],
  ["transaction_key", "거래키"],
];

function toCsv(rows) {
  return [
    csvColumns.map(([, label]) => escapeCsv(label)).join(","),
    ...rows.map((row) =>
      csvColumns
        .map(([key]) =>
          escapeCsv(key === "global_index" ? row[key] + 1 : row[key]),
        )
        .join(","),
    ),
  ].join("\n");
}

const { rows, totals } = await fetchAll();
await fs.mkdir(OUTPUT_DIR, { recursive: true });

const batches = [];
for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
  const batch = rows.slice(offset, offset + BATCH_SIZE);
  const file = `batch-${String(offset).padStart(4, "0")}.json`;
  await fs.writeFile(
    path.join(OUTPUT_DIR, file),
    `${JSON.stringify(batch, null, 2)}\n`,
    "utf8",
  );
  batches.push({ offset, count: batch.length, file });
}

await fs.writeFile(
  path.join(OUTPUT_DIR, "summary.json"),
  `${JSON.stringify(
    {
      source: "국토교통부 아파트 매매 실거래가 자료",
      sourceUrl: "https://www.data.go.kr/data/15126469/openapi.do",
      dealMonth: "2026-06",
      updatedAt: new Date().toISOString(),
      totalCount: rows.length,
      districtTotals: totals,
      batches,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

await fs.writeFile(
  path.join(OUTPUT_DIR, "hwaseong-apt-2026-06-initial-100.csv"),
  `\ufeff${toCsv(rows.slice(0, BATCH_SIZE))}\n`,
  "utf8",
);

console.log(
  JSON.stringify({
    rows: rows.length,
    batches: batches.length,
    totals,
    output: OUTPUT_DIR,
  }),
);
