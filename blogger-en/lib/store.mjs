import { readJson, readText, writeJson } from './io.mjs';
import { CONFIG_PATH, OVERLAY_PATH, PLAN_PATH, QUEUE_PATH, PUBLISHED_PATH, TOPICS_PATH, STATUS_PATH } from './paths.mjs';
import { ingestPlanMarkdown, mergeConfig } from './plan-ingest.mjs';

export async function loadConfig() {
  const base = await readJson(CONFIG_PATH);
  const overlay = await readJson(OVERLAY_PATH, null);
  return mergeConfig(base, overlay);
}

export async function loadQueue() {
  return readJson(QUEUE_PATH, { updatedAt: null, items: [] });
}

export async function saveQueue(queue) {
  await writeJson(QUEUE_PATH, queue);
}

export async function upsertQueueItem(item) {
  const queue = await loadQueue();
  const items = queue.items || [];
  const index = items.findIndex((row) => row.id === item.id);
  if (index >= 0) items[index] = item;
  else items.unshift(item);
  const next = { updatedAt: new Date().toISOString(), items };
  await saveQueue(next);
  return next;
}

export async function findDraft(id) {
  const queue = await loadQueue();
  return (queue.items || []).find((row) => row.id === id) || null;
}

export async function ingestPlanFile(planPath = PLAN_PATH) {
  const markdown = await readText(planPath);
  const overlay = ingestPlanMarkdown(markdown);
  await writeJson(OVERLAY_PATH, overlay);
  const config = mergeConfig(await readJson(CONFIG_PATH), overlay);
  await writeStatus({
    stage: overlay.status,
    message: overlay.status === 'plan_ready' ? 'Plan ingested. Review gate is still required before publish.' : 'Still waiting for PLAN.md to be filled.',
  });
  return { overlay, config };
}

export async function writeStatus(partial) {
  const current = await readJson(STATUS_PATH, {
    stage: 'awaiting_plan',
    topics: 0,
    drafts: 0,
    approved: 0,
    published: 0,
  });
  const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
  await writeJson(STATUS_PATH, next);
  return next;
}

export async function snapshotStatus(config) {
  const queue = await loadQueue();
  const topics = await readJson(TOPICS_PATH, { items: [] });
  const published = await readJson(PUBLISHED_PATH, { items: [] });
  const items = queue.items || [];
  return writeStatus({
    stage: config.status || 'awaiting_plan',
    language: config.language,
    blogUrl: config.blog?.url || '',
    cadencePerWeek: config.cadencePerWeek,
    topics: (topics.items || []).length,
    drafts: items.length,
    needsReview: items.filter((row) => row.status === 'needs_review').length,
    approved: items.filter((row) => row.status === 'approved').length,
    rejected: items.filter((row) => row.status === 'rejected').length,
    published: (published.items || []).length,
    livePublishEnabled: Boolean(config.review?.allowLivePublish),
    requireHumanApproval: config.review?.requireHumanApproval !== false,
  });
}
