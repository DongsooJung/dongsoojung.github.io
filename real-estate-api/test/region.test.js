import test from "node:test";
import assert from "node:assert/strict";
import { __test } from "../api/region.js";

test("지역명과 거래월 입력을 정규화·검증한다", () => {
  assert.equal(
    __test.normalizeQuery("  서울시   관악구 대학동  "),
    "서울특별시 관악구 대학동",
  );
  assert.equal(
    __test.normalizeQuery("경기 화성시 향남읍"),
    "경기도 화성시 향남읍",
  );
  assert.doesNotThrow(() =>
    __test.validateInput("서울 관악구 대학동", "202606", 0, 100),
  );
  assert.throws(
    () => __test.validateInput("서울 관악구", "202606", 0, 100),
    /읍·면·동/,
  );
  assert.throws(
    () => __test.validateInput("서울 관악구 대학동", "202613", 0, 100),
    /YYYYMM/,
  );
});

test("읍면의 리 단위 실거래를 상위 법정 읍면으로 집계한다", () => {
  assert.equal(__test.matchesLegalDong("신림동", "신림동"), true);
  assert.equal(__test.matchesLegalDong("향남읍 장짐리", "향남읍"), true);
  assert.equal(__test.matchesLegalDong("봉천동", "신림동"), false);
});

test("거래량 요약 지표를 계산한다", () => {
  assert.deepEqual(
    __test.summarize([
      { price_manwon: 10000 },
      { price_manwon: 20000 },
      { price_manwon: 40000 },
    ]),
    {
      averagePrice: 23333,
      medianPrice: 20000,
      maxPrice: 40000,
      topApartment: "",
    },
  );
  assert.deepEqual(__test.summarize([]), {
    averagePrice: 0,
    medianPrice: 0,
    maxPrice: 0,
    topApartment: "",
  });
});

test("VWorld 경계 좌표를 단순화한다", () => {
  const ring = [];
  for (let index = 0; index < 25; index += 1)
    ring.push([126 + index * 0.00004, 37]);
  for (let index = 0; index < 25; index += 1)
    ring.push([126.001, 37 + index * 0.00004]);
  for (let index = 25; index > 0; index -= 1)
    ring.push([126 + index * 0.00004, 37.001]);
  for (let index = 25; index > 0; index -= 1)
    ring.push([126, 37 + index * 0.00004]);
  ring.push([...ring[0]]);
  const simplified = __test.simplifyGeometry(
    { type: "Polygon", coordinates: [ring] },
    0.00005,
  );
  assert.ok(simplified.coordinates[0].length < ring.length);
  assert.deepEqual(
    simplified.coordinates[0][0],
    simplified.coordinates[0].at(-1),
  );
});
