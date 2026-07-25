#!/usr/bin/env node
/**
 * 공공데이터 수집 → CSV → Supabase Storage (GitHub Actions / CLI)
 *
 * 필요 환경변수:
 *   DATA_GO_KR_API_KEY
 *   SUPABASE_URL (선택)
 *   SUPABASE_SERVICE_KEY 또는 SUPABASE_ANON_KEY
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Vercel 핸들러의 순수 함수를 재사용하기 위해 동적 import
const mod = await import('../api/public-data-collector.js');
const handler = mod.default;

function mockReq(method, body = {}, query = {}) {
  return {
    method,
    body,
    query,
    headers: { origin: 'https://www.stargateedu.co.kr' },
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
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
  return res;
}

const apis = (process.env.COLLECT_APIS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const req = mockReq('POST', {
  apis: apis.length ? apis : undefined,
  saveToSupabase: true,
  includeCsv: false,
  previewLimit: 3,
});
const res = mockRes();
await handler(req, res);

if (!res.body?.ok) {
  console.error(JSON.stringify(res.body, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    collectedAt: res.body.collectedAt,
    results: res.body.results.map((row) => ({
      id: row.id,
      name: row.name,
      ok: row.ok,
      rowCount: row.rowCount,
      publicUrl: row.publicUrl,
      error: row.error,
    })),
  }, null, 2));
}

void require;
