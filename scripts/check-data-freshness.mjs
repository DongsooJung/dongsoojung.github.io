#!/usr/bin/env node
/**
 * Outcome check for the data-refresh loops.
 *
 * A scheduled workflow can end in "success" without publishing anything (see
 * the 2026-11-17 incident in tests/workflow-push-commands.test.mjs). This
 * script ignores workflow conclusions and measures what readers actually get:
 * how long ago each published snapshot last changed on the checked-out branch.
 *
 * Usage: node scripts/check-data-freshness.mjs [--json]
 * Exit code 1 when any path is stale, has no commit in the fetched history, or
 * cannot be dated because the clone is too shallow. Fetch enough history to
 * cover the largest maxAgeHours: git fetch --shallow-since="21 days ago" origin main
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadManifest(file = join(root, 'ops', 'data-freshness.json')) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(manifest.items) || manifest.items.length === 0) throw new Error('data-freshness manifest has no items');
  for (const item of manifest.items) {
    if (typeof item.path !== 'string' || !item.path || item.path.startsWith('/') || item.path.includes('..')) {
      throw new Error(`invalid path in data-freshness manifest: ${JSON.stringify(item.path)}`);
    }
    if (!Number.isFinite(item.maxAgeHours) || item.maxAgeHours <= 0) throw new Error(`invalid maxAgeHours for ${item.path}`);
    if (typeof item.workflow !== 'string' || !/^[\w.-]+\.ya?ml$/.test(item.workflow)) throw new Error(`invalid workflow for ${item.path}`);
  }
  return manifest;
}

const boundaryCache = new Map();

/** Commits at the edge of a shallow clone. Git shows them as touching every path. */
function shallowBoundaries(cwd) {
  if (!boundaryCache.has(cwd)) {
    const file = execFileSync('git', ['rev-parse', '--git-path', 'shallow'], { cwd, encoding: 'utf8' }).trim();
    const absolute = isAbsolute(file) ? file : join(cwd, file);
    boundaryCache.set(cwd, new Set(existsSync(absolute) ? readFileSync(absolute, 'utf8').split('\n').filter(Boolean) : []));
  }
  return boundaryCache.get(cwd);
}

/** Last commit touching `path` as { seconds, boundary }, or null when none is in the fetched history. */
export function lastCommit(path, cwd = root) {
  const out = execFileSync('git', ['log', '-1', '--format=%H %ct', '--', path], { cwd, encoding: 'utf8' }).trim();
  if (!out) return null;
  const [hash, seconds] = out.split(' ');
  return { seconds: Number(seconds), boundary: shallowBoundaries(cwd).has(hash) };
}

/**
 * `lastCommitOf(path)` returns seconds since epoch, `{ seconds, boundary }`, or null.
 * A boundary commit only proves the real change is at least that old: past the limit
 * it is stale, within the limit the history is too shallow to call it fresh.
 */
export function evaluate(items, lastCommitOf, nowMs = Date.now()) {
  return items.map((item) => {
    const found = lastCommitOf(item.path);
    const seconds = found && typeof found === 'object' ? found.seconds : found;
    const boundary = Boolean(found && typeof found === 'object' && found.boundary);
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
      return { ...item, lastCommit: null, ageHours: null, status: 'missing' };
    }
    const ageHours = Math.max(0, (nowMs - seconds * 1000) / 3600000);
    let status = 'fresh';
    if (ageHours > item.maxAgeHours) status = 'stale';
    else if (boundary) status = 'unknown';
    return {
      ...item,
      lastCommit: new Date(seconds * 1000).toISOString(),
      ageHours: Math.round(ageHours * 10) / 10,
      status,
    };
  });
}

export function formatReport(results) {
  const rows = results.map((r) => {
    let age = r.ageHours === null ? 'no commit in fetched history' : `${r.ageHours}h`;
    if (r.status === 'unknown') age = `at least ${r.ageHours}h (history too shallow)`;
    return `| ${r.status === 'fresh' ? 'OK' : r.status.toUpperCase()} | \`${r.path}\` | ${age} | ${r.maxAgeHours}h | ${r.workflow} | ${r.lastCommit ?? '-'} |`;
  });
  return ['| Status | Path | Age | Limit | Workflow | Last commit (UTC) |', '|---|---|---|---|---|---|', ...rows].join('\n');
}

function main() {
  const results = evaluate(loadManifest().items, (path) => lastCommit(path));
  const failing = results.filter((r) => r.status !== 'fresh');
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), failing: failing.length, results }, null, 2));
  } else {
    console.log(formatReport(results));
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Data freshness\n\n${formatReport(results)}\n`);
  }
  if (failing.length) {
    console.error(`\n${failing.length} of ${results.length} published snapshots are not confirmed fresh: ${failing.map((r) => `${r.path} (${r.status})`).join(', ')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
