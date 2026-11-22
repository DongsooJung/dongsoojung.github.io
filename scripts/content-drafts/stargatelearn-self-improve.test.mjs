// stargatelearn 감사(광고만 모델) 테스트.
//   node --test scripts/content-drafts/stargatelearn-self-improve.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditAdsOnly,
  countContentLinks,
  stripMeasurementBlock,
  stripText,
} from './stargatelearn-self-improve.mjs';

const CONFIG = {
  siteOrigin: 'https://stargatelearn.com',
  excluded: ['/privacy-policy/'],
  contentRules: {
    adSlotMarkers: ['id="w-a-', 'data-ad-client="', 'data-ad-slot="', 'wpcom-ads', 'adsbygoogle', 'w-ads'],
    returnPathMarkers: ['id="subscribe-blog"', 'email-subscriptions'],
    minContentLinks: 1,
    minTextLength: 1200,
  },
};

// 실제로 라이브에 올라가 있는 측정 스니펫의 광고 선택자 코드(조각으로 붙여 문자열을 숨긴 형태).
const LIVE_SNIPPET_SELECTOR =
  '<script>var S=[\'.w-\' + \'ads\',\'ins.\' + \'adsby\' + \'google\',\'[data-\' + \'ad-client]\',\'[data-\' + \'ad-slot]\'].join(\', \');</script>';

const item = (path, content, pageHtml = '') => ({ path, kind: 'post', html: content, pageHtml });

test('광고 슬롯 표시는 렌더된 광고 마크업으로만 판정한다', () => {
  const report = auditAdsOnly(
    [item('/a/', '<p>본문</p>', '<div id="w-a-123"><ins class="adsbygoogle" data-ad-client="ca-pub-1"></ins></div>')],
    CONFIG,
  );
  assert.equal(report.totals.withAdSlot, 1);
  assert.equal(report.totals.missingAdSlot, 0);
});

test('측정 코드 안의 광고 선택자 문자열로 자기검출하지 않는다', () => {
  // 측정 스니펫에는 광고 선택자가 들어 있다. 이 문자열이 그대로 페이지에 남으면
  // "광고 슬롯 있음"으로 잘못 판정되므로 조각으로 숨기고 검사에서 measurement 영역을 뺀다.
  const wrapped = `<!-- stargatelearn:measure:start -->${LIVE_SNIPPET_SELECTOR}<!-- stargatelearn:measure:end -->`;
  const report = auditAdsOnly([item('/a/', '<p>본문</p>', wrapped)], CONFIG);
  assert.equal(report.totals.withAdSlot, 0);
  assert.equal(report.totals.missingAdSlot, 1);
});

test('측정 스니펫은 광고 표식 문자열을 페이지에 남기지 않는다', () => {
  for (const marker of ['adsbygoogle', 'w-ads', 'data-ad-client', 'data-ad-slot']) {
    assert.ok(!LIVE_SNIPPET_SELECTOR.includes(marker), `측정 스니펫에 "${marker}" 가 그대로 있다`);
  }
});

test('측정 영역을 빼는 규칙이 동작한다', () => {
  const html = '<p>앞</p><!-- stargatelearn:measure:start -->SECRET<!-- stargatelearn:measure:end --><p>뒤</p>';
  const cleaned = stripMeasurementBlock(html);
  assert.ok(!cleaned.includes('SECRET'));
  assert.ok(cleaned.includes('앞'));
  assert.ok(cleaned.includes('뒤'));
});

test('구독 폼(재방문 경로)이 없는 페이지를 잡는다', () => {
  const report = auditAdsOnly(
    [
      item('/with/', '<p>본문</p>', '<form id="subscribe-blog" action="https://wordpress.com/email-subscriptions"></form>'),
      item('/without/', '<p>본문</p>', '<p>폼 없음</p>'),
    ],
    CONFIG,
  );
  assert.equal(report.totals.missingReturnPath, 1);
  assert.deepEqual(report.missingReturnPath, ['/without/']);
});

test('본문 내부 링크는 절대 URL 로도 센다', () => {
  const html = '<a href="https://stargatelearn.com/challenges/">A</a><a href="/about/">B</a><a href="https://other.example/">C</a>';
  assert.equal(countContentLinks(html, 'https://stargatelearn.com'), 2);
});

test('얇은 본문을 잡는다', () => {
  const report = auditAdsOnly(
    [
      item('/thin/', '<p>짧다</p>', ''),
      item('/ok/', `<p>${'가'.repeat(1500)}</p>`, ''),
    ],
    CONFIG,
  );
  assert.equal(report.totals.thinContent, 1);
  assert.deepEqual(report.thinContent, ['/thin/']);
});

test('제외 경로(법무 페이지)는 검사 대상이 아니다', () => {
  const report = auditAdsOnly([item('/privacy-policy/', '<p>본문</p>', '<p>폼 없음</p>')], CONFIG);
  assert.equal(report.totals.inScope, 0);
  assert.equal(report.totals.missingReturnPath, 0);
});

test('태그를 벗긴 텍스트 길이를 센다', () => {
  assert.equal(stripText('<p>가나다</p><script>x</script>').length, 3);
});
