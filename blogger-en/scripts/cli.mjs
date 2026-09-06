#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, writeText } from '../lib/io.mjs';
import { ROOT, TRENDS_PATH, TOPICS_PATH, DRAFTS_DIR, PUBLISHED_PATH } from '../lib/paths.mjs';
import { selectTopics } from '../lib/topics.mjs';
import { loadSeedCatalog } from '../lib/seeds.mjs';
import { buildDraft } from '../lib/draft.mjs';
import { approveDraft, canPublish, rejectDraft } from '../lib/review-gate.mjs';
import { buildPublishRequest, createPost, exchangeRefreshToken, bloggerEnv } from '../lib/blogger-api.mjs';
import { findDraft, ingestPlanFile, loadConfig, snapshotStatus, upsertQueueItem } from '../lib/store.mjs';

const codeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

async function cmdStatus() {
  const config = await loadConfig();
  const status = await snapshotStatus(config);
  console.log(JSON.stringify(status, null, 2));
  return 0;
}

async function cmdIngest(flags) {
  const planPath = flags.plan ? path.resolve(flags.plan) : undefined;
  const result = await ingestPlanFile(planPath);
  console.log(JSON.stringify({
    status: result.overlay.status,
    filledSectionCount: result.overlay.filledSectionCount,
    awaitingSectionCount: result.overlay.awaitingSectionCount,
    blog: result.config.blog,
  }, null, 2));
  return 0;
}

async function cmdResearch(flags) {
  const config = await loadConfig();
  if (flags.geos) {
    config.geos = String(flags.geos)
      .split(',')
      .map((geo) => geo.trim().toUpperCase())
      .filter(Boolean);
  }
  if (flags.hours) config.hours = Number(flags.hours);
  let trends;
  if (flags.fixture) {
    trends = await readJson(path.resolve(flags.fixture === true ? path.join(ROOT, 'fixtures/sample-trends.json') : flags.fixture));
  } else {
    await runPythonResearch(config);
    trends = await readJson(TRENDS_PATH);
  }
  const seeds = await loadSeedCatalog(config);
  const merged = [...seeds, ...(trends.items || [])];
  const items = selectTopics(merged, config, flags.limit);
  const payload = {
    updatedAt: new Date().toISOString(),
    source: [trends.source || 'fixture', 'customer-seeds'].join('+'),
    geos: trends.geo || config.geos,
    selected: items.length,
    scanned: merged.length,
    seeded: seeds.length,
    items,
  };
  await writeJson(TOPICS_PATH, payload);
  await snapshotStatus(config);
  console.log(JSON.stringify({ selected: items.length, scanned: payload.scanned, top: items.slice(0, 5).map((row) => row.title) }, null, 2));
  return 0;
}

function runPythonResearch(config) {
  const script = path.join(codeRoot, 'google-trends/fetch_data.py');
  const env = {
    ...process.env,
    GEO: (config.geos || ['US']).join(','),
    HOURS: String(config.hours || 48),
    LIMIT: '100',
    OUTPUT_PATH: TRENDS_PATH,
    SKIP_FALLBACK: '1',
  };
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [script], { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`google-trends fetch_data.py exited ${code}`));
    });
  });
}

async function cmdDraft(flags) {
  const config = await loadConfig();
  const topics = await readJson(TOPICS_PATH, { items: [] });
  const limit = Number(flags.limit || config.draftLimit || 3);
  const created = [];
  const skipped = [];
  for (const topic of (topics.items || []).slice(0, limit * 3)) {
    if (created.length >= limit) break;
    try {
      const draft = buildDraft(topic, config);
      await writeText(path.join(DRAFTS_DIR, `${draft.id}.md`), draft.body);
      await upsertQueueItem(draft);
      created.push({
        id: draft.id,
        title: draft.title,
        status: draft.status,
        customer: draft.customer?.name || null,
      });
    } catch (error) {
      if (error && error.code === 'no-customer-match') {
        skipped.push(topic.title);
        continue;
      }
      throw error;
    }
  }
  await snapshotStatus(config);
  console.log(JSON.stringify({ created: created.length, skipped, items: created }, null, 2));
  return created.length ? 0 : 1;
}

async function cmdReview(flags) {
  const id = flags.id || flags._[0];
  if (!id) {
    console.error('review requires --id');
    return 2;
  }
  const current = await findDraft(id);
  if (!current) {
    console.error(`draft not found: ${id}`);
    return 1;
  }
  let next = current;
  if (flags.approve) next = approveDraft(current, flags.by || 'human');
  else if (flags.reject) next = rejectDraft(current, String(flags.reason || ''), flags.by || 'human');
  else {
    console.error('review requires --approve or --reject');
    return 2;
  }
  await upsertQueueItem(next);
  await snapshotStatus(await loadConfig());
  console.log(JSON.stringify({ id: next.id, status: next.status }, null, 2));
  return 0;
}

async function cmdPublish(flags) {
  const id = flags.id || flags._[0];
  if (!id) {
    console.error('publish requires --id');
    return 2;
  }
  const config = await loadConfig();
  const draft = await findDraft(id);
  if (!draft) {
    console.error(`draft not found: ${id}`);
    return 1;
  }
  const credentials = bloggerEnv();
  const live = Boolean(flags.live);
  const gate = canPublish(draft, config, {
    live,
    blogId: config.blog?.id || credentials.blogId,
    accessToken: live ? 'pending' : '',
  });
  const request = buildPublishRequest(draft, config, { live, env: process.env });
  if (!gate.ok || (live && !request.live)) {
    console.log(JSON.stringify({
      dryRun: true,
      published: false,
      errors: gate.ok ? ['live-publish-disabled'] : gate.errors,
      request: { blogId: request.blogId, asDraft: request.asDraft, title: request.post.title },
    }, null, 2));
    return live ? 1 : 0;
  }

  if (!live) {
    console.log(JSON.stringify({
      dryRun: true,
      published: false,
      request: { blogId: request.blogId, asDraft: request.asDraft, title: request.post.title, labels: request.post.labels },
    }, null, 2));
    return 0;
  }

  const accessToken = await exchangeRefreshToken(credentials);
  const created = await createPost({
    blogId: request.blogId,
    accessToken,
    post: request.post,
    isDraft: request.asDraft,
  });
  const published = {
    id: draft.id,
    bloggerPostId: created.id,
    url: created.url,
    publishedAt: new Date().toISOString(),
    asDraft: request.asDraft,
  };
  const log = await readJson(PUBLISHED_PATH, { items: [] });
  log.updatedAt = published.publishedAt;
  log.items = [published, ...(log.items || [])];
  await writeJson(PUBLISHED_PATH, log);
  await upsertQueueItem({ ...draft, status: request.asDraft ? 'blogger_draft' : 'published', bloggerPostId: created.id, publishedAt: published.publishedAt });
  await snapshotStatus(config);
  console.log(JSON.stringify({ dryRun: false, published: true, ...published }, null, 2));
  return 0;
}

const commands = {
  status: cmdStatus,
  ingest: cmdIngest,
  research: cmdResearch,
  draft: cmdDraft,
  review: cmdReview,
  publish: cmdPublish,
};

const argv = process.argv.slice(2);
const command = argv.shift();
const flags = args(argv);

if (!command || command === 'help' || flags.help) {
  console.log(`blogger-en cli
  status
  ingest [--plan path]
  research [--fixture [path]] [--limit N] [--geos US,GB] [--hours 48]
  draft [--limit N]
  review --id ID --approve|--reject [--reason text]
  publish --id ID [--live]
`);
  process.exit(command ? 0 : 0);
}

if (!commands[command]) {
  console.error(`unknown command: ${command}`);
  process.exit(2);
}

commands[command](flags)
  .then((code) => process.exit(code ?? 0))
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
