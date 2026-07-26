#!/usr/bin/env node
/**
 * Supabase에 공공데이터 수집 스키마/버킷을 적용합니다.
 *
 * 지원 경로 (우선순위):
 * 1) SUPABASE_ACCESS_TOKEN + 프로젝트 ref → Management API로 SQL 실행
 * 2) DATABASE_URL / SUPABASE_DB_URL → psql 실행
 * 3) SUPABASE_SERVICE_KEY → Storage 버킷 REST 생성 (테이블은 1/2 필요)
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.WEOLBU_SUPABASE_URL ||
  'https://inftexpcnfinglwlrvsj.supabase.co'
).replace(/\/$/, '');
const SERVICE_KEY = (
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.WEOLBU_SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  ''
).trim();
const ACCESS_TOKEN = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
const DB_URL = (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  (SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1] ||
  'inftexpcnfinglwlrvsj';

const SQL = readFileSync(join(__dirname, '../supabase/public_data_collector.sql'), 'utf8');

function log(msg) {
  console.log(msg);
}

async function createBucketViaRest() {
  if (!SERVICE_KEY) {
    log('SKIP bucket REST: service key 없음');
    return false;
  }
  const response = await fetch(`${URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'public-data-csv',
      name: 'public-data-csv',
      public: true,
      file_size_limit: 52428800,
      allowed_mime_types: ['text/csv', 'text/plain', 'application/csv'],
    }),
  });
  const text = await response.text();
  if (response.ok || text.includes('already exists') || text.includes('Duplicate')) {
    log(`OK bucket REST (${response.status}): ${text.slice(0, 200)}`);
    return true;
  }
  log(`FAIL bucket REST (${response.status}): ${text.slice(0, 300)}`);
  return false;
}

async function applySqlViaManagementApi() {
  if (!ACCESS_TOKEN) {
    log('SKIP management SQL: SUPABASE_ACCESS_TOKEN 없음');
    return false;
  }
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: SQL }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    log(`FAIL management SQL (${response.status}): ${text.slice(0, 400)}`);
    return false;
  }
  log(`OK management SQL: ${text.slice(0, 200)}`);
  return true;
}

function applySqlViaPsql() {
  if (!DB_URL) {
    log('SKIP psql: DATABASE_URL/SUPABASE_DB_URL 없음');
    return false;
  }
  const result = spawnSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/public_data_collector.sql'], {
    encoding: 'utf8',
  });
  if (result.status === 0) {
    log(`OK psql:\n${result.stdout.slice(0, 400)}`);
    return true;
  }
  log(`FAIL psql (${result.status}): ${(result.stderr || result.stdout || '').slice(0, 400)}`);
  return false;
}

async function probeTable() {
  const key = SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!key) return false;
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/public_data_collection_logs?select=id&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    },
  );
  const text = await response.text();
  const ok = response.ok;
  log(`PROBE table: HTTP ${response.status} ${text.slice(0, 180)}`);
  return ok;
}

const sqlOk = (await applySqlViaManagementApi()) || applySqlViaPsql();
const bucketOk = await createBucketViaRest();
const tableOk = await probeTable();

if (!sqlOk && !tableOk) {
  console.error('스키마 적용 실패: SUPABASE_ACCESS_TOKEN 또는 DATABASE_URL, 또는 유효한 service key가 필요합니다.');
  process.exitCode = 1;
} else if (!tableOk && sqlOk) {
  log('SQL은 실행됐지만 테이블 probe가 아직 실패했습니다. 스키마 캐시 반영을 잠시 기다려 주세요.');
} else {
  log(`완료: sql=${sqlOk} bucket=${bucketOk} table=${tableOk}`);
}
