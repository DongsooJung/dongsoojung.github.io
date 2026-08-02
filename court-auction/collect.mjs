#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CourtAuctionHttpClient,
  getSaleNoticeDetail,
  searchSaleNotices,
} from "court-auction-notice-search";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const now = new Date();
const month =
  !args.month || args.month === "current"
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    : normalizeMonth(args.month);

const client = new CourtAuctionHttpClient({
  timeoutMs: 30_000,
  minDelayMs: 2_500,
  jitterMs: 1_000,
  maxCallsPerSession: 40,
});

console.log(`[1/3] ${month} 대한민국법원 매각공고 목록 조회`);
const notices = await searchSaleNotices({
  date: month,
  courtCode: args.court || "",
  bidType: "date",
  client,
});
if (!notices.items.length) {
  throw new Error(`${month}에 조회된 매각공고가 없습니다.`);
}

console.log(`[2/3] 공고 ${notices.items.length}건의 물건 상세 파싱`);
const rawItems = [];
for (let index = 0; index < notices.items.length; index += 1) {
  const notice = notices.items[index];
  const detail = await getSaleNoticeDetail(notice, { client });
  for (const item of detail.items) rawItems.push({ notice, item });
  console.log(
    `  ${index + 1}/${notices.items.length} ${notice.courtName} ${notice.saleDate} · ${detail.items.length}건`,
  );
}

const seen = new Set();
const records = rawItems
  .map(({ notice, item }) => normalizeRecord(notice, item))
  .filter((record) => {
    const key = `${record.법원코드}:${record.사건번호}:${record.물건번호}:${record.매각기일}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return record.구분 !== "기타";
  });

const generatedAt = new Date().toISOString();
const commonMeta = {
  generated_at: generatedAt,
  source: "대한민국법원 법원경매정보 매각공고·상세 파싱",
  parser: "court-auction-notice-search@0.3.3",
  requested_month: month,
  basis: "매각기일",
  notice_count: notices.items.length,
  is_sample: false,
};

for (const category of ["주택", "상업용"]) {
  const categoryRecords = records
    .filter((record) => record.구분 === category)
    .sort((a, b) => b.매각기일.localeCompare(a.매각기일));
  const payload = {
    meta: {
      ...commonMeta,
      category,
      count: categoryRecords.length,
      months: [...new Set(categoryRecords.map((record) => record.매각기일.slice(0, 7)))].sort(),
    },
    records: categoryRecords,
  };
  const filename = category === "주택" ? "data.json" : "data_commercial.json";
  await writeFile(path.join(here, filename), JSON.stringify(payload, null, 2), "utf8");
  console.log(`  ${filename}: 실제 ${category} ${categoryRecords.length}건`);
}

console.log(`[3/3] 완료 · 총 ${records.length}건 · 생성 ${generatedAt}`);

function parseArgs(tokens) {
  const result = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) continue;
    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const value =
      inlineValue ??
      (tokens[index + 1] && !tokens[index + 1].startsWith("--")
        ? tokens[++index]
        : true);
    result[rawKey] = value;
  }
  return result;
}

function normalizeMonth(value) {
  const compact = String(value).replace(/\D/g, "");
  if (!/^\d{6}$/.test(compact)) {
    throw new Error("--month는 YYYY-MM 형식이어야 합니다.");
  }
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function normalizeRecord(notice, item) {
  const address = cleanAddress(item.address);
  const appraisal = Number(item.appraisedPrice) || 0;
  const minimum = Number(item.minimumSalePrice) || 0;
  return {
    구분: classifyUsage(item.usage),
    사건번호: cleanText(item.caseNumber),
    법원: notice.courtName || "",
    법원코드: notice.courtCode || "",
    담당계: notice.judgeDeptName || "",
    물건번호: String(item.itemSeq || ""),
    용도: cleanText(item.usage),
    시도: address.split(/\s+/)[0] || "",
    소재지: address,
    감정가: appraisal,
    최저매각가: minimum,
    최저가율: appraisal > 0 ? Number(((minimum / appraisal) * 100).toFixed(1)) : 0,
    매각기일: notice.saleDate || "",
    매각장소: notice.salePlace || "",
    입찰시간: notice.saleTimes?.join(", ") || "",
    비고: cleanText(item.remarks),
    실거래조회지역: extractLegalDong(address),
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAddress(value) {
  return cleanText(value).split("[상세내역]")[0].trim();
}

function extractLegalDong(address) {
  const tokens = address.replaceAll(",", " ").split(/\s+/).filter(Boolean);
  const placeIndex = tokens.findIndex((token) => /[읍면동리]$/.test(token));
  if (placeIndex < 0) return "";
  return tokens.slice(0, placeIndex + 1).join(" ");
}

function classifyUsage(usage) {
  const text = cleanText(usage);
  if (/(아파트|다세대|연립|빌라|단독|다가구|주택)/.test(text)) return "주택";
  if (/(근린|상가|점포|사무|업무|판매|숙박|오피스텔|목욕)/.test(text)) return "상업용";
  return "기타";
}
