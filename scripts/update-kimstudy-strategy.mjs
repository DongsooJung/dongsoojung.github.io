import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ORIGIN = "https://academy.kimstudy.com";
const ROBOTS_URL = `${ORIGIN}/robots.txt`;
const SITEMAP_URL = `${ORIGIN}/sitemap.xml`;
const OUTPUT_PATH = resolve("strategy/kimstudy-math/data/latest.json");
const USER_AGENT = "Mozilla/5.0 (compatible; STARGATE-StrategyBot/1.0; +https://stargateedu.co.kr/strategy/kimstudy-math/)";
const PAGE_SIZE = 100;
const MAX_RECORDS = 200;
const CANDIDATE_LIMIT = 240;
const CONCURRENCY = 6;

async function fetchText(url, attempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "*/*", "user-agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function assertRobotsAllowed(robotsText) {
  const normalized = robotsText.replace(/\r/g, "");
  const genericBlock = normalized.match(/User-agent:\s*\*[\s\S]*?(?=\nUser-agent:|$)/i)?.[0] ?? "";
  if (/Disallow:\s*\/\s*$/im.test(genericBlock) && !/Allow:\s*\/\s*$/im.test(genericBlock)) {
    throw new Error("academy.kimstudy.com robots.txt가 공개 수집을 허용하지 않습니다.");
  }
  if (!/Allow:\s*\/\s*$/im.test(genericBlock)) {
    throw new Error("academy.kimstudy.com robots.txt에서 명시적 전체 허용을 확인하지 못했습니다.");
  }
}

function stripHtml(value = "") {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSummaryValue(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`${escaped}<\\/div>[\\s\\S]{0,500}?<div[^>]*text-grayscale-700[^>]*>([\\s\\S]*?)<\\/div>`, "i"));
  return stripHtml(match?.[1] ?? "");
}

function extractPayText(html) {
  const match = html.match(/>급여<\/div>[\s\S]{0,500}?<div[^>]*>([\s\S]*?)<\/div>/i);
  return stripHtml(match?.[1] ?? "");
}

function offerIdFromUrl(url) {
  return Number(url.match(/\/offer\/info\/(\d+)/)?.[1] ?? 0);
}

function jsonLdValue(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`"${escaped}"\\s*:\\s*"([^"\\r\\n]*)"`, "i"))?.[1]?.replace(/\\"/g, '"') ?? "";
}

function tolerantJobPosting(text) {
  if (!/"@type"\s*:\s*"JobPosting"/i.test(text)) return null;
  const organization = text.split(/"hiringOrganization"\s*:/i)[1] ?? "";
  const location = text.split(/"jobLocation"\s*:/i)[1] ?? "";
  const salary = text.split(/"baseSalary"\s*:/i)[1] ?? "";
  const numeric = (source, key) => {
    const value = source.match(new RegExp(`"${key}"\\s*:\\s*([0-9.]+)`, "i"))?.[1];
    return value === undefined ? null : Number(value);
  };
  return {
    "@type": "JobPosting",
    title: jsonLdValue(text, "title"),
    datePosted: jsonLdValue(text, "datePosted"),
    validThrough: jsonLdValue(text, "validThrough"),
    employmentType: jsonLdValue(text, "employmentType"),
    hiringOrganization: { name: jsonLdValue(organization, "name") },
    jobLocation: { address: { addressLocality: jsonLdValue(location, "addressLocality"), addressRegion: jsonLdValue(location, "addressRegion") } },
    baseSalary: { value: { minValue: numeric(salary, "minValue"), maxValue: numeric(salary, "maxValue") } },
  };
}

function parsePosting(html, sourceUrl) {
  const blocks = [...html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let job;
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      job = candidates.find((item) => item?.["@type"] === "JobPosting");
    } catch {
      job = tolerantJobPosting(block[1]);
    }
    if (job) break;
  }
  if (!job) return null;

  const address = job.jobLocation?.address ?? {};
  const salary = job.baseSalary?.value ?? {};
  const payText = extractPayText(html);
  const payType = payText.match(/시급|월급|연봉|건별|비율제|협의/)?.[0] ?? "미기재";
  const target = extractSummaryValue(html, "학습대상") || "미기재";
  const fields = extractSummaryValue(html, "모집분야") || "수학";
  const deadlineText = extractSummaryValue(html, "지원마감") || String(job.validThrough ?? "").slice(0, 10) || "상시·미기재";
  const validThrough = String(job.validThrough ?? deadlineText.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "").slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const status = validThrough ? (validThrough >= today ? "open" : "closed") : "ongoing";

  return {
    id: offerIdFromUrl(sourceUrl),
    academy: String(job.hiringOrganization?.name ?? "미기재").slice(0, 100),
    title: String(job.title ?? "수학 강사 채용").slice(0, 180),
    subject: fields.includes("수학") ? "수학" : fields.slice(0, 80),
    target: target.slice(0, 100),
    region: [address.addressRegion, address.addressLocality].filter(Boolean).join(" ") || "미기재",
    employmentType: String(job.employmentType ?? "미기재"),
    payType,
    payMin: Number.isFinite(Number(salary.minValue)) ? Number(salary.minValue) : null,
    payMax: Number.isFinite(Number(salary.maxValue)) ? Number(salary.maxValue) : null,
    payText: payText.slice(0, 140),
    datePosted: String(job.datePosted ?? "").slice(0, 10),
    validThrough,
    deadlineText,
    status,
    sourceUrl,
  };
}

async function runPool(urls) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length && results.length < MAX_RECORDS) {
      const url = urls[cursor++];
      try {
        const posting = parsePosting(await fetchText(url), url);
        if (posting?.subject.includes("수학")) results.push(posting);
      } catch (error) {
        console.warn(`수집 건너뜀 ${url}: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results.slice(0, MAX_RECORDS).sort((a, b) => b.id - a.id);
}

const robotsText = await fetchText(ROBOTS_URL);
assertRobotsAllowed(robotsText);
const sitemapIndex = await fetchText(SITEMAP_URL);
const offerSitemapUrl = [...sitemapIndex.matchAll(/<loc>([^<]*\/sitemap\/offer-info\/[^<]+)<\/loc>/gi)][0]?.[1];
if (!offerSitemapUrl) throw new Error("공고 사이트맵 URL을 찾지 못했습니다.");
const offerSitemap = await fetchText(offerSitemapUrl);
const urls = [...offerSitemap.matchAll(/<loc>(https:\/\/academy\.kimstudy\.com\/offer\/info\/[^<]+)<\/loc>/gi)]
  .map((match) => match[1].replace(/&amp;/g, "&"))
  .filter((url) => decodeURIComponent(url).includes("수학"))
  .sort((a, b) => offerIdFromUrl(b) - offerIdFromUrl(a))
  .slice(0, CANDIDATE_LIMIT);

const postings = await runPool(urls);
const openCount = postings.filter((item) => item.status === "open").length;
const ongoingCount = postings.filter((item) => item.status === "ongoing").length;
const regions = postings.reduce((acc, item) => {
  const key = item.region.split(" ")[0] || "기타";
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const output = {
  source: "김과외 김강사 공개 채용공고",
  sourceUrl: ORIGIN,
  mode: "public-robots-allowed",
  updatedAt: new Date().toISOString(),
  pageSize: PAGE_SIZE,
  pageCount: Math.ceil(postings.length / PAGE_SIZE),
  recordCount: postings.length,
  collectionPolicy: {
    target: "academy.kimstudy.com",
    robotsStatus: "allowed",
    robotsUrl: ROBOTS_URL,
    personalDataExcluded: true,
    note: "공개 채용공고의 직무·지역·급여·일정만 수집하며 전화번호, 상세주소, 지원자 개인정보는 저장하지 않습니다.",
  },
  summary: { active: openCount + ongoingCount, open: openCount, ongoing: ongoingCount, closed: postings.length - openCount - ongoingCount, regions },
  postings,
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`김과외 수학 공개 채용공고 ${postings.length}건 수집 완료 (페이지당 ${PAGE_SIZE}건)`);
