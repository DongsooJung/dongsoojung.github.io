import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PAGE_SIZE = 100;
const MAX_RECORDS = 5_000;
const DEMO_RECORDS = 200;
const OUTPUT_PATH = resolve("strategy/kimstudy-math/data/latest.json");
const FEED_URL = (process.env.AUTHORIZED_KIMSTUDY_STUDENT_EXPORT_URL ?? process.env.AUTHORIZED_STUDENT_EXPORT_URL)?.trim();
const FEED_TOKEN = process.env.AUTHORIZED_STUDENT_EXPORT_TOKEN?.trim();
const subjects = ["수학", "정보·코딩", "과학", "영어", "국어", "학습코칭"];
const regions = ["서울 강남", "서울 송파", "서울 서초", "경기 성남", "경기 수원", "온라인"];
const levels = ["초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3", "재수"];
const goals = ["내신 향상", "수능 대비", "경시·올림피아드", "코딩 입문", "특목고 준비", "학습 습관"];

function demoStudents() {
  const now = Date.now();
  return Array.from({ length: DEMO_RECORDS }, (_, index) => ({
    externalId: `DEMO-STUDENT-${String(index + 1).padStart(3, "0")}`,
    displayName: `익명 학생 ${String(index + 1).padStart(3, "0")}`,
    subject: subjects[index % subjects.length],
    region: regions[(index * 5) % regions.length],
    schoolLevel: levels[(index * 7) % levels.length],
    goal: goals[(index * 11) % goals.length],
    weeklySessions: 1 + (index % 3),
    budgetMonthly: 30 + ((index * 5) % 70),
    remote: index % 3 === 0,
    scheduleFit: 55 + ((index * 13) % 46),
    guardianVerified: index % 6 !== 0,
    requestedAt: new Date(now - ((index * 17) % 28) * 86_400_000).toISOString(),
    sourceUrl: null,
  }));
}

function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false; const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) { const c = source[i]; if (quoted) { if (c === '"' && source[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c; } else if (c === '"') quoted = true; else if (c === ",") { row.push(field); field = ""; } else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; } else field += c; }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const [headers = [], ...body] = rows.filter((r) => r.some((v) => v.trim()));
  return body.map((cells) => Object.fromEntries(headers.map((h, i) => [h.trim(), cells[i] ?? ""])));
}

async function loadStudents() {
  if (!FEED_URL) return { rows: demoStudents(), mode: "demo", source: "익명 학생 샘플" };
  const url = new URL(FEED_URL);
  if (url.protocol !== "https:") throw new Error("승인 데이터 URL은 HTTPS여야 합니다.");
  if (/(^|\.)kimstudy\.com$/i.test(url.hostname)) throw new Error("김과외 공개 화면 직접 수집은 허용하지 않습니다. 공식 API 또는 동의 기반 내보내기 URL을 사용하세요.");
  const headers = { accept: "application/json,text/csv", "user-agent": "STARGATE-Kimstudy-Student-Demand/2.0" };
  if (FEED_TOKEN) headers.authorization = `Bearer ${FEED_TOKEN}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`승인 학생 데이터 요청 실패: HTTP ${response.status}`);
  const text = await response.text();
  const payload = /^[\s\r\n]*[\[{]/.test(text) ? JSON.parse(text) : parseCsv(text);
  const rows = Array.isArray(payload) ? payload : payload.students ?? payload.candidates ?? payload.inquiries ?? payload.data;
  if (!Array.isArray(rows)) throw new Error("피드는 배열 또는 students/candidates/inquiries/data 배열이어야 합니다.");
  return { rows, mode: "authorized", source: url.hostname };
}

const pick = (row, keys, fallback = "") => keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && value !== "") ?? fallback;
const number = (value, fallback = 0) => { const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) ? parsed : fallback; };
const bool = (value) => value === true || /^(1|true|yes|y|확인|가능)$/i.test(String(value ?? ""));

function normalize(row, index) {
  const requested = new Date(pick(row, ["requestedAt", "createdAt", "문의일", "등록일"], Date.now()));
  const requestedAt = Number.isNaN(requested.getTime()) ? new Date() : requested;
  const subject = String(pick(row, ["subject", "희망과목", "과목"], "미기재")).slice(0, 50);
  const budgetMonthly = Math.max(0, number(pick(row, ["budgetMonthly", "budget", "월예산", "예산"], 0)));
  const scheduleFit = Math.max(0, Math.min(100, number(pick(row, ["scheduleFit", "일정적합도"], 60))));
  const guardianVerified = bool(pick(row, ["guardianVerified", "verified", "보호자확인"], false));
  const ageDays = Math.max(0, Math.floor((Date.now() - requestedAt.getTime()) / 86_400_000));
  const score = Math.min(100, Math.round((guardianVerified ? 15 : 5) + (ageDays <= 3 ? 20 : ageDays <= 7 ? 16 : ageDays <= 14 ? 11 : 6) + (budgetMonthly >= 60 ? 20 : budgetMonthly >= 45 ? 16 : budgetMonthly >= 30 ? 12 : 7) + scheduleFit * .25 + (/수학|정보|코딩|과학|학습코칭/.test(subject) ? 20 : 10)));
  return {
    id: String(pick(row, ["externalId", "id", "문의번호"], `STUDENT-${index + 1}`)).slice(0, 80),
    name: String(pick(row, ["displayName", "name", "학생명"], "익명 학생")).slice(0, 80),
    schoolLevel: String(pick(row, ["schoolLevel", "grade", "학년"], "미기재")).slice(0, 30),
    subject,
    goal: String(pick(row, ["goal", "학습목표", "목표"], "상담 필요")).slice(0, 80),
    region: String(pick(row, ["region", "location", "지역"], "미기재")).slice(0, 60),
    weeklySessions: Math.max(1, Math.min(7, Math.round(number(pick(row, ["weeklySessions", "주당횟수"], 1))))),
    budgetMonthly: Math.round(budgetMonthly), scheduleFit: Math.round(scheduleFit), guardianVerified,
    remote: bool(pick(row, ["remote", "online", "온라인가능"], false)),
    requestedAt: requestedAt.toISOString(), requestAgeDays: ageDays, score,
    status: score >= 85 ? "priority" : score >= 70 ? "review" : "hold",
  };
}

const { rows, mode, source } = await loadStudents();
const seen = new Set();
const students = rows.slice(0, MAX_RECORDS).map(normalize).filter((row) => { const key = row.id.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => b.score - a.score || new Date(b.requestedAt) - new Date(a.requestedAt)).map((row, index) => ({ rank: index + 1, ...row }));
const updatedAt = new Date(); const nextRunAt = new Date(updatedAt.getTime() + 86_400_000); nextRunAt.setUTCHours(0, 15, 0, 0);
const output = {
  source, mode, updatedAt: updatedAt.toISOString(), nextRunAt: nextRunAt.toISOString(), recordCount: students.length,
  pageSize: PAGE_SIZE, pageCount: Math.ceil(students.length / PAGE_SIZE),
  collectionPolicy: { target: "kimstudy.com", acquisition: mode === "authorized" ? "authorized-export" : "anonymous-demo", personalDataExcluded: true, note: mode === "authorized" ? "학생·보호자 동의 또는 공식 API로 승인된 문의 데이터만 적재합니다." : "김과외 공개 화면은 직접 수집하지 않으며, 현재 데이터는 기능 확인용 익명 샘플입니다." },
  summary: { priority: students.filter((r) => r.status === "priority").length, review: students.filter((r) => r.status === "review").length, hold: students.filter((r) => r.status === "hold").length, capital: students.filter((r) => /^(서울|경기|인천)/.test(r.region)).length, averageBudget: students.length ? Math.round(students.reduce((sum, r) => sum + r.budgetMonthly, 0) / students.length) : 0 },
  students,
};
await mkdir(dirname(OUTPUT_PATH), { recursive: true }); await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8"); console.log(`김과외 과외학생 문의 ${students.length}건 갱신 완료 (${mode}, 페이지당 ${PAGE_SIZE}건)`);
