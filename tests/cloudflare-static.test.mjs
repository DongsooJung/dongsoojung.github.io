import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCloudflareStatic, isCloudflarePublicFile } from '../scripts/build-cloudflare-static.mjs';

test('Workers upload excludes deployment sources while keeping public paths and data', () => {
  for (const path of ['.git/config', '.github/workflows/deploy.yml', '.env.example', 'SOURCE_OF_TRUTH.md', 'wrangler.jsonc', 'CNAME', 'api/sms.js', 'kakao-send/api/session.js', 'private-gateway/api/private-monetization.js', 'scripts/collect.js', 'app/twa-manifest.json', 'quote-maker-app/app.json', 'court-auction/package.json', 'court-auction/collect.mjs', 'nested/node_modules/key.js', 'x/../secret.json']) {
    assert.equal(isCloudflarePublicFile(path), false, path);
  }
  for (const path of ['index.html', '.well-known/assetlinks.json', 'assets/site-theme.js', 'strategy/monetization-opportunities/index.html', 'research/airport-congestion/data/latest.json', 'naver-cafe-research/data/latest.json', 'court-auction/output/법원경매_주택_2026.xlsx']) {
    assert.equal(isCloudflarePublicFile(path), true, path);
  }
});

test('snapshot staging skips deleted tracked files and rejects directories', context => {
  const root = mkdtempSync(join(tmpdir(), 'sg-worker-snapshot-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, '.nojekyll'), '');
  const path = 'research/airport-congestion/data/latest.json';
  assert.equal(buildCloudflareStatic(root, [path]), 0);
  mkdirSync(join(root, path), { recursive: true });
  assert.throws(() => buildCloudflareStatic(root, [path]), /Non-regular public snapshot/);
});

test('snapshot staging never follows a symlink', context => {
  const root = mkdtempSync(join(tmpdir(), 'sg-worker-symlink-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, '.nojekyll'), '');
  writeFileSync(join(root, 'private.json'), 'PRIVATE');
  const path = 'naver-cafe-research/data/latest.json';
  mkdirSync(dirname(join(root, path)), { recursive: true });
  try { symlinkSync(join(root, 'private.json'), join(root, path), 'file'); }
  catch (error) { if (error.code === 'EPERM') return context.skip('Host cannot create symlinks'); throw error; }
  assert.throws(() => buildCloudflareStatic(root, [path]), /Non-regular public snapshot/);
  assert.equal(existsSync(join(root, '.site-public', path)), false);
});

test('staging preserves tracked public bytes, snapshot JSON and protected shell only', context => {
  const root = mkdtempSync(join(tmpdir(), 'sg-worker-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const fixtures = {
    '.nojekyll': '',
    'index.html': '<h1>스타게이트</h1>',
    '404.html': '<h1>Not found</h1>',
    '.well-known/assetlinks.json': '[{"relation":[]}]',
    'strategy/monetization-opportunities/index.html': '<form>본인 확인 후 열람</form>',
    'research/airport-congestion/data/latest.json': '{"snapshot":1}',
    'naver-cafe-research/data/latest.json': '{"snapshot":2}',
    'private-gateway/api/private-monetization.js': 'PRIVATE',
    '.env': 'SECRET',
  };
  for (const [path, content] of Object.entries(fixtures)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  writeFileSync(join(root, 'untracked.html'), 'must not upload');
  assert.equal(buildCloudflareStatic(root, Object.keys(fixtures)), 6);
  for (const path of Object.keys(fixtures).filter(isCloudflarePublicFile)) {
    assert.deepEqual(readFileSync(join(root, '.site-public', path)), readFileSync(join(root, path)), path);
  }
  for (const path of ['untracked.html', '.env', 'private-gateway/api/private-monetization.js']) {
    assert.equal(existsSync(join(root, '.site-public', path)), false, path);
  }
});
