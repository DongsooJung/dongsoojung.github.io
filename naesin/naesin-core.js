/*!
 * 내신 5등급제 계산 모듈 (stargateedu.co.kr/naesin/)
 *
 * 근거
 *  - 등급별 누적비율 10·34·66·90·100% (2025 고1부터 적용되는 5등급 상대평가)
 *  - 등급별 누적 학생수 = 수강자수 × 누적비율을 반올림 (학업성적관리 시행지침)
 *  - 중간석차 = 석차 + (동석차수 − 1) ÷ 2, 중간석차 백분율 = 중간석차 ÷ 수강자수 × 100
 *  - 중간석차는 동점자 묶음이 등급 경계에 걸린 경우에만 적용
 *
 * 부동소수점 오차를 피하려고 모든 경계 비교는 정수 연산으로 합니다.
 * 중간석차는 x.5가 될 수 있으므로 2배 값(m2 = 2×석차 + 동석차수 − 1)으로 다룹니다.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Naesin = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BOUNDS = [10, 34, 66, 90, 100];      // 누적비율(%)
  var SHARES = [10, 24, 32, 24, 10];       // 등급별 비율(%)
  var MAX_TOTAL = 100000;

  function toInt(v) {
    if (v === null || v === undefined || v === '') return NaN;
    var n = Number(v);
    return Number.isInteger(n) ? n : NaN;
  }

  /** 등급별 누적 학생수(반올림, 0.5는 올림). 정수 연산: floor((N×B + 50) / 100) */
  function cumulativeCounts(total) {
    return BOUNDS.map(function (b) { return Math.floor((total * b + 50) / 100); });
  }

  /** 중간석차 백분율로 등급 결정: pct ≤ B ⇔ 50 × m2 ≤ B × N */
  function gradeByMid2(m2, total) {
    for (var i = 0; i < BOUNDS.length; i++) {
      if (50 * m2 <= BOUNDS[i] * total) return i + 1;
    }
    return 5;
  }

  /** 단독 석차(마지막 등수)가 들어가는 등급: 누적 학생수 기준 */
  function gradeByRank(rank, counts) {
    for (var i = 0; i < counts.length; i++) {
      if (rank <= counts[i]) return i + 1;
    }
    return 5;
  }

  function validate(rank, ties, total) {
    if (!Number.isInteger(total) || total < 1) return '수강자 수는 1 이상의 정수로 입력해 주세요.';
    if (total > MAX_TOTAL) return '수강자 수가 너무 큽니다.';
    if (!Number.isInteger(rank) || rank < 1) return '석차는 1 이상의 정수로 입력해 주세요.';
    if (!Number.isInteger(ties) || ties < 1) return '동석차 수는 1 이상으로 입력해 주세요. 동점자가 없으면 1입니다.';
    if (rank > total) return '석차가 수강자 수보다 클 수 없습니다.';
    if (rank + ties - 1 > total) return '석차 + 동석차 수 − 1이 수강자 수를 넘습니다. 입력을 확인해 주세요.';
    return '';
  }

  /**
   * 석차·동석차수·수강자수로 석차등급을 계산합니다.
   * @returns {{ok:boolean,error?:string,grade?:number,...}}
   */
  function calc(rank, ties, total) {
    rank = toInt(rank); ties = toInt(ties); total = toInt(total);
    var err = validate(rank, ties, total);
    if (err) return { ok: false, error: err };

    var counts = cumulativeCounts(total);
    var last = rank + ties - 1;
    var m2 = 2 * rank + ties - 1;
    var straddle = false;
    for (var i = 0; i < counts.length - 1; i++) {
      if (rank <= counts[i] && counts[i] < last) { straddle = true; break; }
    }
    var grade = straddle ? gradeByMid2(m2, total) : gradeByRank(last, counts);
    var gradeIfAlone = gradeByRank(rank, counts);

    return {
      ok: true,
      rank: rank, ties: ties, total: total,
      lastRank: last,
      mid: m2 / 2,
      midPct: 50 * m2 / total,
      rankPct: 100 * rank / total,
      grade: grade,
      gradeIfAlone: gradeIfAlone,
      straddle: straddle,
      method: straddle ? 'mid' : 'count',
      counts: counts,
      smallClass: total <= 5
    };
  }

  /** 등급별 석차 범위(동점자 없을 때). 인원 0인 등급은 null */
  function gradeRanges(total) {
    total = toInt(total);
    if (!Number.isInteger(total) || total < 1 || total > MAX_TOTAL) return [];
    var counts = cumulativeCounts(total);
    var prev = 0;
    return counts.map(function (c, i) {
      var r = { grade: i + 1, from: prev + 1, to: c, people: c - prev };
      if (c <= prev) { r.from = null; r.to = null; r.people = 0; }
      prev = Math.max(prev, c);
      return r;
    });
  }

  /**
   * 공동 rank등 동점자 수(ties)를 1명부터 늘려 가며 등급이 바뀌는 구간을 묶어 돌려줍니다.
   * 예) 200명, 공동 1등: [{from:1,to:39,grade:1},{from:40,to:...,grade:2},...]
   */
  function tieBands(total, rank) {
    total = toInt(total); rank = toInt(rank);
    if (validate(rank, 1, total)) return [];
    var bands = [];
    var maxTies = total - rank + 1;
    for (var k = 1; k <= maxTies; k++) {
      var g = calc(rank, k, total).grade;
      var b = bands[bands.length - 1];
      if (b && b.grade === g) b.to = k;
      else bands.push({ from: k, to: k, grade: g });
    }
    return bands;
  }

  /** 공동 rank등이 ties명일 때, 그 묶음까지 포함해 1등급을 받는 인원(뒤로는 동점 없음 가정) */
  function topGradeHeadcount(total, rank, ties) {
    var r = calc(rank, ties, total);
    if (!r.ok) return null;
    var c1 = r.counts[0];
    if (r.grade === 1) {
      // 묶음 앞 석차(rank−1명)는 단독이라고 가정하면 모두 1등급
      return Math.max(r.lastRank, c1);
    }
    // 묶음이 2등급 이하가 되면 묶음 앞의 단독 석차만 1등급(앞 석차 ≤ 누적 인원)
    return Math.min(rank - 1, c1);
  }

  /** 공통 과목 성취율(원점수) → 성취도. 40% 미만은 미도달(I 대상) */
  function achievement(score) {
    var s = Number(score);
    if (score === '' || score === null || !isFinite(s) || s < 0 || s > 100) return null;
    if (s >= 90) return 'A';
    if (s >= 80) return 'B';
    if (s >= 70) return 'C';
    if (s >= 60) return 'D';
    if (s >= 40) return 'E';
    return 'I';
  }

  /**
   * 학점 가중 평균 등급. rows: [{credit, grade}] — grade가 1~5가 아니면(성취도만·P 과목) 제외
   */
  function weightedAverage(rows) {
    var sum = 0, credits = 0, used = 0, skipped = 0;
    (rows || []).forEach(function (row) {
      var c = Number(row && row.credit);
      var g = toInt(row && row.grade);
      var hasCredit = isFinite(c) && c > 0;
      var hasGrade = g >= 1 && g <= 5;
      if (hasCredit && hasGrade) { sum += c * g; credits += c; used++; }
      else if (hasCredit && row && row.grade === 'none') skipped++;
    });
    return {
      used: used, skipped: skipped, credits: credits, weightedSum: sum,
      average: credits > 0 ? sum / credits : null
    };
  }

  /**
   * 목표 평균 역산: 지금까지(sum, credits)에 남은 학점 remaining을 더해 최종 평균 ≤ target이 되려면
   * 남은 과목 평균이 얼마 이하여야 하는지. 등급은 숫자가 작을수록 좋습니다.
   */
  function requiredAverage(currentSum, currentCredits, remaining, target) {
    var S = Number(currentSum), C = Number(currentCredits), R = Number(remaining), T = Number(target);
    if (!(R > 0) || !(T >= 1 && T <= 5) || !(C >= 0) || !(S >= 0)) return { ok: false };
    var need = (T * (C + R) - S) / R;
    var status = 'possible';
    if (need < 1 - 1e-9) status = 'impossible';
    else if (need >= 5 - 1e-9) status = 'secured';
    var best = (S + 1 * R) / (C + R);
    return { ok: true, need: need, status: status, bestFinal: best };
  }

  /** 백분율 표시: 반올림 값이 경계(10·34·66·90)와 같아져 오해를 부르면 자릿수를 늘립니다. */
  function formatPct(p) {
    var s = p.toFixed(2);
    for (var i = 0; i < BOUNDS.length; i++) {
      if (Number(s) === BOUNDS[i] && Math.abs(p - BOUNDS[i]) > 1e-12) return p.toFixed(4);
    }
    return s;
  }

  function formatNum(x) {
    return Number.isInteger(x) ? String(x) : x.toFixed(1);
  }

  return {
    BOUNDS: BOUNDS, SHARES: SHARES,
    cumulativeCounts: cumulativeCounts,
    calc: calc,
    gradeRanges: gradeRanges,
    tieBands: tieBands,
    topGradeHeadcount: topGradeHeadcount,
    achievement: achievement,
    weightedAverage: weightedAverage,
    requiredAverage: requiredAverage,
    formatPct: formatPct,
    formatNum: formatNum
  };
});
