import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = ["index.html", "app.js", "problems.json"].map((name) => ({
  name,
  text: fs.readFileSync(path.join(dir, name), "utf8"),
}));
const joined = files.map((file) => file.text).join("\n");
const failures = [];
const forbid = [
  [/https?:\/\//, "외부 주소"],
  [/history\s*\./, "브라우저 히스토리 조작"],
  [/location\s*\.\s*(replace|href|assign)/, "페이지 이동"],
  [/<iframe\b/i, "iframe"],
  [/\beval\s*\(/, "eval"],
  [/prefers-color-scheme\s*:\s*dark/i, "다크 모드"],
  [/user-scalable\s*=\s*yes/i, "확대 허용"],
  [/research_url/, "연구 페이지 링크 필드"],
];
for (const [pattern, label] of forbid) {
  if (pattern.test(joined)) failures.push(label);
}
const html = files.find((file) => file.name === "index.html").text;
if (!/user-scalable=no/.test(html)) failures.push("핀치 줌 비활성화 뷰포트");
if (!/color-scheme" content="light"/.test(html)) failures.push("라이트 모드 고정");
const problems = JSON.parse(files.find((file) => file.name === "problems.json").text);
if (!Array.isArray(problems.problems) || problems.problems.length < 1) failures.push("문항 묶음");
for (const problem of problems.problems) {
  for (const key of ["id", "problem", "answer", "hint", "solution"]) {
    if (problem[key] == null) failures.push(`문항 ${problem.id || "?"}의 ${key}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`thinking-math bundle ok: ${problems.problems.length} problems`);
