import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const PAGE_SIZE = 100;
const MAX_RECORDS = 5_000;
const DEMO_RECORDS = 200;
const outputPath = resolve("strategy/kimstudy-math/data/latest.json");
const exportUrl = (
  process.env.AUTHORIZED_STUDENT_EXPORT_URL ??
  process.env.AUTHORIZED_CANDIDATE_EXPORT_URL
)?.trim();

const subjects = ["수학", "정보·코딩", "과학", "영어", "학습코칭"];
const regions = ["서울 강남", "서울 송파", "서울 서초", "경기 성남", "온라인"];
const schoolLevels = ["초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3", "재수"];
const goals = ["내신 향상", "수능 대비", "경시·올림피아드", "코딩 입문", "특목고 준비"];

function sampleCandidates() {
  const now = Date.now();
  return Array.from({ length: DEMO_RECORDS }, (_, index) => ({
    externalId: `STUDENT-${String(index + 1).padStart(3, "0")}`,
    displayName: `익명 학생 ${String(index + 1).padStart(3, "0")}`,
    subject: subjects[index % subjects.length],
    region: regions[(index * 3) % regions.length],
    schoolLevel: schoolLevels[(index * 5) % schoolLevels.length],
    goal: goals[(index * 7) % goals.length],
    weeklySessions: 1 + (index % 3),
    budgetMonthly: 35 + ((index * 5) % 55),
    scheduleFit: 55 + ((index * 11) % 46),
    guardianVerified: index % 6 !== 0,
    remote: index % 3 === 0,
    requestedAt: new Date(now - ((index * 13) % 22) * 86_400_000).toISOString(),
    profileUrl: null,
  }));
}

async function loadCandidates() {
  if (!exportUrl) return { candidates: sampleCandidates(), mode: "demo" };

  const url = new URL(exportUrl);
  if (url.protocol !== "https:") {
    throw new Error("승인 데이터 URL은 HTTPS여야 합니다.");
  }
  if (/(^|\.)kimstudy\.com$/i.test(url.hostname)) {
    throw new Error(
      "kimstudy.com 페이지 직접 수집은 허용하지 않습니다. 공식 API 또는 별도로 승인된 학생 문의 내보내기 URL을 사용하세요."
    );
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "STARGATE-EDU-Kimstudy-Strategy/1.0",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`승인 데이터 요청 실패: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const candidates = Array.isArray(payload) ? payload : payload.candidates ?? payload.students;
  if (!Array.isArray(candidates)) {
    throw new Error("승인 데이터는 배열 또는 candidates/students 배열을 포함해야 합니다.");
  }

  return { candidates, mode: "authorized" };
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreCandidate(candidate) {
  const subject = String(candidate.subject ?? "기타").slice(0, 40);
  const schoolLevel = String(candidate.schoolLevel ?? candidate.grade ?? "미기재").slice(0, 30);
  const goal = String(candidate.goal ?? "상담 필요").slice(0, 60);
  const guardianVerified = Boolean(candidate.guardianVerified ?? candidate.verified);
  const budgetMonthly = Math.max(0, number(candidate.budgetMonthly ?? candidate.budget));
  const weeklySessions = Math.round(clamp(number(candidate.weeklySessions, 1), 1, 7));
  const scheduleFit = clamp(number(candidate.scheduleFit, 60), 0, 100);
  const requestedAt = new Date(candidate.requestedAt ?? Date.now());
  const safeRequestedAt = Number.isNaN(requestedAt.getTime()) ? new Date() : requestedAt;
  const requestAgeDays = Math.max(0, Math.floor((Date.now() - safeRequestedAt.getTime()) / 86_400_000));
  const recencyScore = requestAgeDays <= 3 ? 20 : requestAgeDays <= 7 ? 16 : requestAgeDays <= 14 ? 11 : 6;
  const budgetScore = budgetMonthly >= 60 ? 20 : budgetMonthly >= 45 ? 16 : budgetMonthly >= 30 ? 12 : 7;
  const subjectFit = /수학|정보|코딩|과학|학습코칭/.test(subject) ? 20 : 10;
  const score = Math.round(
    (guardianVerified ? 15 : 5) +
      recencyScore +
      budgetScore +
      (scheduleFit / 100) * 25 +
      subjectFit
  );

  return {
    id: String(candidate.externalId ?? candidate.id ?? crypto.randomUUID()).slice(0, 80),
    name: String(candidate.displayName ?? candidate.name ?? "익명 학생").slice(0, 80),
    schoolLevel,
    subject,
    goal,
    region: String(candidate.region ?? "미기재").slice(0, 60),
    weeklySessions,
    budgetMonthly: Math.round(budgetMonthly),
    scheduleFit: Math.round(scheduleFit),
    guardianVerified,
    remote: Boolean(candidate.remote),
    requestedAt: safeRequestedAt.toISOString(),
    requestAgeDays,
    profileUrl: candidate.profileUrl ? String(candidate.profileUrl).slice(0, 500) : null,
    score: Math.min(100, score),
    status: score >= 85 ? "priority" : score >= 70 ? "review" : "hold",
  };
}

const { candidates, mode } = await loadCandidates();
const screened = candidates
  .slice(0, MAX_RECORDS)
  .map(scoreCandidate)
  .sort((a, b) => b.score - a.score)
  .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

const updatedAt = new Date();
const nextRunAt = new Date(updatedAt);
nextRunAt.setUTCDate(nextRunAt.getUTCDate() + ((8 - nextRunAt.getUTCDay()) % 7 || 7));
nextRunAt.setUTCHours(0, 15, 0, 0);

const output = {
  source: mode === "authorized" ? "승인된 과외학생 문의 데이터" : "익명 학생 데모 데이터",
  mode,
  updatedAt: updatedAt.toISOString(),
  nextRunAt: nextRunAt.toISOString(),
  batchSize: screened.length,
  pageSize: PAGE_SIZE,
  pageCount: Math.ceil(screened.length / PAGE_SIZE),
  collectionPolicy: {
    target: "kimstudy.com",
    robotsStatus: "blocked-for-generic-bots",
    acquisition: mode === "authorized" ? "authorized-export" : "anonymous-demo",
    note: "김과외 공개 페이지 직접 대량 수집은 robots.txt에 따라 중지하며, 공식 API 또는 권한이 확인된 내보내기만 적재합니다.",
  },
  summary: {
    priority: screened.filter((item) => item.status === "priority").length,
    review: screened.filter((item) => item.status === "review").length,
    hold: screened.filter((item) => item.status === "hold").length,
    averageScore: screened.length
      ? Math.round(screened.reduce((sum, item) => sum + item.score, 0) / screened.length)
      : 0,
  },
  candidates: screened,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`전략 후보 ${screened.length}명 스크리닝 완료 (${mode}, 페이지당 ${PAGE_SIZE}명)`);

