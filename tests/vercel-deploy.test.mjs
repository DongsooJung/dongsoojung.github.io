import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { triggerDeployHook } from '../scripts/trigger-vercel-hook.mjs';

const hook = 'https://api.vercel.com/v1/integrations/deploy/prj_bfalcR6646HRzJ7BYvmaBXqIuQt9/test-hook';
test('hook validates the project, keeps credentials out of errors, and never follows redirects', async () => {
  for (const url of [undefined, 'bad', hook.replace('api.vercel.com', 'example.com'), hook.replace('prj_bfalcR6646HRzJ7BYvmaBXqIuQt9', 'prj_other'), `${hook}?secret=value`]) {
    await assert.rejects(triggerDeployHook(url, () => assert.fail('must not fetch')), /missing or invalid|configured portfolio/);
  }
  let calls = 0;
  const job = await triggerDeployHook(hook, async (url, options) => {
    calls++;
    assert.equal(url, hook);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ job: { id: 'job_123', state: 'PENDING' } }) };
  });
  assert.deepEqual(job, { id: 'job_123', state: 'PENDING' });
  assert.equal(calls, 1);
  await assert.rejects(triggerDeployHook(hook, async () => { throw new Error(hook); }), error => !error.message.includes(hook) && /before retrying/.test(error.message));
  await assert.rejects(triggerDeployHook(hook, async () => ({ ok: false, status: 403 })), /HTTP 403/);
  await assert.rejects(triggerDeployHook(hook, async () => ({ ok: true, json: async () => ({ job: { state: 'ERROR' } }) })), /valid deployment job/);
});

test('deployment source fits Hobby budget, preserves 301 and keeps Git hook configuration', () => {
  function functions(path) {
    return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) return [];
      return entry.isDirectory() ? functions(join(path, entry.name)) : /\.(js|mjs|cjs|ts|py|go|rb)$/.test(entry.name) ? [entry.name] : [];
    });
  }
  assert.equal(functions(fileURLToPath(new URL('../api/', import.meta.url))).length, 11);
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.git.deploymentEnabled, false);
  assert.notEqual(config.github?.enabled, false);
  assert.ok(config.redirects.every(route => route.statusCode === 301 && !('permanent' in route)));
  for (const source of ['/research/airport-congestion/data/latest.json', '/naver-cafe-research/data/latest.json']) {
    assert.equal(config.rewrites.find(route => route.source === source)?.destination, `https://raw.githubusercontent.com/DongsooJung/dongsoojung.github.io/main${source}`);
  }
});
