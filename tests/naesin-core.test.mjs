// 내신 5등급 계산 모듈 테스트 — node --test tests/naesin-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const N = require('../naesin/naesin-core.js');

test('누적 학생수는 수강자수 × 누적비율을 반올림한다', () => {
  assert.deepEqual(N.cumulativeCounts(96), [10, 33, 63, 86, 96]);
  assert.deepEqual(N.cumulativeCounts(120), [12, 41, 79, 108, 120]);
  assert.deepEqual(N.cumulativeCounts(200), [20, 68, 132, 180, 200]);
  assert.deepEqual(N.cumulativeCounts(5), [1, 2, 3, 5, 5]); // 0.5 → 1 (올림)
  assert.deepEqual(N.cumulativeCounts(4), [0, 1, 3, 4, 4]); // 4명 이하는 1등급 없음
});

test('수강자 4명 이하는 1등급이 나오지 않고 5명부터 나온다', () => {
  for (const t of [1, 2, 3, 4]) assert.notEqual(N.calc(1, 1, t).grade, 1, `${t}명`);
  assert.equal(N.calc(1, 1, 5).grade, 1);
});

test('동점자 없는 석차는 누적 인원으로 등급이 정해진다 (96명 예시)', () => {
  const cases = [[1, 1], [10, 1], [11, 2], [33, 2], [34, 3], [63, 3], [64, 4], [86, 4], [87, 5], [96, 5]];
  for (const [rank, grade] of cases) assert.equal(N.calc(rank, 1, 96).grade, grade, `${rank}등`);
  // 10등은 백분율로는 10.42%이지만 누적 인원 10명 안이라 1등급
  const r = N.calc(10, 1, 96);
  assert.equal(r.method, 'count');
  assert.ok(r.rankPct > 10);
});

test('120명 예시: 12등까지 1등급, 108등까지 4등급', () => {
  assert.equal(N.calc(12, 1, 120).grade, 1);
  assert.equal(N.calc(13, 1, 120).grade, 2);
  assert.equal(N.calc(108, 1, 120).grade, 4);
  assert.equal(N.calc(109, 1, 120).grade, 5);
});

test('200명 중 공동 15등 12명: 중간석차 20.5(10.25%) → 2등급, 혼자였다면 1등급', () => {
  const r = N.calc(15, 12, 200);
  assert.equal(r.mid, 20.5);
  assert.equal(r.midPct, 10.25);
  assert.equal(r.grade, 2);
  assert.equal(r.gradeIfAlone, 1);
  assert.equal(r.straddle, true);
});

test('200명 만점자 39명은 전원 1등급, 40명은 전원 2등급', () => {
  assert.equal(N.calc(1, 39, 200).grade, 1);
  assert.equal(N.calc(1, 40, 200).grade, 2);
});

test('공개 사례: 96명 공동 1등 19명은 2등급, 120명 공동 2등 15명은 1등급', () => {
  const a = N.calc(1, 19, 96);
  assert.equal(a.mid, 10);
  assert.equal(a.grade, 2);
  assert.equal(N.calc(1, 18, 96).grade, 1);
  const b = N.calc(2, 15, 120);
  assert.equal(b.mid, 9);
  assert.equal(b.midPct, 7.5);
  assert.equal(b.grade, 1);
});

test('동점 묶음이 경계에 닿기만 하고 넘지 않으면 누적 인원 기준', () => {
  const a = N.calc(19, 2, 200); // 19~20등, 1등급 마지막 등수 20
  assert.equal(a.straddle, false);
  assert.equal(a.grade, 1);
  const b = N.calc(20, 2, 200); // 20~21등 → 경계 걸침
  assert.equal(b.straddle, true);
  assert.equal(b.grade, 2);
});

test('여러 경계에 걸친 큰 묶음은 중간석차 백분율로 정한다', () => {
  assert.equal(N.calc(1, 100, 200).grade, 2); // 중간석차 50.5 → 25.25%
  assert.equal(N.calc(1, 200, 200).grade, 3); // 중간석차 100.5 → 50.25%
});

test('등급 경계 백분율 정확히 같은 값은 상위 등급', () => {
  // 100명, 공동 9등 3명 → 9~11등, 중간석차 10 → 10% → 1등급
  assert.equal(N.calc(9, 3, 100).grade, 1);
  // 100명, 공동 33등 3명 → 33~35등, 중간석차 34 → 34% → 2등급
  assert.equal(N.calc(33, 3, 100).grade, 2);
  // 100명, 공동 65등 3명 → 중간석차 66 → 3등급, 공동 89등 3명 → 90% → 4등급
  assert.equal(N.calc(65, 3, 100).grade, 3);
  assert.equal(N.calc(89, 3, 100).grade, 4);
  assert.equal(N.calc(90, 3, 100).grade, 5);
});

test('입력 검증', () => {
  assert.equal(N.calc(0, 1, 10).ok, false);
  assert.equal(N.calc(1, 0, 10).ok, false);
  assert.equal(N.calc(11, 1, 10).ok, false);
  assert.equal(N.calc(9, 3, 10).ok, false);
  assert.equal(N.calc('a', 1, 10).ok, false);
  assert.equal(N.calc(1.5, 1, 10).ok, false);
  assert.equal(N.calc(1, 1, 0).ok, false);
  assert.equal(N.calc(1, 1, 3).smallClass, true);
  assert.equal(N.calc(1, 1, 6).smallClass, false);
});

test('등급별 석차 범위', () => {
  assert.deepEqual(N.gradeRanges(96).map(r => [r.from, r.to]), [[1, 10], [11, 33], [34, 63], [64, 86], [87, 96]]);
  const small = N.gradeRanges(4);
  assert.equal(small[0].people, 0);
  assert.equal(small[0].from, null);
  assert.equal(N.gradeRanges(4).reduce((s, r) => s + r.people, 0), 4);
  assert.equal(N.gradeRanges(5)[4].people, 0); // 5명이면 5등급 자리 없음
});

test('동점자 시뮬레이터 구간', () => {
  assert.deepEqual(N.tieBands(200, 1), [
    { from: 1, to: 39, grade: 1 }, { from: 40, to: 135, grade: 2 }, { from: 136, to: 200, grade: 3 }
  ]);
  assert.deepEqual(N.tieBands(96, 1), [
    { from: 1, to: 18, grade: 1 }, { from: 19, to: 64, grade: 2 }, { from: 65, to: 96, grade: 3 }
  ]);
  assert.deepEqual(N.tieBands(10, 11), []);
});

test('1등급 인원 추정', () => {
  assert.equal(N.topGradeHeadcount(200, 1, 39), 39);
  assert.equal(N.topGradeHeadcount(200, 1, 40), 0);
  assert.equal(N.topGradeHeadcount(200, 1, 10), 20);
  assert.equal(N.topGradeHeadcount(200, 15, 12), 14);
  assert.equal(N.topGradeHeadcount(120, 2, 15), 16);
});

test('성취율 → 성취도 (공통 과목 기준)', () => {
  const cases = [[100, 'A'], [90, 'A'], [89.9, 'B'], [80, 'B'], [70, 'C'], [60, 'D'], [59.9, 'E'], [40, 'E'], [39.9, 'I'], [0, 'I']];
  for (const [s, a] of cases) assert.equal(N.achievement(s), a, String(s));
  assert.equal(N.achievement(101), null);
  assert.equal(N.achievement(''), null);
  assert.equal(N.achievement(-1), null);
});

test('학점 가중 평균과 등급 없는 과목 제외', () => {
  const r = N.weightedAverage([
    { credit: 4, grade: 1 }, { credit: 4, grade: 2 }, { credit: 2, grade: 'none' }, { credit: 3, grade: 3 }
  ]);
  assert.equal(r.used, 3);
  assert.equal(r.skipped, 1);
  assert.equal(r.credits, 11);
  assert.ok(Math.abs(r.average - 21 / 11) < 1e-12);
  const empty = N.weightedAverage([]);
  assert.equal(empty.average, null);
  assert.equal(empty.skipped, 0);
  // 학점을 비워 둔 '등급 없음' 행은 제외 개수에 넣지 않는다(빈 화면 오표시 방지)
  assert.equal(N.weightedAverage([{ credit: '', grade: 'none' }]).skipped, 0);
});

test('목표 평균 역산', () => {
  const a = N.requiredAverage(40, 20, 20, 1.5);
  assert.equal(a.status, 'possible');
  assert.ok(Math.abs(a.need - 1) < 1e-12);
  const b = N.requiredAverage(40, 20, 20, 1.4);
  assert.equal(b.status, 'impossible');
  assert.ok(Math.abs(b.bestFinal - 1.5) < 1e-12);
  const c = N.requiredAverage(40, 20, 20, 3.5);
  assert.equal(c.status, 'secured');
  assert.equal(N.requiredAverage(40, 20, 0, 2).ok, false);
  assert.equal(N.requiredAverage(40, 20, 10, 6).ok, false);
});

test('백분율 표시는 경계와 헷갈리지 않게', () => {
  assert.equal(N.formatPct(10.25), '10.25');
  assert.equal(N.formatPct(10), '10.00');
  assert.equal(N.formatPct(10.0004), '10.0004');
  assert.equal(N.formatPct(100 * 10 / 96), '10.42');
});
