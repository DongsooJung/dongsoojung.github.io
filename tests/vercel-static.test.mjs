import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isPublicFile, buildStatic, publicFiles } from '../scripts/build-vercel-static.mjs';

test('public stage excludes server sources, credentials and traversal but keeps site assets', () => {
  for (const path of ['server/api/customs.js', 'api/sms.js', '.env', '.env.production', '.vercel/project.json', 'x/.env', '../outside', 'supabase/geo_metric.sql', 'tests/a.test.js', 'AGENTS.md', 'nested/node_modules/a.js', 'signing.keystore', 'private.pem']) assert.equal(isPublicFile(path), false, path);
  for (const path of ['research/index.html', 'assets/site-theme.js', 'data/latest.json', '.well-known/assetlinks.json', 'choropleth/index.html', 'robots.txt', 'sitemap.xml']) assert.equal(isPublicFile(path), true, path);
});

test('live snapshots cannot shadow their external Vercel rewrites', () => {
  for (const path of ['research/airport-congestion/data/latest.json', 'naver-cafe-research/data/latest.json', 'research\\airport-congestion\\data\\latest.json']) assert.equal(isPublicFile(path), false);
  assert.equal(isPublicFile('research/another/data/latest.json'), true);
});

test('a cloud source archive without .git can be staged without private trees', context => {
  const root = mkdtempSync(join(tmpdir(), 'sg-cloud-static-test-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['server', 'research', '.vercel', 'research/node_modules']) mkdirSync(join(root, path), { recursive: true });
  writeFileSync(join(root, 'research/index.html'), 'Public');
  writeFileSync(join(root, 'server/handler.js'), 'Private');
  writeFileSync(join(root, '.env.local'), 'Private');
  writeFileSync(join(root, '.vercel/project.json'), '{}');
  writeFileSync(join(root, 'research/node_modules/internal.js'), 'Private');
  assert.deepEqual(publicFiles(root), ['research/index.html']);
  assert.equal(buildStatic(root, publicFiles(root)), 1);
  assert.deepEqual(publicFiles(root), ['research/index.html']);
});

test('static build removes only stale generated output and skips deleted tracked files', context => {
  const root = mkdtempSync(join(tmpdir(), 'sg-static-test-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'index.html'), '<h1>Research</h1>');
  writeFileSync(join(root, '.env'), 'PRIVATE');
  mkdirSync(join(root, '.site-public'));
  writeFileSync(join(root, '.site-public', 'old.html'), 'old');
  assert.equal(buildStatic(root, ['index.html', '.env', 'removed.html']), 1);
  assert.ok(existsSync(join(root, '.site-public', 'index.html')));
  assert.ok(!existsSync(join(root, '.site-public', 'old.html')));
  assert.ok(!existsSync(join(root, '.site-public', '.env')));
  assert.ok(existsSync(join(root, '.env')));
});
