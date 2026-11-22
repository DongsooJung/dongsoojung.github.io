// stargatelearn 수익 단계 모델 테스트.
//   node --test scripts/content-drafts/stargatelearn-revenue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFunnel,
  pathFinding,
  pathVerdict,
  pathWatch,
  revenuePriority,
  stageCounts,
  stageForTarget,
  sufficiency,
} from './stargatelearn-revenue.mjs';

const RULES = [
  { match: '/challenges/', stage: 'activation', priority: 10 },
  { match: '/email-subscriptions', stage: 'activation', priority: 20 },
  { match: '/problem-set/', stage: 'consideration', priority: 10 },
  { match: '/sample', stage: 'consideration', priority: 20 },
  { match: '/shop_view', stage: 'intent', priority: 30 },
  { match: '/contact/', stage: 'intent', priority: 10 },
];

test('목적지로 단계를 정한다', () => {
  assert.equal(stageForTarget('/challenges/', RULES), 'activation');
  assert.equal(stageForTarget('/problem-set/', RULES), 'consideration');
  assert.equal(stageForTarget('https://stargateedu.imweb.me/shop_view', RULES), 'intent');
  assert.equal(stageForTarget('/contact/', RULES), 'intent');
  assert.equal(stageForTarget('/nothing/here/', RULES), null);
  assert.equal(stageForTarget('', RULES), null);
  assert.equal(stageForTarget(null, RULES), null);
});

test('우선순위가 높으면 같은 목적지에서 그 단계가 이긴다', () => {
  const rules = [
    { match: '/x/', stage: 'consideration', priority: 10 },
    { match: '/x/sample', stage: 'intent', priority: 20 },
  ];
  assert.equal(stageForTarget('/x/sample', rules), 'intent');
});

test('이메일 구독 폼 제출이 activation 으로 잡힌다', () => {
  // 구독 버튼은 <a> 가 아니라 <button type="submit"> 이고 action 이 워드프레스.com 이다.
  assert.equal(stageForTarget('https://wordpress.com/email-subscriptions', RULES), 'activation');
  const counts = stageCounts(
    [{ element_label: 'form_submit', target_url: 'https://wordpress.com/email-subscriptions', clicks: 2 }],
    RULES,
  );
  assert.equal(counts.activation, 2);
  assert.equal(counts.unknownTarget, 0);
});

test('목적지가 없는 클릭은 버리지 않고 unknownTarget 으로 센다', () => {
  const counts = stageCounts(
    [
      { element_label: 'link_click', target_url: null, clicks: 3 },
      { element_label: 'link_click', target_url: '/challenges/', clicks: 1 },
    ],
    RULES,
  );
  assert.equal(counts.unknownTarget, 3);
  assert.equal(counts.activation, 1);
  assert.equal(counts.intent, 0);
  // 클릭이 있는데 stage 가 0 으로 보이지 않아야 한다.
  assert.equal(Object.values(counts.unclassifiedLabels).length, 1);
});

test('클릭은 있었지만 단계 미상이면 행동 없음으로 판정하지 않는다', () => {
  const path = { path: '/x/', kind: 'post', views: 4, clicks: 3, stageClicks: { unknownTarget: 3 } };
  assert.equal(pathVerdict(path), 'clicked-unknown');
  assert.equal(pathFinding(path), null);
  const watch = pathWatch(path);
  assert.ok(watch);
  assert.match(watch.reason, /목적지 규칙/);
});

test('조회 3회 이상이고 돈 단계가 없으면 누수다', () => {
  const path = { path: '/x/', kind: 'post', views: 5, clicks: 0, stageClicks: {} };
  const finding = pathFinding(path);
  assert.ok(finding);
  assert.equal(finding.stage, 'consideration');
  assert.ok(finding.revenueImpact > 0);
});

test('조회가 3회 미만이면 누수가 아니라 대기 항목이다', () => {
  const path = { path: '/x/', kind: 'post', views: 1, clicks: 0, stageClicks: {} };
  assert.equal(pathFinding(path), null);
  assert.ok(pathWatch(path));
});

test('구매 의도가 있으면 순위를 확정할 수 있다', () => {
  const report = { totals: { pathsWithReads: 2, revenueIntentClicks: 1 } };
  assert.equal(sufficiency(report).sufficient, true);
  const weak = { totals: { pathsWithReads: 0, revenueIntentClicks: 0 } };
  assert.equal(sufficiency(weak).sufficient, false);
});

test('돈이 걸린 단계가 뒤에 갈수록 우선순위가 높다', () => {
  const early = revenuePriority({ views: 100, stage: 'activation' });
  const late = revenuePriority({ views: 100, stage: 'intent' });
  assert.ok(late > early);
  // 읽힌 사람이 많을수록 같은 단계 안에서 먼저다.
  assert.ok(revenuePriority({ views: 10, stage: 'intent' }) > revenuePriority({ views: 1, stage: 'intent' }));
});

test('퍼널은 주문 단계를 외부로 표시하고 단계 전이를 함께 낸다', () => {
  const funnel = buildFunnel([
    { path: '/a/', views: 4, clicks: 2, revenueScore: 1, stageClicks: { activation: 2 } },
    { path: '/b/', views: 2, clicks: 1, revenueScore: 5, stageClicks: { intent: 1 } },
  ]);
  assert.equal(funnel.stageClicks.activation, 2);
  assert.equal(funnel.stageClicks.intent, 1);
  assert.equal(funnel.stageClicks.revenue, 0);
  assert.equal(funnel.steps.find((step) => step.id === 'revenue').external, true);
  assert.equal(funnel.conversion.length, 4);
});

// ── 광고만 모델 (2026-11-22 사용자 확정) ────────────────────────────────────
// 유료 상품이 없으므로 단계의 뜻이 바뀐다. 조회 = 광고 노출, 내부 이동 = 추가 노출,
// 광고 클릭 = 클릭 수익, 이메일 구독 = 재방문 노출.
const ADS_RULES = [
  { kind: 'match', match: 'wordpress.com/email-subscriptions', stage: 'activation', priority: 20 },
  { kind: 'internal', stage: 'consideration', priority: 5 },
  { kind: 'match', match: 'doubleclick.net', stage: 'intent', priority: 30 },
];
const ADS_OPTIONS = { siteOrigin: 'https://stargatelearn.com', monetization: 'ads_only' };

test('광고만 모델에서 내부 이동은 추가 노출(consideration) 이다', () => {
  assert.equal(stageForTarget('/2026/11/17/digit-sums/', ADS_RULES, ADS_OPTIONS), 'consideration');
  // 같은 사이트의 절대 URL 도 내부로 본다(www 유무에 상관없이).
  assert.equal(
    stageForTarget('https://www.stargatelearn.com/challenges/', ADS_RULES, ADS_OPTIONS),
    'consideration',
  );
  assert.equal(
    stageForTarget('https://stargatelearn.com/challenges/', ADS_RULES, ADS_OPTIONS),
    'consideration',
  );
});

test('광고만 모델에서 이메일 구독은 재방문(activation) 이다', () => {
  const counts = stageCounts(
    [{ element_label: 'form_submit', target_url: 'https://wordpress.com/email-subscriptions', clicks: 1 }],
    ADS_RULES,
    ADS_OPTIONS,
  );
  assert.equal(counts.activation, 1);
  assert.equal(counts.consideration, 0);
});

test('광고 클릭은 목적지가 아니라 라벨로 intent 가 된다', () => {
  // 광고 클릭의 목적지는 광고주 페이지라 아무 도메인이나 가능하다.
  const counts = stageCounts(
    [{ element_label: 'ad_click', target_url: 'https://some-advertiser.example/landing', clicks: 2 }],
    ADS_RULES,
    ADS_OPTIONS,
  );
  assert.equal(counts.intent, 2);
  assert.equal(counts.unknownTarget, 0);
});

test('광고만 모델에서 순위의 기준은 노출이므로 조회가 모자라면 확정하지 않는다', () => {
  const thin = { totals: { views: 3, pathsWithReads: 0 } };
  const thinResult = sufficiency(thin, ADS_OPTIONS);
  assert.equal(thinResult.sufficient, false);
  assert.match(thinResult.reason, /노출/);
  const enough = { totals: { views: 120, pathsWithReads: 4 } };
  assert.equal(sufficiency(enough, ADS_OPTIONS).sufficient, true);
});

test('광고만 모델에서 구독만 하고 더 안 내려간 경로는 session_stalled_after_subscribe 다', () => {
  const path = { path: '/challenges/', kind: 'page', views: 5, clicks: 1, stageClicks: { activation: 1 } };
  const finding = pathFinding(path, undefined, ADS_OPTIONS);
  assert.ok(finding);
  assert.equal(finding.code, 'session_stalled_after_subscribe');
  // 영향도는 조회 수(잃고 있는 노출)다.
  assert.equal(finding.revenueImpact, 5);
});

test('광고만 모델에서 조회만 있고 내부 이동이 없으면 session_not_deepened 다', () => {
  const path = { path: '/x/', kind: 'post', views: 9, clicks: 0, stageClicks: {} };
  const finding = pathFinding(path, undefined, ADS_OPTIONS);
  assert.ok(finding);
  assert.equal(finding.code, 'session_not_deepened');
  assert.equal(finding.revenueImpact, 9);
});

test('퍼널 단계 이름은 사이트 설정에서 온다', () => {
  const funnel = buildFunnel(
    [{ path: '/a/', views: 4, clicks: 1, revenueScore: 1, stageClicks: { consideration: 1 } }],
    { stageLabels: { consideration: '내부 이동(추가 노출)' } },
  );
  assert.equal(funnel.steps.find((step) => step.id === 'consideration').label, '내부 이동(추가 노출)');
});
