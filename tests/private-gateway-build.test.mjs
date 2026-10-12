import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPublicFile } from '../scripts/build-vercel-static.mjs';
import { selectPublicFiles, stagePublicFiles } from '../private-gateway/build.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(root, 'private-gateway', 'public');

test('private gateway stages tracked public site without private source or ranking HTML', () => {
  assert.equal(isPublicFile('private-gateway/api/private-monetization.js'), false);
  assert.equal(isPublicFile('api/private-monetization.js'), false);
  assert.equal(isPublicFile('strategy/monetization-opportunities/index.html'), false);
  assert.equal(isPublicFile('.env.production'), false);
  const count = stagePublicFiles();
  assert.ok(count > 1000, 'expected the complete public site, not a sparse sample');
  assert.deepEqual(readFileSync(join(output, 'index.html')), readFileSync(join(root, 'index.html')));
  assert.deepEqual(readFileSync(join(output, 'strategy', 'index.html')), readFileSync(join(root, 'strategy', 'index.html')));
  assert.equal(readdirSync(join(output, 'strategy')).includes('monetization-opportunities'), false);
  assert.equal(readdirSync(output).includes('private-gateway'), false);
  assert.equal(readdirSync(output).includes('api'), false);
  assert.equal(readdirSync(output).includes('.env.production'), false);
});

test('source package without Git metadata still selects only public files', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'private-gateway-fixture-'));
  try {
    for (const path of ['index.html', 'strategy/index.html', 'strategy/monetization-opportunities/index.html', 'api/private-monetization.js', 'private-gateway/api/private-monetization.js', '.env.production']) {
      const target = join(fixture, path);
      mkdirSync(resolve(target, '..'), { recursive: true });
      writeFileSync(target, path);
    }
    assert.deepEqual(selectPublicFiles(fixture).sort(), ['index.html', 'strategy/index.html']);
  } finally {
    if (!resolve(fixture).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe fixture cleanup path');
    rmSync(fixture, { recursive: true, force: true });
  }
});
