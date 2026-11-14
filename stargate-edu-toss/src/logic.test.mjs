import test from "node:test";
import assert from "node:assert/strict";
import { PARTNERS, PROBLEMS, SEAT_CLUBS } from "./content.js";
import { grade, neighborFriends, partnerCounts, progress, sanitize } from "./logic.js";

test("도서관 자리 예시는 A=2, B=1에서 알려진 친구 수와 같다", () => {
  assert.deepEqual(neighborFriends(SEAT_CLUBS, 2, 1), [2, 2, 3, 2, 2, 3, 2, 2]);
});

test("채점 문제는 A=1, B=2의 1번 학생이다", () => {
  assert.equal(neighborFriends(SEAT_CLUBS, 1, 2)[0], 1);
  assert.equal(grade(PROBLEMS[0], "1"), true);
  assert.equal(grade(PROBLEMS[0], ""), false);
});

test("스터디 파트너 예시는 7명의 알려진 파트너 수와 같다", () => {
  assert.deepEqual(partnerCounts(PARTNERS, 3, 5), [1, 2, 2, 3, 2, 3, 1]);
  assert.equal(grade(PROBLEMS[1], "3명"), false);
  assert.equal(grade(PROBLEMS[1], " 3 "), true);
});

test("비교 횟수 문제는 선택지 전체 문장으로만 맞는다", () => {
  assert.equal(grade(PROBLEMS[2], PROBLEMS[2].answer), true);
  assert.equal(grade(PROBLEMS[2], "아니오"), false);
});

test("저장값은 알려진 항목만 남긴다", () => {
  const clean = sanitize({
    checks: { "intro-io": true, "missing": true, "intro-loop": "yes" },
    solved: { seats: { status: "ok", tries: 2, hint: true, peeked: false }, other: { status: "ok" } },
    notes: { seats: "손으로 셈", partners: 12 },
  });
  assert.deepEqual(clean.checks, { "intro-io": true });
  assert.equal(clean.solved.seats.status, "ok");
  assert.equal(clean.solved.other, undefined);
  assert.equal(clean.notes.seats, "손으로 셈");
  assert.equal(progress(clean).checked, 1);
  assert.equal(progress(clean).solved, 1);
});
