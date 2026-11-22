#!/usr/bin/env node
// stargatelearn.com 경로별 측정.
//
// 워커는 Origin 헤더로 사이트별 저장소를 나눈다. Origin 없이 호출하면 다른 Stargate
// 사이트의 데이터가 응답하므로, 이 스크립트의 모든 호출은 Origin 을 붙인다.
// 출력: out/stargatelearn-metrics.json (경로·횟수만. 방문자 정보 없음)
//
//   node measure-stargatelearn.mjs [--days 30] [--out ./out]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const ENDPOINT = 'https://stargate.stargate8225.workers.dev/api/analytics';
export const ORIGIN = 'https://www.stargatelearn.com';
export const SITE = 'https://stargatelearn.com';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

export async function call(method, payload) {
  const response = await fetch(`${ENDPOINT}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${method}_${response.status}`);
  return response.json();
}

// 살아 있는 글·페이지 목록. 사이트가 실제로 가진 경로만 재야 한다.
export async function livePaths() {
  const paths = [];
  for (const kind of ['posts', 'pages']) {
    for (let page = 1; page <= 5; page += 1) {
      const url = new URL(`${SITE}/wp-json/wp/v2/${kind}`);
      url.search = new URLSearchParams({ per_page: '100', page: String(page), _fields: 'link' }).toString();
      const res = await fetch(url);
      if (!res.ok) break;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const row of rows) {
        try {
          paths.push({ kind, path: new URL(row.link).pathname, link: row.link });
        } catch { /* 잘못된 링크는 건너뛴다. */ }
      }
      if (rows.length < 100) break;
    }
  }
  const seen = new Set();
  return paths.filter((item) => (seen.has(item.path) ? false : (seen.add(item.path), true)));
}

export function verdict(views, clicks) {
  if (!views && !clicks) return 'no-data';
  if (views && !clicks) return 'read-not-acting';
  if (!views && clicks) return 'acting';
  return 'working';
}

// 조회 0 은 결함이 아니라 데이터 미수집이다. 클릭 0 은 "읽지만 행동하지 않음"이다.
export function actionFor(row) {
  if (row.verdict === 'read-not-acting') return 'strengthen-offer';
  if (row.verdict === 'no-data') return 'collect-data';
  return 'keep-separate';
}

export async function measure(days = 30) {
  const summary = await call('get_site_usage_summary', { p_days: days });
  const views = new Map();
  for (const row of summary.pages ?? []) views.set(row.page_path, Number(row.page_views) || 0);

  const paths = await livePaths();
  const rows = [];
  for (const item of paths) {
    const clicks = await call('get_site_button_click_counts', { p_page_path: item.path });
    const labels = {};
    let count = 0;
    for (const click of clicks ?? []) {
      const label = click.element_label || '(unlabeled)';
      labels[label] = (labels[label] ?? 0) + (Number(click.clicks) || 0);
      count += Number(click.clicks) || 0;
    }
    const row = { path: item.path, kind: item.kind, views: views.get(item.path) ?? 0, clicks: count, labels };
    row.verdict = verdict(row.views, row.clicks);
    row.action = actionFor(row);
    rows.push(row);
  }

  let visitors = null;
  try {
    visitors = await call('get_site_visit_summary', { p_days: days });
  } catch { /* 방문자 합계가 없어도 경로별 지표는 그대로 쓴다. */ }

  return {
    updatedAt: new Date().toISOString(),
    origin: ORIGIN,
    windowDays: days,
    source: 'cloudflare',
    rule: 'Every page a visitor can land on must offer a next step inside the content, and that step must be measurable. Views of 0 mean no data collected yet, not a defect.',
    visitors,
    pages: rows,
    totals: {
      pages: rows.length,
      views: rows.reduce((sum, row) => sum + row.views, 0),
      clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
      pagesWithViews: rows.filter((row) => row.views > 0).length,
      pagesWithClicks: rows.filter((row) => row.clicks > 0).length,
      readNotActing: rows.filter((row) => row.verdict === 'read-not-acting').map((row) => row.path),
    },
  };
}

async function main() {
  const days = Number(arg('days', '30'));
  const outDir = path.resolve(ROOT, arg('out', 'out'));
  const report = await measure(days);
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, 'stargatelearn-metrics.json');
  await fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[measure] ${report.totals.pages} paths over ${days} days · ${report.totals.views} views · ${report.totals.clicks} clicks · ${report.totals.pagesWithViews} paths with views`);
  console.log(`[measure] visitors: ${report.visitors ? JSON.stringify(report.visitors) : 'unavailable'}`);
  for (const row of report.pages) {
    console.log(`[measure] ${row.path.padEnd(58)} views=${String(row.views).padEnd(4)} clicks=${String(row.clicks).padEnd(4)} ${row.verdict} → ${row.action}`);
  }
  console.log(`[measure] written ${file}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[measure] 실패: ${error?.message ?? error}`);
    process.exit(1);
  });
}
