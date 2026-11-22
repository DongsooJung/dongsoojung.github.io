#!/usr/bin/env node
// stargatelearn.com 수익화 감사 + RSI 자기개선 루프.
//
//   observe   → 라이브 글·페이지를 훑어 본문 안에 다음 단계(오퍼)가 있는지 본다
//   diagnose  → 지난 회차의 미해결 누수를 이어받는다
//   repair    → 생성된 페이지가 오퍼를 잃어버린 경우 본문에 되돌려 넣는다
//   record    → 다음 회차가 시작할 결정 로그를 남긴다
//
// 판단 기준(자매 사이트와 같은 규약):
//   - 방문자가 닿을 수 있는 모든 글·페이지 본문 안에 다음 단계가 있어야 한다
//   - 그 다음 단계는 측정 가능해야 한다(data-conversion 속성 또는 지정된 링크)
//   - 조회 0 은 결함이 아니라 데이터 미수집이다. 클릭 0 은 "읽지만 행동하지 않음"이다
//
// 오퍼 정의는 stargatelearn-offers.json 한 곳에만 있다.
//
//   node stargatelearn-self-improve.mjs [--dry-run]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG_FILE = path.join(ROOT, 'stargatelearn-offers.json');
const LOG_FILE = path.join(ROOT, 'out', 'stargatelearn-self-improvement.json');
const SITE = 'https://stargatelearn.com';

export async function loadConfig() {
  const raw = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  const offers = (raw.offers ?? [])
    .map((offer) => ({ ...offer, href: offer.href || (offer.name === 'paid_problem_set' ? raw.storeProductUrl : '') }))
    .filter((offer) => offer.href);
  return {
    offers,
    excluded: raw.excluded ?? [],
    measurable: raw.measurable ?? { attribute: 'data-conversion', hrefs: [] },
  };
}

// 라이브에 실제로 게시된 글·페이지만 대상으로 삼는다. 초안은 대상이 아니다.
export async function liveContent() {
  const items = [];
  for (const kind of ['posts', 'pages']) {
    for (let page = 1; page <= 5; page += 1) {
      const url = new URL(`${SITE}/wp-json/wp/v2/${kind}`);
      url.search = new URLSearchParams({ per_page: '100', page: String(page), _fields: 'link,title,content,status' }).toString();
      const res = await fetch(url);
      if (!res.ok) break;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const row of rows) {
        if (row.status !== 'publish') continue;
        let pathname = '/';
        try { pathname = new URL(row.link).pathname; } catch { /* 유효하지 않은 링크는 건너뛴다. */ }
        items.push({ kind, path: pathname, title: row.title?.rendered ?? '', html: row.content?.rendered ?? '' });
      }
      if (rows.length < 100) break;
    }
  }
  return items;
}

export function auditHtml(html, pathname, config) {
  const excluded = config.excluded.some((pattern) => pathname.startsWith(pattern));
  const offers = config.offers.filter((offer) => html.includes(`href="${offer.href}"`) || html.includes(`href='${offer.href}'`)).map((offer) => offer.name);
  const labels = [...html.matchAll(new RegExp(`${config.measurable.attribute}="([a-z_]+)"`, 'g'))].map((match) => match[1]);
  const measurableHref = config.measurable.hrefs.some((href) => href && html.includes(`href="${href}"`));
  const measured = labels.length > 0 || measurableHref;
  return {
    path: pathname,
    excluded,
    offers,
    hasOffer: offers.length > 0,
    labels: [...new Set(labels)].sort(),
    measured,
    bytes: html.length,
  };
}

export function audit(config, items) {
  const pages = items.map((item) => auditHtml(item.html, item.path, config));
  const inScope = pages.filter((page) => !page.excluded);
  const missingOffer = inScope.filter((page) => !page.hasOffer);
  const unmeasured = inScope.filter((page) => page.hasOffer && !page.measured);
  return {
    generatedAt: new Date().toISOString(),
    pages,
    totals: {
      all: pages.length,
      inScope: inScope.length,
      withOffer: inScope.filter((page) => page.hasOffer).length,
      missingOffer: missingOffer.length,
      unmeasured: unmeasured.length,
    },
    missingOffer: missingOffer.map((page) => page.path),
    unmeasured: unmeasured.map((page) => page.path),
  };
}

// 누수는 코드로 세고 경로로 가리킨다. 이전 회차와 비교해 처음/몇 번째인지 붙인다.
export function mergeFindings(previous = [], current = []) {
  const before = new Map(previous.map((item) => [`${item.code}:${item.target}`, item]));
  const now = new Map(current.map((item) => [`${item.code}:${item.target}`, item]));
  const open = [];
  const closed = [];
  for (const [key, item] of now) {
    const earlier = before.get(key);
    open.push({ ...item, firstSeen: earlier?.firstSeen ?? item.firstSeen, count: (earlier?.count ?? 0) + 1 });
  }
  for (const [key, item] of before) {
    if (!now.has(key)) closed.push({ ...item, closedAt: new Date().toISOString() });
  }
  return { open, closed };
}

export async function runSelfImprovement({ today = new Date().toISOString().slice(0, 10), dryRun = false } = {}) {
  const config = await loadConfig();
  let previous = { openFindings: [], iterations: [] };
  try {
    previous = JSON.parse(await fs.readFile(LOG_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const report = audit(config, await liveContent());
  const findings = [
    ...report.missingOffer.map((url) => ({ code: 'missing_offer', target: url })),
    ...report.unmeasured.map((url) => ({ code: 'unmeasured_offer', target: url })),
  ];
  const { open, closed } = mergeFindings(previous.openFindings ?? [], findings);

  const iteration = {
    date: today,
    pagesInScope: report.totals.inScope,
    pagesWithOffer: report.totals.withOffer,
    pagesMissingOffer: report.totals.missingOffer,
    pagesUnmeasured: report.totals.unmeasured,
    openFindings: open.length,
    repaired: 0,
  };
  const iterations = previous.iterations ?? [];
  const last = iterations[iterations.length - 1];
  iteration.streak = last && last.pagesMissingOffer === 0 && iteration.pagesMissingOffer === 0 ? (last.streak ?? 1) + 1 : 1;

  const payload = {
    updatedAt: new Date().toISOString(),
    rule: 'Every page a visitor can land on must offer a next step inside the content, and that step must be measurable.',
    dataQuality: 'Every analytics read sends the Origin of this site. The service keeps one store per site, so a request without Origin answers with another Stargate site\'s data. Views of 0 mean no data collected yet, not a defect.',
    today,
    openFindings: open,
    iterations: [...iterations.slice(-29), iteration],
  };

  if (!dryRun) {
    await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
    await fs.writeFile(LOG_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  return { report, open, closed, iteration, dryRun, logFile: LOG_FILE };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  const result = await runSelfImprovement({ dryRun });
  console.log(`[self-improve] ${result.report.totals.inScope} pages in scope · ${result.report.totals.withOffer} with an offer · ${result.report.totals.missingOffer} missing · ${result.report.totals.unmeasured} unmeasured`);
  console.log(`[self-improve] streak ${result.iteration.streak} · open findings ${result.open.length}${dryRun ? ' · dry-run (로그 미기록)' : ''}`);
  for (const item of result.open) console.log(`[self-improve] open: ${item.code} ${item.target} (seen ${item.count}x)`);
  for (const item of result.closed) console.log(`[self-improve] closed: ${item.code} ${item.target}`);
}
