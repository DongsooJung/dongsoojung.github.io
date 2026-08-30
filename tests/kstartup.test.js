import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { __test } from '../api/kstartup.js';

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

const fixture = [
  {
    id: 'a',
    biz_pbanc_nm: 'AI 창업기업 사업화 지원',
    supt_regin: '전국',
    supt_biz_clsfc: '사업화',
    biz_enyy: '예비창업자,3년미만',
    rcrt_prgs_yn: 'Y',
    pbanc_rcpt_end_dt: '20991231',
    detl_pg_url: 'www.k-startup.go.kr/example?a=1',
    pbanc_ctnt: '<p>지원 내용</p><script>alert(1)</script>',
  },
  {
    id: 'b',
    biz_pbanc_nm: '지역 교육',
    supt_regin: '서울특별시',
    supt_biz_clsfc: '창업교육',
    biz_enyy: '7년미만',
    rcrt_prgs_yn: 'N',
    pbanc_rcpt_end_dt: '20200101',
  },
];

test('normalizes URLs and strips active HTML', () => {
  const item = __test.normalizeItem(fixture[0], 'announcement');
  assert.equal(item.detl_pg_url, 'https://www.k-startup.go.kr/example?a=1');
  assert.equal(item.pbanc_ctnt, '지원 내용');
  assert.equal(item._type, 'announcement');
  assert.equal(__test.stripHtml('&lt;img src=x onerror=alert(1)&gt;안전한 본문'), '안전한 본문');
});

test('applies announcement filters locally', () => {
  const rows = fixture.map((item) => __test.normalizeItem(item, 'announcement'));
  const result = __test.filterItems(rows, 'announcement', {
    keyword: 'AI',
    region: '전국',
    category: '사업화',
    stage: '예비',
    recruiting: 'Y',
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'a');
});

test('OPTIONS returns CORS headers and non-GET is rejected', async () => {
  const optionsRes = mockRes();
  await handler({ method: 'OPTIONS', headers: { origin: 'https://stargateedu.co.kr' } }, optionsRes);
  assert.equal(optionsRes.statusCode, 204);
  assert.equal(optionsRes.headers['Access-Control-Allow-Origin'], 'https://stargateedu.co.kr');

  const postRes = mockRes();
  await handler({ method: 'POST', headers: {}, query: {} }, postRes);
  assert.equal(postRes.statusCode, 405);
});

test('GET returns filtered, paginated data without exposing the key', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.KSTARTUP_API_KEY;
  process.env.KSTARTUP_API_KEY = 'test-secret';
  __test.memoryCache.clear();
  global.fetch = async (url) => {
    assert.equal(new URL(url).searchParams.get('cond[rcrt_prgs_yn::EQ]'), 'Y');
    return {
      status: 200,
      text: async () => JSON.stringify({
      currentCount: fixture.length,
      data: fixture,
      matchCount: fixture.length,
      page: 1,
      perPage: 100,
      totalCount: fixture.length,
      }),
    };
  };

  try {
    const res = mockRes();
    await handler({
      method: 'GET',
      headers: {},
      query: { type: 'announcement', keyword: 'AI', recruiting: 'Y', page: '1', perPage: '10' },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.summary.recruiting, 1);
    assert.ok(res.body.facets.regions.includes('전국'));
    assert.equal(JSON.stringify(res.body).includes('test-secret'), false);
  } finally {
    global.fetch = originalFetch;
    if (originalKey == null) delete process.env.KSTARTUP_API_KEY;
    else process.env.KSTARTUP_API_KEY = originalKey;
    __test.memoryCache.clear();
  }
});

test('collects every recruiting page and merges concurrent cold requests', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.KSTARTUP_API_KEY;
  process.env.KSTARTUP_API_KEY = 'test-secret';
  __test.memoryCache.clear();
  __test.inflightCache.clear();
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    const page = Number(new URL(url).searchParams.get('page'));
    const count = page < 3 ? 100 : 77;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      status: 200,
      text: async () => JSON.stringify({
        totalCount: 29943,
        matchCount: 277,
        data: Array.from({ length: count }, (_, index) => ({
          id: `${page}-${index}`,
          biz_pbanc_nm: `모집 공고 ${page}-${index}`,
          rcrt_prgs_yn: 'Y',
          pbanc_rcpt_end_dt: '20991231',
        })),
      }),
    };
  };

  try {
    const req = { method: 'GET', headers: {}, query: { type: 'announcement', recruiting: 'Y' } };
    const first = mockRes();
    const second = mockRes();
    await Promise.all([handler(req, first), handler(req, second)]);
    assert.equal(calls, 3);
    assert.equal(first.body.totalCount, 277);
    assert.equal(first.body.poolCount, 277);
    assert.equal(first.body.partialDataset, false);
    assert.equal(second.body.totalCount, 277);
  } finally {
    global.fetch = originalFetch;
    if (originalKey == null) delete process.env.KSTARTUP_API_KEY;
    else process.env.KSTARTUP_API_KEY = originalKey;
    __test.memoryCache.clear();
    __test.inflightCache.clear();
  }
});

test('maps the official XML authentication error without caching it', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.KSTARTUP_API_KEY;
  process.env.KSTARTUP_API_KEY = 'invalid';
  __test.memoryCache.clear();
  global.fetch = async () => ({
    status: 403,
    text: async () => '<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>',
  });

  try {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { type: 'announcement', recruiting: 'Y' } }, res);
    assert.equal(res.statusCode, 502);
    assert.match(res.body.error, /인증|이용승인/);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  } finally {
    global.fetch = originalFetch;
    if (originalKey == null) delete process.env.KSTARTUP_API_KEY;
    else process.env.KSTARTUP_API_KEY = originalKey;
    __test.memoryCache.clear();
  }
});

test('returns a clean empty result when the upstream filter matches zero notices', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.KSTARTUP_API_KEY;
  process.env.KSTARTUP_API_KEY = 'test-secret';
  __test.memoryCache.clear();
  global.fetch = async () => ({
    status: 200,
    text: async () => JSON.stringify({
      totalCount: 29943,
      matchCount: 0,
      currentCount: 0,
      data: [],
    }),
  });

  try {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { type: 'announcement', recruiting: 'Y' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.totalCount, 0);
    assert.equal(res.body.upstreamTotalCount, 0);
    assert.equal(res.body.items.length, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalKey == null) delete process.env.KSTARTUP_API_KEY;
    else process.env.KSTARTUP_API_KEY = originalKey;
    __test.memoryCache.clear();
  }
});
