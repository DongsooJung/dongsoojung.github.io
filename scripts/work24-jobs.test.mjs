import assert from "node:assert/strict";
import test from "node:test";
import { fetchWork24Jobs, parseWork24Date, parseWork24Response } from "./work24-jobs.mjs";

test("parses the documented Work24 wanted fields and decodes XML entities", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <wantedRoot><total>1</total><wanted>
      <wantedAuthNo>W123</wantedAuthNo><company>별의문 &amp; 동수</company>
      <title>데이터 분석가</title><region>서울 강남구</region><career>관계없음</career>
      <empTpCd>20</empTpCd><indTpNm>정보통신업</indTpNm><salTpNm>연봉</salTpNm>
      <sal>4,000만원</sal><regDt>20261004</regDt><closeDt>20261031</closeDt>
      <infoSvc>워크넷 인증</infoSvc><wantedInfoUrl>https://www.work24.go.kr/job?no=1&amp;src=api</wantedInfoUrl>
    </wanted></wantedRoot>`;

  const result = parseWork24Response(xml);
  assert.equal(result.total, 1);
  assert.deepEqual(result.rows[0], {
    id: "W123",
    company: "별의문 & 동수",
    title: "데이터 분석가",
    location: "서울 강남구",
    career: "관계없음",
    employmentType: "기간의 정함이 있는 근로계약",
    description: "정보통신업 · 연봉 · 4,000만원",
    postedAt: "20261004",
    deadline: "20261031",
    source: "워크넷 인증",
    url: "https://www.work24.go.kr/job?no=1&src=api",
  });
});

test("converts Work24 compact dates to Korea-time ISO values", () => {
  assert.equal(parseWork24Date("20261004"), "2026-10-04T00:00:00+09:00");
  assert.equal(parseWork24Date("2026-10-04"), "2026-10-04");
  assert.equal(parseWork24Date(""), "");
});

test("keeps an unreported close date empty", () => {
  const result = parseWork24Response("<wantedRoot><total>1</total><wanted><wantedAuthNo>W1</wantedAuthNo><title>상시 채용</title></wanted></wantedRoot>");
  assert.equal(result.rows[0].deadline, "");
});

test("rejects non-Work24 and incomplete error responses", () => {
  assert.throws(() => parseWork24Response("<html>login</html>"), /응답 형식/);
  assert.throws(() => parseWork24Response("<wantedRoot><total>3</total></wantedRoot>"), /공고 목록/);
  assert.throws(() => parseWork24Response("<wantedRoot><message>invalid auth key</message></wantedRoot>"), /공고 목록/);
});

test("fetches successive pages from the last-three-days Work24 feed", async () => {
  const calls = [];
  const pageXml = (start, count) => `<wantedRoot><total>101</total>${Array.from({ length: count }, (_, index) => `<wanted><wantedAuthNo>${start + index}</wantedAuthNo><title>공고 ${start + index}</title></wanted>`).join("")}</wantedRoot>`;
  const feed = await fetchWork24Jobs("test-key", {
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      return new Response(pageXml(calls.length === 1 ? 1 : 101, calls.length === 1 ? 100 : 1));
    },
  });

  assert.equal(feed.mode, "authorized");
  assert.equal(feed.source, "고용24 OPEN-API");
  assert.equal(feed.sourceCount, 101);
  assert.equal(feed.truncated, false);
  assert.equal(feed.rows.length, 101);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get("display"), "100");
  assert.equal(calls[0].searchParams.get("regDate"), "D-3");
  assert.equal(calls[0].searchParams.get("startPage"), "1");
  assert.equal(calls[1].searchParams.get("startPage"), "2");
});
