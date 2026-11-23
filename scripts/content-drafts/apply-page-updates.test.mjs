// 라이브 콘텐츠 보강 적용기 단위 테스트.
//   node --test scripts/content-drafts/apply-page-updates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBSCRIBE_PLACEHOLDER,
  applyOperations,
  describeRaw,
  extractSubscriptionsBlock,
  findBlockSpan,
  isFullyApplied,
  resolveBlocks,
  validateBlocks,
} from './apply-page-updates.mjs';
import manifest from './page-updates/2026-11-23-return-path.mjs';

const SUBSCRIBE = `<!-- wp:jetpack/subscriptions {"subscriptionType":"subscribe-block"} /-->`;

function strip(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function internalLinks(html) {
  return [...String(html).matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((href) => href.startsWith('/') || href.includes('stargatelearn.com'));
}

test('구독 블록을 원본에서 그대로 잘라 낸다 (자가 닫힘)', () => {
  const raw = `앞부분\n<!-- wp:jetpack/subscriptions {"a":1} /-->\n뒷부분`;
  assert.equal(extractSubscriptionsBlock(raw), '<!-- wp:jetpack/subscriptions {"a":1} /-->');
});

test('구독 블록을 원본에서 그대로 잘라 낸다 (페어)', () => {
  const raw = `x<!-- wp:jetpack/subscriptions {} -->inner<!-- /wp:jetpack/subscriptions -->y`;
  assert.equal(extractSubscriptionsBlock(raw), '<!-- wp:jetpack/subscriptions {} -->inner<!-- /wp:jetpack/subscriptions -->');
});

test('구독 블록이 없으면 null', () => {
  assert.equal(extractSubscriptionsBlock('<p>plain</p>'), null);
});

test('needle 을 포함한 문단 블록의 시작과 끝을 찾는다', () => {
  const raw = `<!-- wp:paragraph -->\n<p class="wp-block-paragraph">Enjoyed this one? more</p>\n<!-- /wp:paragraph -->\n`;
  const span = findBlockSpan(raw, 'Enjoyed this one?');
  assert.equal(raw.slice(span.start, span.end), '<!-- wp:paragraph -->\n<p class="wp-block-paragraph">Enjoyed this one? more</p>\n<!-- /wp:paragraph -->');
});

test('append 는 끝에 붙인다', () => {
  const { content } = applyOperations('<p>기존</p>', [{ op: 'append', blocks: '<p>추가</p>' }], SUBSCRIBE);
  assert.ok(content.startsWith('<p>기존</p>'));
  assert.ok(content.endsWith('<p>추가</p>\n'));
});

test('insertBefore 는 해당 문단 블록 바로 앞에 넣는다', () => {
  const raw = '<!-- wp:paragraph -->\n<p>Enjoyed this one? ok</p>\n<!-- /wp:paragraph -->\n';
  const { content } = applyOperations(raw, [{ op: 'insertBefore', match: 'Enjoyed this one?', blocks: '<p>연결</p>' }], SUBSCRIBE);
  assert.ok(content.indexOf('<p>연결</p>') < content.indexOf('Enjoyed this one?'));
  assert.ok(content.includes('Enjoyed this one? ok'));
});

test('본문 전체가 한 블록이면 텍스트 위치에 삽입하고 원본을 지우지 않는다', () => {
  const body = `<p>${'가'.repeat(5000)}</p>`;
  const raw = `<!-- wp:html -->\n${body}\n<!-- /wp:html -->`;
  const { content, applied } = applyOperations(raw, [{ op: 'insertBefore', match: '가', blocks: '<p>연결</p>' }], SUBSCRIBE);
  assert.equal(applied[0].fallback, 'text-insert');
  assert.ok(content.includes('가'.repeat(5000)), '원본 본문이 보존되어야 한다');
  assert.ok(content.includes('</p>'));
  assert.ok(content.includes('<p>연결</p>'));
});

test('작업마다 고유 표식이 남고, 이미 적용된 작업은 건너뛴다', () => {
  const raw = '<p>본문</p>';
  const ops = [{ op: 'append', blocks: '<p>추가</p>' }];
  const first = applyOperations(raw, ops, SUBSCRIBE, { markerBase: '2026-11-23:page:1' });
  assert.ok(first.content.includes('sl-update:2026-11-23:page:1:0'));
  assert.ok(isFullyApplied(first.content, ops, '2026-11-23:page:1'));
  assert.equal(isFullyApplied(raw, ops, '2026-11-23:page:1'), false);
  const second = applyOperations(first.content, ops, SUBSCRIBE, { markerBase: '2026-11-23:page:1' });
  assert.equal(second.applied[0].skipped, 'already-applied');
  assert.equal(second.content, first.content);
});

test('구독 자리표시자를 원본 블록으로 바꾼다', () => {
  const out = resolveBlocks(`a${SUBSCRIBE_PLACEHOLDER}b`, SUBSCRIBE);
  assert.equal(out, `a${SUBSCRIBE}b`);
});

test('구독 원본이 없으면 자리표시자 상태로 실패한다', () => {
  assert.throws(() => resolveBlocks(`a${SUBSCRIBE_PLACEHOLDER}b`, null), /구독 블록/);
});

test('위험한 태그와 속성은 막는다', () => {
  assert.throws(() => validateBlocks('<script>alert(1)</script>'), /안전하지 않은/);
  assert.throws(() => validateBlocks('<a href="javascript:alert(1)">x</a>'), /안전하지 않은/);
  assert.throws(() => validateBlocks('<img src=x onerror=alert(1)>'), /안전하지 않은/);
  assert.throws(() => validateBlocks('   '), /비어 있/);
});

test('블록 구조 요약을 낸다', () => {
  const shape = describeRaw('<!-- wp:paragraph --><p>a</p><!-- /wp:paragraph --><!-- wp:html -->x<!-- /wp:html -->');
  assert.equal(shape.blockTypes.paragraph, 1);
  assert.equal(shape.blockTypes.html, 1);
  assert.equal(shape.htmlBlockOnly, false);
});

// --- 매니페스트 자체의 검증 ---

// 2026-11-22 실측 본문 글자수(감사 기준: 1,200자 미만이면 얇은 본문으로 보고).
const CURRENT_TEXT_LENGTH = { 1: 944, 89: 273 };

test('매니페스트의 모든 대상이 고유한 표식을 갖는다', () => {
  const markers = manifest.updates.map((u) => u.idempotencyMarker);
  assert.equal(new Set(markers).size, manifest.updates.length);
});

// 실제 raw 를 흉내 내는 픽스처. 삽입 대상(match) 텍스트는 반드시 포함시킨다.
function syntheticRaw(update) {
  const anchors = (update.operations ?? [])
    .filter((op) => op.op !== 'append' && op.match)
    .map((op) => (update.kind === 'posts' ? `<p>${op.match} ok</p>` : `<h2>${op.match}</h2>`))
    .join('');
  return `<p>본문</p>${anchors}`;
}

test('매니페스트 적용 후 구독 폼(페이지)과 내부 링크가 들어간다', () => {
  for (const update of manifest.updates) {
    const { content } = applyOperations(syntheticRaw(update), update.operations, SUBSCRIBE, { markerBase: update.idempotencyMarker });
    assert.ok(content.includes(update.idempotencyMarker), `${update.label} 표식 누락`);
    if (update.kind === 'pages') {
      assert.ok(content.includes('jetpack/subscriptions'), `${update.label} 구독 블록 누락`);
      assert.ok(internalLinks(content).length > 0, `${update.label} 내부 링크 누락`);
    } else {
      // 글은 테마가 구독 폼을 붙인다(페이지만 본문에 넣는다).
      assert.ok(content.includes('<h2 class="wp-block-heading">Related practice</h2>'), `${update.label} Related practice 누락`);
      assert.ok(internalLinks(content).length >= 3, `${update.label} 내부 링크 부족`);
    }
  }
});

test('/about/ 와 /contact/ 는 보강 후 1,200자 이상이 된다', () => {
  for (const update of manifest.updates.filter((u) => u.kind === 'pages' && CURRENT_TEXT_LENGTH[u.id])) {
    const { content } = applyOperations(syntheticRaw(update), update.operations, SUBSCRIBE);
    const added = strip(content).length;
    const total = CURRENT_TEXT_LENGTH[update.id] + added;
    assert.ok(total >= 1200, `${update.label} ${total}자 — 1,200자 미만`);
  }
});

test('글 4개는 Related practice 구간을 넣는다', () => {
  const posts = manifest.updates.filter((u) => u.kind === 'posts');
  assert.equal(posts.length, 4);
  for (const update of posts) {
    const { content } = applyOperations(syntheticRaw(update), update.operations, SUBSCRIBE, { markerBase: update.idempotencyMarker });
    assert.ok(content.includes('<h2 class="wp-block-heading">Related practice</h2>'));
    assert.ok(content.includes('ok</p>'), '원본 마무리 문단을 지우면 안 된다');
    assert.ok(internalLinks(content).length >= 3);
  }
});
