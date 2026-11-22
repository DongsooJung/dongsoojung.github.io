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
