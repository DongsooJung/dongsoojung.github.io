#!/usr/bin/env node
// stargatelearn.com 경로별 측정 + 수익 단계 집계.
//
// 워커는 Origin 헤더로 사이트별 저장소를 나눈다. Origin 없이 호출하면 다른 Stargate
// 사이트의 데이터가 응답하므로, 이 스크립트의 모든 호출은 Origin 을 붙인다.
// 판정 기준은 트래픽이 아니라 수익 단계다(stargatelearn-revenue.mjs).
// 출력: out/stargatelearn-metrics.json (경로·횟수만. 방문자 정보 없음)
//
//   node measure-stargatelearn.mjs [--days 30] [--out ./out]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFunnel, pathVerdict, revenueScore, stageCounts, sufficiency, MIN_VIEWS } from './stargatelearn-revenue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG_FILE = path.join(ROOT, 'stargatelearn-offers.json');
const ENDPOINT = 'https://stargate.stargate8225.workers.dev/api/analytics';
export const ORIGIN = 'https://www.stargatelearn.com';
export const SITE = 'https://stargatelearn.com';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

export async function loadConfig() {
  try {
    const raw = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    const targets = [...(raw.targets ?? [])];
    if (raw.productPage && !targets.some((rule) => rule.match === raw.productPage)) {
      targets.push({ match: raw.productPage, stage: 'consideration', priority: 10 });
    }
    return { ...raw, targets };
  } catch {
    return { offers: [], targets: [], excluded: [], measurable: { attribute: 'data-conversion', hrefs: [] } };
  }
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

export async function measure(days = 30) {
  const config = await loadConfig();
  const summary = await call('get_site_usage_summary', { p_days: days });
  const views = new Map();
  for (const row of summary.pages ?? []) views.set(row.page_path, Number(row.page_views) || 0);

  const paths = await livePaths();
  const rows = [];
  for (const item of paths) {
    const clickRows = await call('get_site_button_click_counts', { p_page_path: item.path });
    const labels = {};
    let count = 0;
    for (const click of clickRows ?? []) {
      const label = click.element_label || '(unlabeled)';
      labels[label] = (labels[label] ?? 0) + (Number(click.clicks) || 0);
      count += Number(click.clicks) || 0;
    }
    const stageClicks = stageCounts(clickRows ?? [], config.targets ?? []);
    const row = {
      path: item.path,
      kind: item.kind,
      views: views.get(item.path) ?? 0,
      clicks: count,
      labels,
      stageClicks,
      revenueScore: revenueScore(clickRows ?? [], config.targets ?? []),
    };
    rows.push(row);
  }

  // 수익 단계 기준 판정. 조회 0 은 결함이 아니라 데이터 미수집이다.
  for (const row of rows) {
    row.verdict = pathVerdict(row);
    row.action =
      row.verdict === 'read-not-acting' || row.verdict === 'activated'
        ? 'strengthen-offer'
        : row.verdict === 'clicked-unknown'
          ? 'map-target'
          : row.verdict === 'no-data'
            ? 'collect-data'
            : 'keep-separate';
  }

  const funnel = buildFunnel(rows);
  let visitors = null;
  try {
    visitors = await call('get_site_visit_summary', { p_days: days });
  } catch { /* 방문자 합계가 없어도 경로별 지표는 그대로 쓴다. */ }

  const totals = {
    pages: rows.length,
    views: rows.reduce((sum, row) => sum + row.views, 0),
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    pathsWithReads: rows.filter((row) => row.views >= MIN_VIEWS).length,
    pathsWithClicks: rows.filter((row) => row.clicks > 0).length,
    revenueIntentClicks: funnel.stageClicks.intent,
    revenueConsiderationClicks: funnel.stageClicks.consideration,
    revenueActivationClicks: funnel.stageClicks.activation,
    unknownTargetClicks: funnel.unknownTarget,
    revenueScore: funnel.revenueScore,
  };

  const report = {
    updatedAt: new Date().toISOString(),
    origin: ORIGIN,
    windowDays: days,
    source: 'cloudflare',
    rule: 'Every page a visitor can land on must offer a next step inside the content, and that step must be measurable. Views of 0 mean no data collected yet, not a defect. Ranking follows the money path, not traffic.',
    offerStages: (config.offers ?? []).map((offer) => ({ name: offer.name, stage: offer.stage, href: offer.href || null })),
    visitors,
    pages: rows,
    funnel,
    totals,
  };
  report.sufficiency = sufficiency(report);
  return report;
}

async function main() {
  const days = Number(arg('days', '30'));
  const outDir = path.resolve(ROOT, arg('out', 'out'));
  const report = await measure(days);
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, 'stargatelearn-metrics.json');
  await fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[measure] ${report.totals.pages} paths over ${days} days · ${report.totals.views} views · ${report.totals.clicks} clicks · ${report.totals.pathsWithReads} paths read ${MIN_VIEWS}+ times`);
  console.log(`[measure] money path: activation=${report.funnel.stageClicks.activation} consideration=${report.funnel.stageClicks.consideration} intent=${report.funnel.stageClicks.intent} revenue=${report.funnel.stageClicks.revenue}(external) · intent score ${report.totals.revenueScore}`);
  console.log(`[measure] clicks with an unknown destination: ${report.totals.unknownTargetClicks} (단계 미상 — 규칙 보완 대상, 클릭 0 으로 오판하지 않도록 따로 센다)`);
  console.log(`[measure] visitors: ${report.visitors ? JSON.stringify(report.visitors) : 'unavailable'}`);
  for (const row of report.pages) {
    console.log(`[measure] ${row.path.padEnd(58)} views=${String(row.views).padEnd(4)} clicks=${String(row.clicks).padEnd(4)} ${row.verdict.padEnd(15)} → ${row.action}`);
  }
  console.log(`[measure] sufficiency: ${report.sufficiency.sufficient} — ${report.sufficiency.reason}`);
  console.log(`[measure] written ${file}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[measure] 실패: ${error?.message ?? error}`);
    process.exit(1);
  });
}
