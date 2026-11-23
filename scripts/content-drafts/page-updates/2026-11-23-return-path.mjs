// stargatelearn.com 라이브 콘텐츠 보강 — 2026-11-23
//
// 광고만 모델 감사(2026-11-22)가 낸 3가지 결손을 메운다.
//   1) 재방문 경로(이메일 구독 폼) 없음: / · /about/ · /contact/
//   2) 본문 내부 링크 0: /about/ + 최신 글 4개(11/16~11/22)
//   3) 얇은 본문(1,200자 미만): /contact/ 273자 · /about/ 944자
//
// 사실 규칙: 사이트에 이미 있는 내용(챌린지 목록의 제목·설명, About 의 저자 소개,
// Contact 의 문구)만 쓴다. 새로 확인하지 못한 수치·연도·약속은 넣지 않는다.
//
// 구독 블록은 /challenges/ 에 이미 있는 원본 블록을 그대로 복사한다({{SUBSCRIBE}}).

const subscribeLead = `<!-- wp:paragraph -->
<p class="wp-block-paragraph">New challenges are added every week. Subscribe to get each one by email.</p>
<!-- /wp:paragraph -->

{{SUBSCRIBE}}`;

const newestChallenges = `<!-- wp:heading -->
<h2 class="wp-block-heading">Newest challenges</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li><a href="https://stargatelearn.com/2026/11/22/convex-quadrilaterals-3x3-pegboard/"><strong>Rubber Bands on a Pegboard</strong></a> — count every choice of four pegs, then remove the ones that do not make a convex quadrilateral.</li>

<li><a href="https://stargatelearn.com/2026/11/21/counting-colorings-up-to-rotation/"><strong>Spin It and Count Again</strong></a> — coloring problems where rotations look the same, and why simply dividing by the number of rotations fails.</li>

<li><a href="https://stargatelearn.com/2026/11/18/multiply-and-subtract-geometric-sequence-sums/"><strong>Multiply and Subtract</strong></a> — Algebra, Level 2. Multiply the sum by the ratio, subtract, and the middle cancels.</li>

<li><a href="https://stargatelearn.com/2026/11/17/center-the-sequence-symmetric-terms/"><strong>Center the Sequence</strong></a> — Algebra, Level 2. Name the middle term first and arithmetic and geometric sequence problems simplify.</li>

<li><a href="https://stargatelearn.com/2026/11/20/how-to-start-math-olympiad-preparation/"><strong>How to Start Preparing for Math Olympiads in Grade 5–6</strong></a> — a starting point for students who have not met olympiad problems yet.</li>
</ul>
<!-- /wp:list -->`;

const aboutSections = `<!-- wp:heading -->
<h2 class="wp-block-heading">What each challenge contains</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p class="wp-block-paragraph">Every set is built the same way: the problem, three guided hints, a full written solution, and practice problems with answers. Level 1 sets can be solved with arithmetic alone. Level 2 sets ask for a written argument, which is the part olympiad graders actually read. Topics rotate between number theory, combinatorics, geometry, algebra and invariants.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">How to start</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li>Never met an olympiad problem? Read <a href="https://stargatelearn.com/2026/11/20/how-to-start-math-olympiad-preparation/">How to Start Preparing for Math Olympiads in Grade 5–6</a> first.</li>

<li>Ready to solve? Work through the sets in order on the <a href="https://stargatelearn.com/challenges/">challenge list</a>, starting with <a href="https://stargatelearn.com/2026/11/14/divisors-and-multiples-challenge/">Divisors &amp; Multiples</a>.</li>

<li>Prefer combinatorics? Try <a href="https://stargatelearn.com/2026/11/16/complementary-counting-flag-rows/">Count What You Don’t Want</a>, then <a href="https://stargatelearn.com/2026/11/17/pigeonhole-principle/">The Pigeonhole Principle</a>.</li>

<li>Stuck on one step? <a href="https://stargatelearn.com/contact/">Tell us which step you got stuck on</a>.</li>
</ul>
<!-- /wp:list -->`;

const contactSections = `<!-- wp:heading -->
<h2 class="wp-block-heading">What to include in your message</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p class="wp-block-paragraph">Tell us which challenge you are working on — the title is enough — the student's grade or level, and the exact step where the reasoning stopped. A photo of the written work helps more than a description of it. If you are working through a set in order, say which number you are on.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Using the problems in class</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p class="wp-block-paragraph">The problems are free to use in class. Each set fits a single lesson warm-up, and the solutions model the written explanations that olympiad graders expect. Say the topic and the level in your message if you want a suggestion about the order that works best for your class.</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p class="wp-block-paragraph">Prefer email to the form? Write to <a href="mailto:ceo@stargateedu.co.kr">ceo@stargateedu.co.kr</a>. Before you write, it is worth checking whether the same idea already has a full solution in the <a href="https://stargatelearn.com/challenges/">challenge list</a>.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Who answers</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p class="wp-block-paragraph">Stargate Learn is written by Dongsoo Jung, who teaches competition math and the Korea Olympiad in Informatics in Seoul. His background is on the <a href="https://stargatelearn.com/about/">About page</a>.</p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading">Not ready to write?</h2>
<!-- /wp:heading -->`;

const relatedFlagRows = `<!-- wp:heading -->
<h2 class="wp-block-heading">Related practice</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li><a href="https://stargatelearn.com/2026/11/14/counting-paths/"><strong>Counting Grid Paths Without Double-Counting</strong></a> — the same subtract-the-failures idea, with forbidden points and inclusion–exclusion.</li>

<li><a href="https://stargatelearn.com/2026/11/21/counting-colorings-up-to-rotation/"><strong>Spin It and Count Again</strong></a> — when two different arrangements look the same, counting needs a different trick.</li>

<li><a href="https://stargatelearn.com/2026/11/17/counting-handshakes/"><strong>Counting Handshakes</strong></a> — small cases first, then a formula and a pigeonhole proof.</li>
</ul>
<!-- /wp:list -->`;

const relatedPrimeFactors = `<!-- wp:heading -->
<h2 class="wp-block-heading">Related practice</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li><a href="https://stargatelearn.com/2026/11/14/divisors-and-multiples-challenge/"><strong>Divisors &amp; Multiples</strong></a> — Number theory, Level 1. Count divisors, use gcd × lcm, and prove a number is the smallest.</li>

<li><a href="https://stargatelearn.com/2026/11/17/digit-sums/"><strong>Digit Sums and Divisibility by 9</strong></a> — Number theory, Level 1. Why the 9-test works, missing digits, and the smallest number with a given digit sum.</li>

<li><a href="https://stargatelearn.com/2026/11/14/remainders/"><strong>Remainders: Find the Pattern, Then Prove It</strong></a> — Number theory, Level 1. Last digits, two remainder conditions, and why squares avoid 2 mod 4.</li>
</ul>
<!-- /wp:list -->`;

const relatedColorings = `<!-- wp:heading -->
<h2 class="wp-block-heading">Related practice</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li><a href="https://stargatelearn.com/2026/11/16/complementary-counting-flag-rows/"><strong>Count What You Don’t Want</strong></a> — count everything, then subtract the few cases that fail.</li>

<li><a href="https://stargatelearn.com/2026/11/17/pigeonhole-principle/"><strong>The Pigeonhole Principle</strong></a> — guarantee a coincidence without finding it: months, sums, points and remainders.</li>

<li><a href="https://stargatelearn.com/2026/11/14/counting-paths/"><strong>Counting Grid Paths Without Double-Counting</strong></a> — binomial coefficients, forbidden points and inclusion–exclusion.</li>
</ul>
<!-- /wp:list -->`;

const relatedPegboard = `<!-- wp:heading -->
<h2 class="wp-block-heading">Related practice</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li><a href="https://stargatelearn.com/2026/11/14/area-ratios/"><strong>Area Ratios: Read the Diagram Without Measuring</strong></a> — Geometry, Level 2. Same height, different bases: area ratios with no ruler.</li>

<li><a href="https://stargatelearn.com/2026/11/17/rectangles-in-a-grid/"><strong>How Many Rectangles Are in a Grid?</strong></a> — Combinatorics, Level 1. Choose two vertical and two horizontal lines and the count becomes one multiplication.</li>

<li><a href="https://stargatelearn.com/2026/11/17/angle-chasing-problems/"><strong>Angle Chasing for Middle School</strong></a> — Geometry, Level 2. Four trusted facts, step-by-step reasons, and a proof about angle bisectors.</li>
</ul>
<!-- /wp:list -->`;

const relatedGridRoutes = `<!-- wp:heading -->
<h2 class="wp-block-heading">Related practice</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
<li><a href="https://stargatelearn.com/2026/11/14/counting-paths/"><strong>Counting Grid Paths Without Double-Counting</strong></a> — Combinatorics, Level 2. Binomial coefficients, forbidden points and inclusion–exclusion.</li>

<li><a href="https://stargatelearn.com/2026/11/17/rectangles-in-a-grid/"><strong>How Many Rectangles Are in a Grid?</strong></a> — Combinatorics, Level 1. Choose two vertical and two horizontal lines and the count becomes one multiplication.</li>

<li><a href="https://stargatelearn.com/2026/11/17/counting-handshakes/"><strong>Counting Handshakes</strong></a> — Combinatorics, Level 2. n(n − 1)/2 from small cases, tournaments, and a pigeonhole proof about handshakes.</li>
</ul>
<!-- /wp:list -->`;

export default {
  updatedAt: '2026-11-23',
  note: '광고만 모델 감사 결함 보강 — 재방문 경로 3곳 · 내부 링크 0인 5곳 · 얇은 본문 2곳',
  subscribeSource: { kind: 'pages', id: 42, why: '/challenges/ 에 이미 있는 구독 폼 블록 원본' },
  updates: [
    {
      kind: 'pages',
      id: 9,
      label: 'home (/)',
      idempotencyMarker: '2026-11-23:page:9',
      operations: [
        { op: 'append', blocks: `${newestChallenges}\n\n${subscribeLead}` },
      ],
    },
    {
      kind: 'pages',
      id: 1,
      label: 'about (/about/)',
      idempotencyMarker: '2026-11-23:page:1',
      operations: [
        { op: 'insertBefore', match: 'Contact</h2>', blocks: aboutSections },
        { op: 'append', blocks: subscribeLead },
      ],
    },
    {
      kind: 'pages',
      id: 89,
      label: 'contact (/contact/)',
      idempotencyMarker: '2026-11-23:page:89',
      operations: [
        { op: 'append', blocks: `${contactSections}\n\n${subscribeLead}` },
      ],
    },
    {
      kind: 'posts',
      id: 29,
      label: 'flag rows (11/16)',
      idempotencyMarker: '2026-11-23:post:29',
      operations: [{ op: 'insertBefore', match: 'Enjoyed this one? Explore more olympiad-style problems', blocks: relatedFlagRows }],
    },
    {
      kind: 'posts',
      id: 32,
      label: 'multiples of 12 (11/17)',
      idempotencyMarker: '2026-11-23:post:32',
      operations: [{ op: 'insertBefore', match: 'Enjoyed this? Explore more olympiad-style problems', blocks: relatedPrimeFactors }],
    },
    {
      kind: 'posts',
      id: 87,
      label: 'colorings up to rotation (11/21)',
      idempotencyMarker: '2026-11-23:post:87',
      operations: [{ op: 'insertBefore', match: 'Enjoyed this? Explore more olympiad-style problems', blocks: relatedColorings }],
    },
    {
      kind: 'posts',
      id: 93,
      label: 'convex quadrilaterals pegboard (11/22)',
      idempotencyMarker: '2026-11-23:post:93',
      operations: [{ op: 'insertBefore', match: 'Enjoyed this one? Explore more olympiad-style problems', blocks: relatedPegboard }],
    },
    {
      kind: 'posts',
      id: 98,
      label: 'grid routes diagonal moves (11/23)',
      idempotencyMarker: '2026-11-23:post:98',
      operations: [{ op: 'insertBefore', match: 'Enjoyed this one? Explore more olympiad-style problems', blocks: relatedGridRoutes }],
    },
  ],
};
