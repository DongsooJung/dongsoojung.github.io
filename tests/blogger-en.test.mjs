import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const { ingestPlanMarkdown, mergeConfig, parseFrontmatter, isPlaceholderText } = await import('../blogger-en/lib/plan-ingest.mjs');
const { isEnglishTitle, scoreTopic, selectTopics } = await import('../blogger-en/lib/topics.mjs');
const { buildDraft, countWords } = await import('../blogger-en/lib/draft.mjs');
const { approveDraft, canPublish, evaluateDraft } = await import('../blogger-en/lib/review-gate.mjs');
const { buildPublishRequest, htmlFromMarkdown, toBloggerPost } = await import('../blogger-en/lib/blogger-api.mjs');
const { toSlug, metaDescription } = await import('../blogger-en/lib/seo.mjs');
const { seedTopicsFromCustomers } = await import('../blogger-en/lib/seeds.mjs');

const sampleTrends = JSON.parse(
  await fs.readFile(path.join(repoRoot, 'blogger-en/fixtures/sample-trends.json'), 'utf8'),
);
const samplePlan = await fs.readFile(path.join(repoRoot, 'blogger-en/fixtures/sample-plan.md'), 'utf8');
const emptyPlan = await fs.readFile(path.join(repoRoot, 'blogger-en/fixtures/empty-plan.md'), 'utf8');
const livePlan = await fs.readFile(path.join(repoRoot, 'blogger-en/PLAN.md'), 'utf8');
const baseConfig = JSON.parse(
  await fs.readFile(path.join(repoRoot, 'blogger-en/config.json'), 'utf8'),
);
const financeConfig = mergeConfig(baseConfig, ingestPlanMarkdown(samplePlan));

test('empty plan fixture stays in awaiting_plan', () => {
  const overlay = ingestPlanMarkdown(emptyPlan);
  assert.equal(overlay.status, 'awaiting_plan');
  assert.equal(overlay.filledSectionCount, 0);
  assert.equal(isPlaceholderText('(대기)'), true);
});

test('live PLAN.md is the 2026 Korea visitor only', () => {
  const overlay = ingestPlanMarkdown(livePlan);
  const config = mergeConfig(baseConfig, overlay);
  assert.equal(overlay.status, 'plan_ready');
  assert.equal(config.customers.length, 3);
  assert.ok(config.customers.every((customer) => /2026/.test(customer.name)));
  assert.ok(config.customers[0].intents.some((intent) => /k-eta/i.test(intent)));
  assert.equal(config.customers.some((customer) => customer.id.includes('401k')), false);
});

test('sample plan fills customers, not author niches', () => {
  const overlay = ingestPlanMarkdown(samplePlan);
  const config = mergeConfig(baseConfig, overlay);
  assert.equal(overlay.status, 'plan_ready');
  assert.ok(overlay.filledSectionCount >= 6);
  assert.equal(config.blog.id, '1234567890');
  assert.equal(config.blog.url, 'https://example-global.blogspot.com');
  assert.deepEqual(config.geos, ['US', 'GB', 'IN']);
  assert.equal(config.customers.length, 4);
  assert.equal(config.customers[0].id, 'us-household-saver');
  assert.ok(config.customers[0].intents.includes('401k'));
  assert.equal(config.niches.some((item) => /retirement contribution/i.test(item)), true);
  assert.equal(config.monetization.adsense, true);
  assert.ok(config.monetization.affiliates.includes('amazon-associates'));
  assert.match(config.voice.tone, /hired by this customer/i);
});

test('frontmatter parser keeps arrays', () => {
  const { meta } = parseFrontmatter(samplePlan);
  assert.deepEqual(meta.geos, ['US', 'GB', 'IN']);
  assert.equal(meta.cadencePerWeek, 4);
});

test('English filter drops Korean, entertainment, and politics', () => {
  const selected = selectTopics(sampleTrends.items, financeConfig, 20);
  const titles = selected.map((row) => row.title);
  assert.ok(titles.includes('401k contribution limit'));
  assert.ok(titles.includes('AI study planner'));
  assert.ok(titles.includes('used GPU price'));
  assert.equal(titles.includes('과태료'), false);
  assert.equal(titles.includes('celebrity dating rumor'), false);
  assert.equal(titles.includes('election polls'), false);
  assert.equal(titles.includes('quantum computing news'), false);
  assert.equal(isEnglishTitle('과태료'), false);
  assert.equal(isEnglishTitle('AI study planner'), true);
});

test('topics without a customer match are dropped even if volume is high', () => {
  const quantum = sampleTrends.items.find((item) => item.title === 'quantum computing news');
  const scored = scoreTopic(quantum, financeConfig);
  assert.equal(scored.score, 0);
  assert.equal(scored.reason, 'no-customer-match');
  const matched = scoreTopic(sampleTrends.items[0], financeConfig);
  assert.equal(matched.customer.id, 'us-household-saver');
  assert.ok(matched.score > 0);
});

test('2026 Korea visitor matches travel jobs and drops 401k', () => {
  const korea = {
    title: 'K-ETA exemption 2026',
    volume: 41000,
    geo: 'US',
    related: ['korea e-arrival card'],
    categories: [18],
  };
  const hit = scoreTopic(korea, baseConfig);
  assert.ok(hit.score > 0);
  assert.match(hit.customer.id, /2026-trend-aware-visitor/);
  const miss = scoreTopic(sampleTrends.items[0], baseConfig);
  assert.equal(miss.score, 0);
  assert.equal(miss.reason, 'no-customer-match');
  const seeded = selectTopics(seedTopicsFromCustomers(baseConfig.customers), baseConfig, 10);
  assert.ok(seeded.some((row) => /korea|k-eta|seongsu|busan|jeju|climate/i.test(row.title)));
});

test('draft briefing is English, customer-assigned, and not publishable until filled', () => {
  const topic = selectTopics(sampleTrends.items, financeConfig, 5)[0];
  const draft = buildDraft(topic, financeConfig, { now: new Date('2026-08-28T00:00:00Z') });
  assert.match(draft.id, /^draft-20260828-/);
  assert.equal(draft.language, 'en');
  assert.equal(draft.status, 'needs_review');
  assert.equal(draft.customer.id, 'us-household-saver');
  assert.match(draft.body, /\[WRITE\]/);
  assert.match(draft.body, /Customer brief, not an author essay/);
  assert.match(draft.body, /US household saver/);
  assert.doesNotMatch(draft.body, /How this connects to/);
  assert.equal(toSlug(draft.title).length > 0, true);
  assert.match(metaDescription(topic.title, draft.customer.job), /For the searcher/);

  const blocked = evaluateDraft(draft, financeConfig);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.errors.includes('unfilled-write-blocks'));
  assert.ok(blocked.errors.includes('not-approved'));
});

test('Korea visitor draft names the 2026 landing job', () => {
  const topic = selectTopics(seedTopicsFromCustomers(baseConfig.customers), baseConfig, 5)
    .find((row) => /k-eta/i.test(row.title));
  const draft = buildDraft(topic, baseConfig, { now: new Date('2026-09-01T00:00:00Z') });
  assert.equal(draft.customer.id, '2026-trend-aware-visitor-first-48-hours');
  assert.match(draft.body, /e-Arrival Card/);
  assert.match(draft.title, /K-ETA/i);
  assert.doesNotMatch(draft.body, /401k/);
});

test('approved filled draft still cannot go live without flags', () => {
  const topic = selectTopics(sampleTrends.items, financeConfig, 5)[0];
  const overlay = ingestPlanMarkdown(samplePlan);
  const config = mergeConfig(baseConfig, overlay);
  config.review.allowLivePublish = false;
  const draft = buildDraft(topic, config, { now: new Date('2026-08-28T00:00:00Z') });
  const filled = approveDraft({
    ...draft,
    body: `${'method '.repeat(1300)}Original explanation with sources from IRS and BLS for this customer.`,
    wordCount: 1300,
  });
  filled.body = filled.body.replaceAll('[WRITE]', 'Done');
  const evaluation = evaluateDraft(filled, config);
  assert.equal(evaluation.errors.includes('unfilled-write-blocks'), false);
  assert.equal(evaluation.ok, true);

  const authorCentric = evaluateDraft({
    ...filled,
    body: `${'method '.repeat(1300)}I wanted to write about my research agenda instead.`,
  }, config);
  assert.equal(authorCentric.ok, false);
  assert.ok(authorCentric.errors.includes('author-centric'));

  const missingCustomer = evaluateDraft({ ...filled, customer: null }, config);
  assert.ok(missingCustomer.errors.includes('missing-customer'));

  const dry = canPublish(filled, config, { live: false });
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true);

  const live = canPublish(filled, config, { live: true, blogId: '1', accessToken: 'tok' });
  assert.equal(live.ok, false);
  assert.ok(live.errors.includes('live-publish-disabled'));
});

test('Blogger payload is a draft HTML post', () => {
  const topic = selectTopics(sampleTrends.items, financeConfig, 5)[0];
  const draft = buildDraft(topic, mergeConfig(baseConfig, ingestPlanMarkdown(samplePlan)));
  const post = toBloggerPost(draft);
  assert.equal(post.kind, 'blogger#post');
  assert.equal(post.title, draft.title);
  assert.match(post.content, /<p>/);
  assert.ok(post.labels.includes('english'));
  const html = htmlFromMarkdown('# Hello\n\nWorld');
  assert.match(html, /<h2>Hello<\/h2>/);
  const request = buildPublishRequest(draft, mergeConfig(baseConfig, ingestPlanMarkdown(samplePlan)), {
    env: { BLOGGER_ALLOW_LIVE: '0', BLOGGER_BLOG_ID: '99' },
  });
  assert.equal(request.live, false);
  assert.equal(request.asDraft, true);
  assert.equal(request.blogId, '99');
});

test('word counter ignores fenced code', () => {
  assert.equal(countWords('one two ```\nignore these words\n``` three'), 3);
});

test('cli research --fixture writes English topics only', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'blogger-en-'));
  await fs.cp(path.join(repoRoot, 'blogger-en/config.json'), path.join(tmp, 'config.json'));
  await fs.cp(path.join(repoRoot, 'blogger-en/PLAN.md'), path.join(tmp, 'PLAN.md'));
  await fs.mkdir(path.join(tmp, 'data'), { recursive: true });
  await fs.mkdir(path.join(tmp, 'drafts'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'data/queue.json'), '{"items":[]}\n');
  await fs.writeFile(path.join(tmp, 'data/published.json'), '{"items":[]}\n');
  await fs.writeFile(path.join(tmp, 'data/status.json'), '{}\n');

  const cli = path.join(repoRoot, 'blogger-en/scripts/cli.mjs');
  const fixture = path.join(repoRoot, 'blogger-en/fixtures/sample-trends.json');
  const output = await runCli(cli, ['research', '--fixture', fixture], { BLOGGER_EN_ROOT: tmp });
  assert.match(output.stdout, /"selected":/);
  const topics = JSON.parse(await fs.readFile(path.join(tmp, 'data/topics.json'), 'utf8'));
  assert.ok(topics.selected >= 3);
  assert.equal(topics.items.some((row) => row.title === '과태료'), false);
  assert.ok(topics.items.some((row) => /korea|k-eta|seongsu|climate|incheon/i.test(row.title)));

  const draftOut = await runCli(cli, ['draft', '--limit', '1'], { BLOGGER_EN_ROOT: tmp });
  assert.match(draftOut.stdout, /"created": 1/);
  const queue = JSON.parse(await fs.readFile(path.join(tmp, 'data/queue.json'), 'utf8'));
  assert.equal(queue.items[0].status, 'needs_review');
  const publishOut = await runCli(cli, ['publish', '--id', queue.items[0].id], { BLOGGER_EN_ROOT: tmp });
  assert.match(publishOut.stdout, /"dryRun": true/);
  assert.match(publishOut.stdout, /not-approved|plan-not-ingested|unfilled-write-blocks/);
});

test('ops dashboard and PLAN intake files exist', async () => {
  const html = await fs.readFile(path.join(repoRoot, 'blogger-en/index.html'), 'utf8');
  assert.match(html, /고객이 검색한 일만/);
  assert.match(html, /2026/);
  assert.match(html, /사람 승인/);
  assert.match(html, /BLOGGER_ALLOW_LIVE/);
  assert.match(html, /korea-tourism/);
  const fetchPy = await fs.readFile(path.join(repoRoot, 'google-trends/fetch_data.py'), 'utf8');
  assert.match(fetchPy, /OUTPUT_PATH/);
  assert.match(fetchPy, /SKIP_FALLBACK/);
});

function runCli(cli, argv, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...argv], {
      env: { ...process.env, ...env },
      cwd: repoRoot,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
