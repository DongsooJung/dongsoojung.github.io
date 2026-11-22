#!/usr/bin/env node
// stargatelearn.com 수익화 감사 + RSI 자기개선 루프.
//
//   observe   → 라이브 글·페이지를 훑어 광고만 모델의 조건을 본다
//   diagnose  → 지난 회차의 미해결 누수를 이어받는다
//   repair    → (광고 슬롯·링크처럼 사람이 고쳐야 하는 것은 초안으로만 만든다)
//   record    → 다음 회차가 시작할 결정 로그를 남긴다
//
// 2026-11-22 사용자 확정: 수익 상품은 "광고만"(WordAds)이다. 유료 문제집·리드마그넷·상담이
// 없으므로 판단 기준이 바뀐다.
//
//   - 조회(page_view) 한 번 = 광고 노출 기회 한 번. 돈은 노출에서 나온다.
//   - 그래서 가치가 있는 기준은 4가지다.
//       1) 광고 슬롯이 있는가      슬롯이 없으면 노출 자체가 0
//       2) 내부 링크로 이어지는가    다음 페이지 = 추가 노출
//       3) 재방문 경로가 있는가      이메일 구독 = 다시 오는 세션 = 다시 생기는 노출
//       4) 본문이 읽을 만큼인가      얇은 페이지는 노출이 늘지 않는다
//   - 조회 0 은 결함이 아니라 데이터 미수집이다. 클릭 0 은 "읽지만 행동하지 않음"이다.
//
// 오퍼·단계 정의는 stargatelearn-offers.json 한 곳에만 있다.
//
//   node stargatelearn-self-improve.mjs [--dry-run]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathFinding, pathWatch } from './stargatelearn-revenue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG_FILE = path.join(ROOT, 'stargatelearn-offers.json');
const LOG_FILE = path.join(ROOT, 'out', 'stargatelearn-self-improvement.json');
const METRICS_FILE = path.join(ROOT, 'out', 'stargatelearn-metrics.json');
const SITE = 'https://stargatelearn.com';

export async function loadConfig() {
  const raw = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  // 수익 상품이 아직 정해지지 않았으면 해당 오퍼는 검사하지 않는다.
  const offers = (raw.offers ?? [])
    .map((offer) => ({ ...offer, href: offer.href || (offer.name === 'paid_problem_set' ? raw.productPage : '') }))
    .filter((offer) => offer.href);
  const targets = [...(raw.targets ?? [])];
  if (raw.productPage && !targets.some((rule) => rule.match === raw.productPage)) {
    targets.push({ match: raw.productPage, stage: 'consideration', priority: 10 });
  }
  if (raw.storeProductUrl && !targets.some((rule) => rule.match.includes('shop_view'))) {
    targets.push({ match: '/shop_view', stage: 'intent', priority: 30 });
  }
  return {
    ...raw,
    offers,
    targets,
    monetization: raw.monetization ?? 'product',
    siteOrigin: raw.siteOrigin ?? '',
    stageLabels: raw.stageLabels ?? {},
    contentRules: raw.contentRules ?? {},
    excluded: raw.excluded ?? [],
    measurable: raw.measurable ?? { attribute: 'data-conversion', hrefs: [] },
  };
}

// 라이브에 실제로 게시된 글·페이지만 대상으로 삼는다. 초안은 대상이 아니다.
// content.rendered 는 본문만, pageHtml 은 방문자가 실제로 보는 페이지 전체다.
//   - 광고 슬롯과 구독 폼은 테마에서 나올 수 있다 → pageHtml 로 봐야 한다
//   - 내부 링크와 분량은 본문 기준이다 → content.rendered 로 봐야 한다
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
        let pageHtml = '';
        try {
          const live = await fetch(`${SITE}${pathname}`);
          if (live.ok) pageHtml = await live.text();
        } catch { /* 페이지를 못 읽어도 본문 기준 감사는 계속된다. */ }
        items.push({ kind, path: pathname, title: row.title?.rendered ?? '', html: row.content?.rendered ?? '', pageHtml });
      }
      if (rows.length < 100) break;
    }
  }
  return items;
}

export function stripText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 본문 안의 내부 링크 수. 내비게이션·푸터 링크는 세지 않는다(항상 있기 때문이다).
// 워드프레스는 본문 링크를 절대 URL(https://stargatelearn.com/...)로 렌더링하므로
// 상대 경로와 같은 사이트 절대 URL 을 모두 센다.
export function countContentLinks(html, siteOrigin = 'https://stargatelearn.com') {
  const origin = String(siteOrigin).replace(/\/+$/, '').toLowerCase();
  const links = [...String(html ?? '').matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  return links.filter((href) => {
    const value = String(href).toLowerCase();
    if (value.startsWith('//') || value.startsWith('#') || value.startsWith('mailto:')) return false;
    if (value.startsWith('/')) return true;
    return origin && value.startsWith(origin);
  }).length;
}

// 광고 슬롯 검사는 측정 코드 영역을 뺀 페이지에서 한다.
// 측정 스니펫 안에도 광고 선택자 문자열이 들어 있어 그대로 보면
// "광고 슬롯 있음"으로 자기검출(false positive)하기 때문이다.
export function stripMeasurementBlock(html) {
  return String(html ?? '').replace(
    /<!--\s*stargatelearn:measure:start[\s\S]*?<!--\s*stargatelearn:measure:end\s*-->/gi,
    ' ',
  );
}

// 광고만 모델의 페이지 검사.
export function auditAdsOnly(items, config) {
  const rules = config.contentRules ?? {};
  const adMarkers = rules.adSlotMarkers ?? [];
  const returnMarkers = rules.returnPathMarkers ?? [];
  const excludedPaths = config.excluded ?? [];
  const pages = items.map((item) => {
    const page = stripMeasurementBlock(item.pageHtml ?? '');
    const excluded = excludedPaths.some((pattern) => item.path.startsWith(pattern));
    const text = stripText(item.html);
    return {
      path: item.path,
      kind: item.kind,
      excluded,
      hasAdSlot: adMarkers.some((marker) => page.includes(marker)),
      hasReturnPath: returnMarkers.some((marker) => page.includes(marker)),
      contentLinks: countContentLinks(item.html, config.siteOrigin),
      textLength: text.length,
      bytes: item.html.length,
    };
  });
  const inScope = pages.filter((page) => !page.excluded);
  const missingAdSlot = inScope.filter((page) => !page.hasAdSlot);
  const missingReturnPath = inScope.filter((page) => !page.hasReturnPath);
  const thinContent = inScope.filter((page) => page.textLength < (rules.minTextLength ?? 0));
  const noContentLinks = inScope.filter((page) => page.contentLinks < (rules.minContentLinks ?? 0));
  return {
    generatedAt: new Date().toISOString(),
    pages,
    totals: {
      all: pages.length,
      inScope: inScope.length,
      withAdSlot: inScope.length - missingAdSlot.length,
      missingAdSlot: missingAdSlot.length,
      missingReturnPath: missingReturnPath.length,
      thinContent: thinContent.length,
      noContentLinks: noContentLinks.length,
    },
    missingAdSlot: missingAdSlot.map((page) => page.path),
    missingReturnPath: missingReturnPath.map((page) => page.path),
    thinContent: thinContent.map((page) => page.path),
    noContentLinks: noContentLinks.map((page) => page.path),
  };
}

// 오퍼 링크 규칙(상품이 있을 때). 광고만 모델에서는 쓰지 않는다.
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
  // 사이트 전체 결함(광고 슬롯이 없음 같은 것)이 개별 경로보다 먼저다.
  // 그 다음엔 돈이 걸린 단계가 뒤에 갈수록, 같은 단계면 읽힌 사람이 많은 쪽이 먼저다.
  open.sort(
    (a, b) =>
      (b.scope === 'site' ? 1 : 0) - (a.scope === 'site' ? 1 : 0) ||
      (b.revenueImpact ?? 0) - (a.revenueImpact ?? 0) ||
      a.target.localeCompare(b.target),
  );
  return { open, closed };
}

// 측정 결과(있으면)를 읽는다. 없으면 돈 경로 판정은 하지 않는다.
export async function loadMetrics() {
  try {
    return JSON.parse(await fs.readFile(METRICS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// 이미 읽혔지만 돈으로 가는 단계에 도달하지 못한 경로. 조회 3회 미만은 누수가 아니라 대기 항목이다.
export function revenueFindings(metrics, options = {}) {
  if (!metrics?.pages?.length) return { findings: [], watch: [] };
  const findings = [];
  const watch = [];
  for (const page of metrics.pages) {
    const finding = pathFinding(page, undefined, options);
    if (finding) findings.push(finding);
    const waiting = pathWatch(page, undefined, options);
    if (waiting) watch.push(waiting);
  }
  return { findings, watch };
}

// 광고만 모델의 누수. 돈이 걸린 것은 노출이므로 영향도는 조회 수다.
export function adsOnlyFindings(report, metrics, config) {
  const findings = [];
  const viewsByPath = new Map((metrics?.pages ?? []).map((page) => [page.path, Number(page.views) || 0]));
  const totalViews = Number(metrics?.totals?.views) || 0;
  const rules = config.contentRules ?? {};

  // 1) 사이트 전체에 광고 슬롯이 없다 → 노출 0 → 수익 0. 이게 최우선이다.
  if (report.totals.inScope > 0 && report.totals.withAdSlot === 0) {
    findings.push({
      code: 'no_ad_slots_site',
      target: '/',
      scope: 'site',
      stage: 'attention',
      revenueImpact: Math.round(totalViews * 1000) / 1000,
      reason: `광고 슬롯이 ${report.totals.inScope}개 경로 어디에도 없다 — 노출이 0 이라 광고 수익도 0 이다`,
    });
  }

  for (const page of report.pages) {
    if (page.excluded) continue;
    const views = viewsByPath.get(page.path) ?? 0;
    const impact = Math.round(views * 1000) / 1000;
    if (!page.hasAdSlot) {
      findings.push({ code: 'no_ad_slot', target: page.path, scope: 'page', stage: 'attention', revenueImpact: impact, reason: '광고 슬롯이 없어 이 페이지의 노출이 발생하지 않는다' });
    }
    if (!page.hasReturnPath) {
      findings.push({ code: 'no_return_path', target: page.path, scope: 'page', stage: 'activation', revenueImpact: impact, reason: '이메일 재방문 경로(구독 폼)가 없다 — 다시 오는 세션이 없으니 노출이 늘지 않는다' });
    }
    if (page.textLength < (rules.minTextLength ?? 0)) {
      findings.push({ code: 'thin_content', target: page.path, scope: 'page', stage: 'attention', revenueImpact: impact, reason: `본문 ${page.textLength}자 — 노출은 늘어도 사람이 머물 분량이 아니다` });
    }
    if (page.contentLinks < (rules.minContentLinks ?? 0)) {
      findings.push({ code: 'no_content_links', target: page.path, scope: 'page', stage: 'consideration', revenueImpact: impact, reason: `본문 내부 링크 ${page.contentLinks}개 — 다음 페이지로 이어지지 않아 추가 노출이 없다` });
    }
  }
  return findings;
}

export async function runSelfImprovement({ today = new Date().toISOString().slice(0, 10), dryRun = false } = {}) {
  const config = await loadConfig();
  let previous = { openFindings: [], iterations: [] };
  try {
    previous = JSON.parse(await fs.readFile(LOG_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const adsOnly = config.monetization === 'ads_only';
  const items = await liveContent();
  const report = adsOnly ? auditAdsOnly(items, config) : audit(config, items);
  const metrics = await loadMetrics();
  const revenue = revenueFindings(metrics, config);

  const findings = adsOnly
    ? [...adsOnlyFindings(report, metrics, config), ...revenue.findings]
    : [
        ...report.missingOffer.map((url) => ({ code: 'missing_offer', target: url, scope: 'page', stage: 'consideration', revenueImpact: 0 })),
        ...report.unmeasured.map((url) => ({ code: 'unmeasured_offer', target: url, scope: 'page', stage: 'consideration', revenueImpact: 0 })),
        ...revenue.findings,
      ];
  const { open, closed } = mergeFindings(previous.openFindings ?? [], findings);

  const iteration = adsOnly
    ? {
        date: today,
        pagesInScope: report.totals.inScope,
        pagesWithAdSlot: report.totals.withAdSlot,
        pagesMissingAdSlot: report.totals.missingAdSlot,
        pagesMissingReturnPath: report.totals.missingReturnPath,
        pagesThinContent: report.totals.thinContent,
        pagesNoContentLinks: report.totals.noContentLinks,
        openFindings: open.length,
        repaired: 0,
      }
    : {
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
  iteration.streak =
    last && last.openFindings === 0 && iteration.openFindings === 0 ? (last.streak ?? 1) + 1 : 1;

  const payload = {
    updatedAt: new Date().toISOString(),
    monetization: config.monetization,
    rule: adsOnly
      ? 'This site earns from ads only. A page view is an ad impression, so the money is in impressions: every page needs an ad slot, an internal link to the next page, and a return path. Ads themselves are served by WordPress.com, so the revenue step stays external.'
      : 'Every page a visitor can land on must offer a next step inside the content, and that step must be measurable.',
    dataQuality: 'Every analytics read sends the Origin of this site. The service keeps one store per site, so a request without Origin answers with another Stargate site\'s data. Views of 0 mean no data collected yet, not a defect.',
    moneyPath: metrics?.funnel?.steps ?? null,
    sufficiency: metrics?.sufficiency ?? null,
    watch: revenue.watch,
    today,
    openFindings: open,
    iterations: [...iterations.slice(-29), iteration],
  };

  if (!dryRun) {
    await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
    await fs.writeFile(LOG_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  return { report, open, closed, iteration, watch: revenue.watch, moneyPath: payload.moneyPath, sufficiency: payload.sufficiency, dryRun, logFile: LOG_FILE };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  const result = await runSelfImprovement({ dryRun });
  if (result.report.totals.inScope !== undefined && result.report.totals.withAdSlot !== undefined) {
    console.log(
      `[self-improve] ${result.report.totals.inScope} pages in scope · ${result.report.totals.withAdSlot} with an ad slot · ${result.report.totals.missingAdSlot} missing · ${result.report.totals.missingReturnPath} without a return path · ${result.report.totals.thinContent} thin · ${result.report.totals.noContentLinks} without content links`,
    );
  } else {
    console.log(
      `[self-improve] ${result.report.totals.inScope} pages in scope · ${result.report.totals.withOffer} with an offer · ${result.report.totals.missingOffer} missing · ${result.report.totals.unmeasured} unmeasured`,
    );
  }
  console.log(`[self-improve] streak ${result.iteration.streak} · open findings ${result.open.length} · watch ${result.watch.length}${dryRun ? ' · dry-run (로그 미기록)' : ''}`);
  if (result.moneyPath) {
    console.log(`[self-improve] money path: ${result.moneyPath.map((step) => `${step.id}=${step.clicks}`).join(' ')}`);
  }
  if (result.sufficiency) console.log(`[self-improve] sufficiency: ${result.sufficiency.sufficient} — ${result.sufficiency.reason}`);
  for (const item of result.open) console.log(`[self-improve] open: ${item.code} ${item.target} (stage ${item.stage ?? '-'}, impact ${item.revenueImpact ?? 0}, seen ${item.count}x)`);
  for (const item of result.watch) console.log(`[self-improve] watch: ${item.target} (${item.reason})`);
  for (const item of result.closed) console.log(`[self-improve] closed: ${item.code} ${item.target}`);
}
