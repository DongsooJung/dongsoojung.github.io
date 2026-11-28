import test from "node:test";
import assert from "node:assert/strict";
import { answersMatch, createProgressStore, judgeAttempt, normalizeAnswer, PERSISTENCE } from "./app.js";

test("공백과 전각 숫자를 같은 답으로 본다", () => {
  assert.equal(normalizeAnswer(" ９ / １０ "), "9/10");
  assert.equal(answersMatch("10", "010"), true);
  assert.equal(answersMatch("9/10", "9 / 10"), true);
  assert.equal(answersMatch("34", "35"), false);
});

test("빈 답과 오답을 구분한다", () => {
  const problem = { answer: "119" };
  assert.deepEqual(judgeAttempt(problem, "  "), { status: "empty" });
  assert.deepEqual(judgeAttempt(problem, "119"), { status: "correct" });
  assert.deepEqual(judgeAttempt(problem, "118"), { status: "incorrect" });
});

test("맞춘 문항과 힌트는 저장소를 다시 읽어도 남는다", () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  const first = createProgressStore(storage);
  first.markHint("bull-01");
  first.markSolved("bull-01");
  const second = createProgressStore(storage);
  assert.deepEqual(second.load().solved, ["bull-01"]);
  assert.deepEqual(second.load().hints, ["bull-01"]);
  assert.equal(PERSISTENCE, "device-local");
});
