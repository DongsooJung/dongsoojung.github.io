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

const sampleTrends = JSON.parse(
  await fs.readFile(path.join(repoRoot, 'blogger-en/fixtures/sample-trends.json'), 'utf8'),
);
const samplePlan = await fs.readFile(path.join(repoRoot, 'blogger-en/fixtures/sample-plan.md'), 'utf8');
const emptyPlan = await fs.readFile(path.join(repoRoot, 'blogger-en/PLAN.md'), 'utf8');
const baseConfig = JSON.parse(
  await fs.readFile(path.join(repoRoot, 'blogger-en/config.json'), 'utf8'),
);

test('empty PLAN.md stays in awaiting_plan', () => {
  const overlay = ingestPlanMarkdown(emptyPlan);
  assert.equal(overlay.status, 'awaiting_plan');
  assert.equal(overlay.filledSectionCount, 0);
  assert.equal(isPlaceholderText('(대기)'), true);
});

test('sample plan fills niches, blog id, and monetization', () => {
  const overlay = ingestPlanMarkdown(samplePlan);
  const config = mergeConfig(baseConfig, overlay);
  assert.equal(overlay.status, 'plan_ready');
  assert.ok(overlay.filledSectionCount >= 6);
  assert.equal(config.blog.id, '1234567890');
  assert.equal(config.blog.url, 'https://example-global.blogspot.com');
  assert.deepEqual(config.geos, ['US', 'GB', 'IN']);
  assert.ok(config.niches.includes('practical AI for knowledge workers'));
  assert.equal(config.monetization.adsense, true);
  assert.ok(config.monetization.affiliates.includes('amazon-associates'));
  assert.equal(config.voice.persona.includes('Dongsoo'), true);
});

test('frontmatter parser keeps arrays', () => {
  const { meta } = parseFrontmatter(samplePlan);
  assert.deepEqual(meta.geos, ['US', 'GB', 'IN']);
  assert.equal(meta.cadencePerWeek, 4);
});

test('English filter drops Korean, entertainment, and politics', () => {
  const selected = selectTopics(sampleTrends.items, baseConfig, 20);
  const titles = selected.map((row) => row.title);
  assert.ok(titles.includes('401k contribution limit'));
  assert.ok(titles.includes('AI study planner'));
  assert.ok(titles.includes('used GPU price'));
  assert.equal(titles.includes('과태료'), false);
  assert.equal(titles.includes('celebrity dating rumor'), false);
  assert.equal(titles.includes('election polls'), false);
  assert.equal(isEnglishTitle('과태료'), false);
  assert.equal(isEnglishTitle('AI study planner'), true);
});

test('finance and education outrank generic topics', () => {
  const finance = scoreTopic(sampleTrends.items[0], baseConfig);
  const gpu = scoreTopic(sampleTrends.items[5], baseConfig);
  const celeb = scoreTopic(sampleTrends.items[3], baseConfig);
  assert.ok(finance.score > gpu.score);
  assert.equal(celeb.score, 0);
});

test('draft briefing is English, review-gated, and not publishable until filled', () => {
  const topic = selectTopics(sampleTrends.items, baseConfig, 5)[0];
  const draft = buildDraft(topic, baseConfig, { now: new Date('2026-08-28T00:00:00Z') });
  assert.match(draft.id, /^draft-20260828-/);
  assert.equal(draft.language, 'en');
  assert.equal(draft.status, 'needs_review');
  assert.match(draft.body, /\[WRITE\]/);
  assert.match(draft.body, /Human review required/);
  assert.equal(toSlug(draft.title).length > 0, true);
  assert.match(metaDescription(topic.title, 'practical AI'), /practical English guide/);

  const blocked = evaluateDraft(draft, baseConfig);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.errors.includes('unfilled-write-blocks'));
  assert.ok(blocked.errors.includes('plan-not-ingested'));
  assert.ok(blocked.errors.includes('not-approved'));
});

test('approved filled draft still cannot go live without flags', () => {
  const topic = selectTopics(sampleTrends.items, baseConfig, 5)[0];
  const overlay = ingestPlanMarkdown(samplePlan);
  const config = mergeConfig(baseConfig, overlay);
  config.review.allowLivePublish = false;
  const draft = buildDraft(topic, config, { now: new Date('2026-08-28T00:00:00Z') });
  const filled = approveDraft({
    ...draft,
    body: `${'method '.repeat(1300)}Original explanation with sources from IRS and BLS.`,
    wordCount: 1300,
  });
  filled.body = filled.body.replaceAll('[WRITE]', 'Done');
  const evaluation = evaluateDraft(filled, config);
  assert.equal(evaluation.errors.includes('unfilled-write-blocks'), false);
  assert.equal(evaluation.ok, true);

  const dry = canPublish(filled, config, { live: false });
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true);

  const live = canPublish(filled, config, { live: true, blogId: '1', accessToken: 'tok' });
  assert.equal(live.ok, false);
  assert.ok(live.errors.includes('live-publish-disabled'));
});

test('Blogger payload is a draft HTML post', () => {
  const topic = selectTopics(sampleTrends.items, baseConfig, 5)[0];
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
  assert.match(html, /awaiting_plan/);
  assert.match(html, /사람 승인/);
  assert.match(html, /BLOGGER_ALLOW_LIVE/);
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
