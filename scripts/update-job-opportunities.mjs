import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const OUTPUT_JSON = resolve("strategy/job-opportunities/data/latest.json");
const OUTPUT_CSV = resolve("strategy/job-opportunities/data/latest.csv");
const ARCHIVE_DIR = resolve("strategy/job-opportunities/data/archive");
const FEED_URL = process.env.JOB_FEED_URL?.trim();
const FEED_TOKEN = process.env.JOB_FEED_TOKEN?.trim();
const LICENSED = /^true$/i.test(process.env.JOB_FEED_LICENSED ?? "");
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

const demoRoles = [
  ["AI·데이터 전략 연구원", "서울", "데이터 분석, Python, AI 전략, 정책 연구"],
  ["스마트도시·GIS 연구원", "경기", "GIS, 공간분석, 도시계획, 공공 프로젝트"],
  ["공공정책 데이터 분석가", "세종", "행정, 정책평가, 통계, Python"],
  ["교육 AI 서비스 기획 PM", "서울", "에듀테크, AI, 서비스기획, 프로젝트 관리"],
  ["인프라 사업관리 연구원", "경기", "건설, 인프라, PM, 타당성 조사"],
  ["체험형 청년인턴·데이터", "서울", "체험형 인턴, 데이터 정리, 리서치"],
];

function demoJobs() {
  return Array.from({ length: 40 }, (_, i) => {
    const role = demoRoles[i % demoRoles.length];
    return { id: `DEMO-${String(i + 1).padStart(3, "0")}`, company: `샘플기관 ${String(i + 1).padStart(2, "0")}`, title: role[0], location: role[1], career: i % 3 ? "경력무관" : "신입", employmentType: i % 5 === 0 ? "체험형 인턴" : "계약직·정규직", description: role[2], postedAt: new Date(Date.now() - (i % 7) * 86_400_000).toISOString(), deadline: new Date(Date.now() + (7 + (i % 24)) * 86_400_000).toISOString(), source: "샘플", url: null };
  });
}

function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false; const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) { const char = source[i]; if (quoted) { if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; } else if (char === '"') quoted = false; else field += char; } else if (char === '"') quoted = true; else if (char === ",") { row.push(field); field = ""; } else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; } else field += char; }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const [headers = [], ...body] = rows.filter((r) => r.some((cell) => cell.trim()));
  return body.map((cells) => Object.fromEntries(headers.map((h, i) => [h.trim(), cells[i] ?? ""])));
}

async function loadFeed() {
  if (!FEED_URL) return { rows: demoJobs(), mode: "demo", source: "익명 샘플" };
  const url = new URL(FEED_URL);
  if (url.protocol !== "https:" && url.protocol !== "file:") throw new Error("피드는 HTTPS 또는 file URL이어야 합니다.");
  if (/jobkorea\.co\.kr$/i.test(url.hostname) && !LICENSED) throw new Error("잡코리아 원사이트 직접 수집은 차단됩니다. 승인된 API·내보내기 피드만 연결하세요.");
  let text;
  if (url.protocol === "file:") text = await readFile(url, "utf8");
  else { const headers = { accept: "text/csv, application/json", "user-agent": "STARGATE-Opportunity-Curator/1.0" }; if (FEED_TOKEN) headers.authorization = `Bearer ${FEED_TOKEN}`; const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`공고 피드 요청 실패: HTTP ${response.status}`); text = await response.text(); }
  const payload = /^[\s\r\n]*[\[{]/.test(text) ? JSON.parse(text) : parseCsv(text);
  const rows = Array.isArray(payload) ? payload : payload.jobs ?? payload.data ?? payload.items;
  if (!Array.isArray(rows)) throw new Error("피드는 배열 또는 jobs/data/items 배열이어야 합니다.");
  return { rows, mode: "authorized", source: url.hostname || "승인 로컬 CSV" };
}

const pick = (item, keys, fallback = "") => keys.map((key) => item[key]).find((v) => v !== undefined && v !== null && v !== "") ?? fallback;
const safeDate = (value, fallback) => { const date = new Date(value || fallback); return Number.isNaN(date.getTime()) ? new Date(fallback) : date; };
function normalize(item, i) {
  const postedAt = safeDate(pick(item, ["postedAt", "posted_at", "등록일", "공고등록일"]), Date.now()); const deadline = safeDate(pick(item, ["deadline", "closeDate", "마감일", "접수마감일"]), Date.now() + 30 * 86_400_000); const url = pick(item, ["url", "link", "공고URL", "채용공고URL"], null);
  return { id: String(pick(item, ["id", "jobId", "공고번호"], `JOB-${i + 1}`)).slice(0, 100), company: String(pick(item, ["company", "companyName", "기업명", "회사명"], "미기재")).slice(0, 100), title: String(pick(item, ["title", "position", "공고명", "채용제목"], "미기재")).slice(0, 180), location: String(pick(item, ["location", "region", "근무지역", "지역"], "미기재")).slice(0, 80), career: String(pick(item, ["career", "experience", "경력", "경력조건"], "미기재")).slice(0, 60), employmentType: String(pick(item, ["employmentType", "jobType", "고용형태", "근무형태"], "미기재")).slice(0, 80), description: String(pick(item, ["description", "summary", "keywords", "직무내용", "요약"], "")).slice(0, 1000), postedAt: postedAt.toISOString(), deadline: deadline.toISOString(), source: String(pick(item, ["source", "platform", "출처"], "잡코리아 승인 피드")).slice(0, 80), url: url && /^https:\/\//i.test(String(url)) ? String(url).slice(0, 500) : null };
}

const weights = [[/GIS|공간분석|스마트도시|도시계획|도시재생/gi,22,"도시·GIS"],[/AI|인공지능|데이터|Python|통계|계량/gi,20,"AI·데이터"],[/정책|행정|공공|연구원|타당성|예비타당성/gi,18,"정책·연구"],[/PM|PMO|프로젝트|사업관리|인프라|건설/gi,15,"PM·인프라"],[/교육|에듀테크|알고리즘|수학|정보올림피아드/gi,14,"교육·알고리즘"]];
function score(job) { const haystack = `${job.title} ${job.description} ${job.company} ${job.employmentType}`; let total = 25; const reasons = []; for (const [pattern, points, label] of weights) { if (pattern.test(haystack)) { total += points; reasons.push(label); } pattern.lastIndex = 0; } if (/서울|경기|인천|성남|수원|용인|화성|시흥/.test(job.location)) { total += 10; reasons.push("수도권"); } if (/신입|경력무관/.test(job.career)) { total += 7; reasons.push("지원범위"); } if (/인턴|체험/.test(job.employmentType + job.title)) { total += 6; reasons.push("체험형"); } const ageDays = Math.max(0, (Date.now() - new Date(job.postedAt)) / 86_400_000); total += Math.max(0, 10 - Math.floor(ageDays)); return { score: Math.min(100, total), reasons: [...new Set(reasons)].slice(0, 4) }; }

const { rows, mode, source } = await loadFeed(); const seen = new Set();
const normalized = rows.slice(0, 5000).map(normalize).filter((job) => { const key = `${job.company}|${job.title}|${job.deadline}`.toLowerCase(); if (seen.has(key) || new Date(job.deadline) < new Date()) return false; seen.add(key); return job.title !== "미기재"; }).map((job) => ({ ...job, ...score(job) }));
const selected = normalized.sort((a, b) => b.score - a.score || new Date(b.postedAt) - new Date(a.postedAt)).slice(0, 20).map((job, i) => ({ rank: i + 1, ...job }));
const output = { mode, source, updatedAt: new Date().toISOString(), selectionDate: TODAY, inputCount: rows.length, eligibleCount: normalized.length, selectedCount: selected.length, selectionLimit: 20, jobs: selected, policy: { acquisition: mode === "authorized" ? "authorized-feed" : "demo", note: mode === "authorized" ? "승인된 API·CSV 내보내기만 사용합니다." : "현재는 기능 확인용 익명 샘플입니다. JOB_FEED_URL 연결 시 실데이터로 전환됩니다." } };
const headers = ["순위","적합도","기업명","공고명","근무지역","경력","고용형태","등록일","마감일","선정근거","출처","공고URL"]; const csvRows = selected.map((j) => [j.rank,j.score,j.company,j.title,j.location,j.career,j.employmentType,j.postedAt.slice(0,10),j.deadline.slice(0,10),j.reasons.join("·"),j.source,j.url ?? ""]); const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`; const csv = "\uFEFF" + [headers, ...csvRows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
await mkdir(dirname(OUTPUT_JSON), { recursive: true }); await mkdir(ARCHIVE_DIR, { recursive: true }); await writeFile(OUTPUT_JSON, `${JSON.stringify(output, null, 2)}\n`, "utf8"); await writeFile(OUTPUT_CSV, csv, "utf8"); await writeFile(resolve(ARCHIVE_DIR, `${TODAY}.csv`), csv, "utf8"); console.log(`공고 ${rows.length}건 중 ${selected.length}건 선별 완료 (${mode})`);
