const CATALOG = Object.freeze({
  "koi-advanced": {
    name: "정보올림피아드 심화 (자료구조·알고리즘)",
    priceKRW: 429000,
    billing: "one_time",
    accessPeriodMonths: 3
  },
  "algorithms-bundle": {
    name: "알고리즘 종합 패키지 (입문+심화)",
    priceKRW: 690600,
    billing: "one_time",
    accessPeriodMonths: 3
  },
  "kmo-number-comb": {
    name: "KMO 대비 정수론·조합",
    priceKRW: 384000,
    billing: "one_time",
    accessPeriodMonths: 3
  },
  "koi-cpp-beginner": {
    name: "정보올림피아드 입문 (C++ 기초)",
    priceKRW: 297000,
    billing: "one_time",
    accessPeriodMonths: 3
  },
  "problem-bank-monthly": {
    name: "문제은행 월 구독",
    priceKRW: 39000,
    billing: "monthly"
  },
  "problem-bank-annual": {
    name: "문제은행 연 구독",
    priceKRW: 390000,
    billing: "annual"
  },
  "mock-exam-monthly": {
    name: "월간 모의고사",
    priceKRW: 49000,
    billing: "monthly"
  },
  "koi-beginner-textbook": {
    name: "정보올림피아드 입문 교재",
    priceKRW: 28800,
    billing: "one_time"
  },
  "algorithms-workbook-1": {
    name: "알고리즘 문제집 상권",
    priceKRW: 31500,
    billing: "one_time"
  },
  "koi-past-papers": {
    name: "KOI 기출·해설집 (2015-2025)",
    priceKRW: 37800,
    billing: "one_time"
  },
  "algorithms-ebook-set": {
    name: "알고리즘 문제집 eBook 세트",
    priceKRW: 47600,
    billing: "one_time"
  },
  "vacation-live-intensive": {
    name: "방학 집중 라이브특강 (4주)",
    priceKRW: 281600,
    billing: "one_time"
  },
  "koi-final-camp": {
    name: "KOI 직전 파이널 캠프",
    priceKRW: 405000,
    billing: "one_time"
  },
  "strategy-consulting": {
    name: "입시·대회 전략 컨설팅",
    priceKRW: 250000,
    billing: "one_time"
  },
  "ongoing-mentoring": {
    name: "1:1 정기 멘토링",
    priceKRW: 752000,
    billing: "monthly"
  }
});

function getProduct(productId) {
  return CATALOG[productId] || null;
}

function isSubscription(billing) {
  return billing === "monthly" || billing === "annual";
}

module.exports = { CATALOG, getProduct, isSubscription };
