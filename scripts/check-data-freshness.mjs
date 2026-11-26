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
 * Exit code 1 when any path is stale or has no commit in the fetched history.
 * The checkout needs enough history to cover the largest maxAgeHours.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

/** Seconds since epoch of the last commit touching `path`, or null when none is in the fetched history. */
export function lastCommitSeconds(path, cwd = root) {
  const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', path], { cwd, encoding: 'utf8' }).trim();
  return out ? Number(out) : null;
}

export function evaluate(items, lastCommitOf, nowMs = Date.now()) {
  return items.map((item) => {
    const seconds = lastCommitOf(item.path);
    if (seconds === null || !Number.isFinite(seconds)) {
      return { ...item, lastCommit: null, ageHours: null, status: 'missing' };
    }
    const ageHours = Math.max(0, (nowMs - seconds * 1000) / 3600000);
    return {
      ...item,
      lastCommit: new Date(seconds * 1000).toISOString(),
      ageHours: Math.round(ageHours * 10) / 10,
      status: ageHours > item.maxAgeHours ? 'stale' : 'fresh',
    };
  });
}

export function formatReport(results) {
  const rows = results.map((r) => {
    const age = r.ageHours === null ? 'no commit in fetched history' : `${r.ageHours}h`;
    return `| ${r.status === 'fresh' ? 'OK' : r.status.toUpperCase()} | \`${r.path}\` | ${age} | ${r.maxAgeHours}h | ${r.workflow} | ${r.lastCommit ?? '-'} |`;
  });
  return ['| Status | Path | Age | Limit | Workflow | Last commit (UTC) |', '|---|---|---|---|---|---|', ...rows].join('\n');
}

function main() {
  const results = evaluate(loadManifest().items, (path) => lastCommitSeconds(path));
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
    console.error(`\n${failing.length} of ${results.length} published snapshots are stale: ${failing.map((r) => r.path).join(', ')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
