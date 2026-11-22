// stargatelearn.com 수익 단계 모델.
//
// 트래픽이 기준이 아니다. 이 사이트의 돈 경로는 고정되어 있다.
//
//   read -> free challenge -> paid offer considered -> checkout or enquiry -> order
//
// 주문은 스토어·이메일에서 일어나므로 마지막 단계는 external 로만 표시하고 이 사이트의
// 결과로 세지 않는다. stargatekorea.net 의 scripts/revenue.mjs 와 같은 단계·가중치·판정 규칙을
// 쓰되, 이 사이트는 클릭 라벨이 하나뿐('link_click')이라 목적지(target_url)로 단계를 정한다.
//
// 모델은 순수하다. 수치를 읽어 수치를 돌려주므로 측정·감사·테스트가 같은 규칙을 쓴다.

// A stage is a place on the money path. The weight is how much money is at stake
// when a visitor is stopped there. Reading is worth nothing on its own.
export const STAGES = [
  { id: 'attention', order: 0, label: '읽음', weight: 0, revenue: false, external: false },
  { id: 'activation', order: 1, label: '무료 챌린지 진입', weight: 1, revenue: false, external: false },
  { id: 'consideration', order: 2, label: '유료 오퍼 확인', weight: 3, revenue: true, external: false },
  { id: 'intent', order: 3, label: '구매 의도', weight: 5, revenue: true, external: false },
  { id: 'revenue', order: 4, label: '주문 완료', weight: 10, revenue: true, external: true },
];

export const STAGE_IDS = STAGES.map((stage) => stage.id);
export const REVENUE_CHAIN = ['activation', 'consideration', 'intent', 'revenue'];

const BY_ID = new Map(STAGES.map((stage) => [stage.id, stage]));

export function stage(id) {
  return BY_ID.get(id) ?? null;
}
export function stageWeight(id) {
  return stage(id)?.weight ?? 0;
}
export function stageOrder(id) {
  return stage(id)?.order ?? -1;
}

// Reads are attention. They are not part of the money chain.
export const ATTENTION_LABEL = 'page_view';
export const CLICK_LABEL = 'link_click';

export function classifyLabel(label) {
  if (label === ATTENTION_LABEL) return 'attention';
  if (label === CLICK_LABEL) return null; // 목적지로 정한다
  return null;
}

// 목적지 → 단계. 규칙은 stargatelearn-offers.json 의 targets 에 있다.
// 같은 사이트 안의 링크는 상대 경로, 다른 사이트는 origin+path 로 온다.
export function stageForTarget(target, rules = []) {
  if (!target) return null;
  const value = String(target).toLowerCase();
  let best = null;
  for (const rule of rules) {
    const needle = String(rule.match ?? '').toLowerCase();
    if (!needle) continue;
    if (!value.includes(needle)) continue;
    if (!best || rule.priority > best.priority) best = rule;
  }
  return best?.stage ?? null;
}

// A click nobody classified is not dropped: it is counted as unknown, so a new
// label or a new destination cannot quietly disappear from the report.
//
// target_url 은 null 일 수 있다(mailto:, #, 링크가 아닌 버튼). 목적지 모델에서는
// 목적지가 없어도 클릭 자체는 있었던 사실이 남아야 한다. 그래서 분류되지 않은 클릭은
// unknownTarget 버킷으로 센다. 클릭은 있었는데 stage 만 0 으로 보이면 "클릭 0"으로 오판하기 때문이다.
//
// 참고: mailto: 링크는 워커가 400 으로 거절하므로 아예 이벤트를 보내지 않는다.
// 문의 단계는 http(s) 링크(연락 페이지 등)로만 측정된다.
export function stageCounts(clicks = [], rules = []) {
  const counts = Object.fromEntries(STAGE_IDS.map((id) => [id, 0]));
  counts.unknownTarget = 0;
  counts.unclassified = 0;
  const unknown = {};
  for (const row of clicks) {
    const count = Number(row.clicks) || 0;
    if (!count) continue;
    const label = row.element_label || row.label || '(unlabeled)';
    const target = row.target_url ?? row.target ?? '';
    const byLabel = classifyLabel(label);
    const byTarget = stageForTarget(target, rules);
    const id = byTarget ?? byLabel;
    if (!id) {
      counts.unknownTarget += count;
      counts.unclassified += count;
      const key = label + (target ? ` → ${target}` : ' (목적지 없음)');
      unknown[key] = (unknown[key] ?? 0) + count;
      continue;
    }
    counts[id] += count;
  }
  counts.unknownTargetLabels = unknown;
  counts.unclassifiedLabels = unknown;
  return counts;
}

// The money distance of a path. Purchase intent is weighted highest, so a single
// checkout click outweighs several reads. The result is an intent score, not a
// turnover figure: the completed order happens outside this site.
export function revenueScore(clicks = [], rules = []) {
  let score = 0;
  for (const row of clicks) {
    const count = Number(row.clicks) || 0;
    if (!count) continue;
    const id = stageForTarget(row.target_url ?? row.target ?? '', rules) ?? classifyLabel(row.element_label ?? row.label ?? '');
    if (!id) continue;
    score += count * stageWeight(id);
  }
  return Math.round(score * 100) / 100;
}

// The furthest step on the money path that this path actually reached.
export function topStage(counts = {}) {
  let best = null;
  for (const id of STAGE_IDS) {
    if (!counts[id]) continue;
    if (!best || stageOrder(id) > stageOrder(best)) best = id;
  }
  return best;
}

// How much money is at stake in a fix. A finding at a later stage always outranks
// an earlier one, and among equal stages the page with more readers wins. The
// logarithm keeps a page with no readers at the end of the list instead of
// dropping it, so a fix is never hidden just because the traffic is not there yet.
export function revenuePriority({ views = 0, stage: stageId = 'attention' } = {}) {
  const reach = 1 + Math.log10(1 + Math.max(0, Number(views) || 0));
  return Math.round(stageWeight(stageId) * reach * 1000) / 1000;
}

// Where a path stands on the money path, read from the clicks it produced.
export function pathVerdict(path) {
  const counts = path.stageClicks ?? {};
  const views = Number(path.views) || 0;
  const clicks = Number(path.clicks) || 0;
  if (!views && !clicks) return 'no-data';
  if (counts.intent > 0) return 'intent';
  if (counts.consideration > 0) return 'consideration';
  if (counts.activation > 0) return 'activated';
  // 클릭은 있었지만 목적지 규칙에 걸리지 않아 단계를 모른다. "행동 없음"이 아니다.
  if (clicks > 0 && (counts.unknownTarget ?? 0) > 0) return 'clicked-unknown';
  if (clicks > 0) return 'reading';
  return 'read-not-acting';
}

// The step a path failed to reach. Everything below consideration is free.
export function moneyStep(path) {
  const counts = path.stageClicks ?? {};
  if (counts.intent > 0) return 'intent';
  if (counts.consideration > 0) return 'consideration';
  if (counts.activation > 0) return 'activation';
  return 'attention';
}

// How many reads are needed before a page is judged. One visit is a coincidence,
// several visits are a pattern.
export const MIN_VIEWS = 3;

// What the revenue rule says about one measured path.
//
//   activated      the free challenge was used and the paid offer was never looked at
//   read-not-acting / reading   the page was read and produced no money step
//
// A page with too few reads is not a defect. It is listed as a watch item so it is
// visible without sending the loop into work on a single visit.
export function pathFinding(path, minViews = MIN_VIEWS) {
  const verdict = path.verdict ?? pathVerdict(path);
  const views = Number(path.views) || 0;
  const counts = path.stageClicks ?? {};
  const base = {
    target: path.path,
    kind: path.kind,
    views,
    stage: 'consideration',
    revenueImpact: revenuePriority({ views, stage: 'consideration' }),
  };
  if (verdict === 'intent' || verdict === 'consideration') return null;
  if (verdict === 'no-data') return null;
  // 단계 미상 클릭은 콘텐츠 문제가 아니라 목적지 규칙 문제다. 순위에 섞지 않고 대기 항목으로 둔다.
  if (verdict === 'clicked-unknown') return null;
  if (verdict === 'activated') {
    return { code: 'revenue_stalled_after_free', ...base, stage: 'consideration', activationClicks: counts.activation ?? 0 };
  }
  if (views >= minViews) {
    return { code: path.kind === 'funnel' ? 'revenue_no_intent' : 'guide_read_not_acting', ...base };
  }
  return null;
}

// The paths that were read but not judged yet. They are reported, not acted on.
export function pathWatch(path, minViews = MIN_VIEWS) {
  const verdict = path.verdict ?? pathVerdict(path);
  const views = Number(path.views) || 0;
  const counts = path.stageClicks ?? {};
  if (verdict === 'no-data' || verdict === 'intent' || verdict === 'consideration') return null;
  if (verdict === 'activated') return null;
  if (verdict === 'clicked-unknown') {
    return { target: path.path, kind: path.kind, views, stage: 'attention', reason: `클릭 ${counts.unknownTarget ?? 0}건의 목적지가 규칙에 없어 단계 미상 — 목적지 규칙 보완 필요` };
  }
  if (views >= minViews) return null;
  return { target: path.path, kind: path.kind, views, stage: 'consideration', reason: `fewer than ${minViews} reads` };
}

// The whole site seen as one funnel. The order step is external, so it stays empty
// and is reported as such instead of being filled with a guess.
export function buildFunnel(paths = []) {
  const stageClicks = Object.fromEntries(STAGE_IDS.map((id) => [id, 0]));
  let views = 0;
  let clicks = 0;
  let score = 0;
  let unknownTarget = 0;
  for (const path of paths) {
    views += Number(path.views) || 0;
    clicks += Number(path.clicks) || 0;
    score += Number(path.revenueScore) || 0;
    const counts = path.stageClicks ?? {};
    for (const id of STAGE_IDS) stageClicks[id] += Number(counts[id]) || 0;
    unknownTarget += Number(counts.unknownTarget) || 0;
  }
  const steps = STAGES.map((item) => ({
    id: item.id,
    label: item.label,
    clicks: stageClicks[item.id],
    weight: item.weight,
    external: item.external,
  }));
  const conversion = [];
  for (let index = 1; index < steps.length; index += 1) {
    const from = steps[index - 1];
    const to = steps[index];
    conversion.push({
      from: from.id,
      to: to.id,
      ratio: from.clicks > 0 ? Math.round((to.clicks / from.clicks) * 1000) / 1000 : null,
    });
  }
  // unknownTarget 은 돈 경로의 한 단계가 아니다. 클릭은 있었지만 단계를 모르는 건을 따로 세어
  // "stage 가 0"과 "클릭이 0"을 구분할 수 있게 한다.
  return { views, clicks, revenueScore: Math.round(score * 100) / 100, stageClicks, unknownTarget, steps, conversion };
}

// Whether the collected data can rank anything at all. When it cannot, the reason
// is written down instead of an empty ranking being presented as a result.
export function sufficiency(report) {
  const totals = report?.totals ?? {};
  if (!totals.pathsWithReads) {
    return {
      sufficient: false,
      reason: `No path has been read ${MIN_VIEWS} times or more in the window, and no purchase intent has been recorded. The rule is in place, but the ranking cannot be settled from the data yet.`,
    };
  }
  if (!totals.revenueIntentClicks) {
    return {
      sufficient: true,
      reason: `Paths have been read ${MIN_VIEWS} times or more, but no click has reached a paid offer yet. The ranking is driven by the revenue rule and the next step of the funnel.`,
    };
  }
  return { sufficient: true, reason: 'Purchase intent has been recorded, so the ranking is driven by measured money steps.' };
}
