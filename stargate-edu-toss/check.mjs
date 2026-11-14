import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROBLEMS, STAGES } from "./src/content.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const names = [
  "index.html",
  "apps-in-toss.config.ts",
  "src/app.js",
  "src/content.js",
  "src/logic.js",
  "src/storage.js",
  "src/style.css",
];
const files = names.map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), "utf8") }));
const joined = files.map((file) => file.text).join("\n");
const failures = [];
const forbid = [
  [/https?:\/\//, "외부 주소"],
  [/history\s*\./, "브라우저 히스토리 조작"],
  [/location\s*\.\s*(replace|href|assign)/, "페이지 이동"],
  [/<iframe\b/i, "iframe"],
  [/\beval\s*\(/, "eval"],
  [/new\s+Function\s*\(/, "Function 생성자"],
  [/prefers-color-scheme\s*:\s*dark/i, "다크 모드"],
  [/user-scalable\s*=\s*yes/i, "확대 허용"],
  [/play\.google|stargateedu|mailto:/i, "자사 사이트·스토어·메일 유도"],
];
for (const [pattern, label] of forbid) {
  if (pattern.test(joined)) failures.push(label);
}
const html = files.find((file) => file.name === "index.html").text;
if (!/user-scalable=no/.test(html)) failures.push("핀치 줌 비활성화 뷰포트");
if (!/color-scheme" content="light"/.test(html)) failures.push("라이트 모드 고정");
if (!/noindex/.test(html)) failures.push("검색 제외");
const ids = new Set();
for (const stage of STAGES) {
  for (const item of stage.items) {
    if (ids.has(item.id) || !item.text) failures.push(`경로 항목 ${item.id}`);
    ids.add(item.id);
  }
}
const problemIds = new Set();
for (const problem of PROBLEMS) {
  if (problemIds.has(problem.id)) failures.push(`중복 문제 ${problem.id}`);
  problemIds.add(problem.id);
  for (const key of ["title", "blurb", "prompt", "answer", "hint"]) {
    if (!problem[key]) failures.push(`문제 ${problem.id}의 ${key}`);
  }
  if (!Array.isArray(problem.solution) || problem.solution.length < 2) failures.push(`문제 ${problem.id}의 풀이`);
}
if (PROBLEMS.length < 3) failures.push("연습 문제 수");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`stargate-edu bundle ok: ${STAGES.length} stages, ${PROBLEMS.length} problems`);
