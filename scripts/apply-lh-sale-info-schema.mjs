#!/usr/bin/env node
/**
 * Supabase에 LH 분양정보 스키마를 적용합니다.
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

const SQL = readFileSync(join(__dirname, '../supabase/lh_sale_info.sql'), 'utf8');

function log(msg) {
  console.log(msg);
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
  const result = spawnSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/lh_sale_info.sql'], {
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/lh_sale_notices?select=id&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  log(`PROBE table: HTTP ${response.status} ${text.slice(0, 180)}`);
  return response.ok;
}

const sqlOk = (await applySqlViaManagementApi()) || applySqlViaPsql();
const tableOk = await probeTable();

if (!sqlOk && !tableOk) {
  console.error('스키마 적용 실패: SUPABASE_ACCESS_TOKEN 또는 DATABASE_URL이 필요합니다.');
  process.exitCode = 1;
} else {
  log(`완료: sql=${sqlOk} table=${tableOk}`);
}
