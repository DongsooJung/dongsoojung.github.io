const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { resolveRequestPath, startStaticServer } = require('./static-server');

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stargate-desktop-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>fixture</title>');
  fs.writeFileSync(path.join(root, 'secret.env'), 'TOKEN=1');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
  fs.mkdirSync(path.join(root, 'research'));
  fs.writeFileSync(path.join(root, 'research', 'index.html'), 'research');
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'outside.txt'), 'nope');
  const outside = path.join(os.tmpdir(), `stargate-outside-${process.pid}.txt`);
  fs.writeFileSync(outside, 'secret-outside');
  fs.symlinkSync(outside, path.join(root, 'leak.txt'));
  return { root, outside };
}

test('디렉터리 인덱스와 비밀 파일, 심볼릭 링크를 가른다', () => {
  const { root, outside } = makeFixture();
  try {
    const index = resolveRequestPath(root, '/');
    assert.equal(index.ok, true);
    assert.match(index.filePath, /index\.html$/);

    const research = resolveRequestPath(root, '/research');
    assert.equal(research.status, 302);
    assert.equal(research.location, '/research/');

    const page = resolveRequestPath(root, '/research/');
    assert.equal(page.ok, true);
    assert.equal(fs.readFileSync(page.filePath, 'utf8'), 'research');

    assert.equal(resolveRequestPath(root, '/../outside.txt').status, 403);
    assert.equal(resolveRequestPath(root, '/%2e%2e/outside.txt').status, 403);
    assert.equal(resolveRequestPath(root, '/.env').status, 403);
    assert.equal(resolveRequestPath(root, '/node_modules/pkg/package.json').status, 403);
    assert.equal(resolveRequestPath(root, '/leak.txt').status, 403);
    assert.equal(fs.existsSync(outside), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});

test('HEAD는 본문 없이 Last-Modified를 준다', async () => {
  const { root } = makeFixture();
  const started = await startStaticServer(root);
  try {
    const response = await new Promise((resolve, reject) => {
      const req = http.request(`${started.origin}/`, { method: 'HEAD' }, resolve);
      req.on('error', reject);
      req.end();
    });
    const body = await new Promise((resolve) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    assert.equal(response.statusCode, 200);
    assert.equal(body, '');
    assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
    assert.ok(response.headers['last-modified']);
    assert.equal(response.headers['cache-control'], 'no-store');
  } finally {
    await new Promise((resolve) => started.server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('포털 매니페스트를 로컬 서버가 올바른 형식으로 준다', async () => {
  const portal = path.resolve(__dirname, '..', '..');
  const resolved = resolveRequestPath(portal, '/manifest.webmanifest');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.contentType, 'application/manifest+json; charset=utf-8');

  const started = await startStaticServer(portal);
  try {
    const response = await new Promise((resolve, reject) => {
      http.get(`${started.origin}/manifest.webmanifest`, resolve).on('error', reject);
    });
    const body = await new Promise((resolve) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(body).start_url, '/');
  } finally {
    await new Promise((resolve) => started.server.close(resolve));
  }
});
