import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bindProcessEnv,
  dispatchApi,
  handleRequest,
  invokeHandler,
  rawPathname,
  runDailyCollect,
  LIVE_SNAPSHOTS,
} from '../worker/platform.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

function recordingHandler(label) {
  return (req, res) => {
    res.setHeader('x-handler', label);
    res.status(201).json({
      url: req.url,
      method: req.method,
      kind: req.query.kind || null,
      body: req.body ?? null,
      bytes: req.headers['content-length'] || null,
    });
  };
}

function handlers() {
  return {
    exact: new Map([
      ['/api/sms', recordingHandler('sms')],
      ['/api/cron/daily-collect', (req, res) => {
        const secret = String(process.env.CRON_SECRET || '');
        if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' });
        return res.status(200).json({ ok: true });
      }],
    ]),
    resource: recordingHandler('resource'),
    bidKind: recordingHandler('bid'),
  };
}

test('raw pathname keeps percent-encoding and drops the query', () => {
  assert.equal(rawPathname('https://stargate.example/api/%63ustoms?resource=customs'), '/api/%63ustoms');
  assert.equal(rawPathname('/viz-dashboard/example?x=1'), '/viz-dashboard/example');
});

test('viz-dashboard paths redirect with HTTP 301 to /choropleth/', async () => {
  let assets = 0;
  for (const path of ['/viz-dashboard', '/viz-dashboard/', '/viz-dashboard/example']) {
    const response = await handleRequest(new Request(`https://stargate.example${path}`), {
      ASSETS: { fetch() { assets += 1; return new Response('asset'); } },
    }, handlers());
    assert.equal(response.status, 301, path);
    assert.equal(response.headers.get('location'), '/choropleth/');
  }
  assert.equal(assets, 0);
});

test('live snapshots are proxied to the public GitHub raw files', async () => {
  const calls = [];
  const response = await handleRequest(
    new Request('https://stargate.example/research/airport-congestion/data/latest.json'),
    {},
    handlers(),
    { fetch: async (url) => { calls.push(url); return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }); } },
  );
  assert.deepEqual(calls, [LIVE_SNAPSHOTS.get('/research/airport-congestion/data/latest.json')]);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"ok":true}');
});

test('API aliases, dynamic routes, and static fallthrough keep their owners', async () => {
  const sms = await dispatchApi(new Request('https://stargate.example/api/sms'), handlers());
  assert.equal(sms.headers.get('x-handler'), 'sms');

  const alias = await dispatchApi(new Request('https://stargate.example/api/bid-pblanc-cnstwk?limit=3'), handlers());
  assert.equal(alias.status, 201);
  assert.deepEqual(await alias.json(), {
    url: '/api/bid-pblanc/cnstwk?limit=3', method: 'GET', kind: 'cnstwk', body: null, bytes: null,
  });

  const resource = await dispatchApi(new Request('https://stargate.example/api/customs?resource=sms'), handlers());
  assert.equal(resource.headers.get('x-handler'), 'resource');
  assert.equal((await resource.json()).url, '/api/customs?resource=sms');

  const missing = await dispatchApi(new Request('https://stargate.example/api/cron/missing'), handlers());
  assert.equal(missing.status, 404);

  let assets = 0;
  const page = await handleRequest(new Request('https://stargate.example/index.html'), {
    ASSETS: { fetch() { assets += 1; return new Response('home', { status: 200 }); } },
  }, handlers());
  assert.equal(assets, 1);
  assert.equal(await page.text(), 'home');
});

test('JSON bodies and measured content length reach the Vercel-style handler', async () => {
  const response = await invokeHandler(recordingHandler('post'), new Request('https://stargate.example/api/sms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '스타게이트' }),
  }));
  const payload = await response.json();
  assert.equal(payload.body.name, '스타게이트');
  assert.equal(Number(payload.bytes) > 0, true);
});

test('scheduled collection authorizes with CRON_SECRET and fails closed', async () => {
  const previous = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    const denied = await runDailyCollect({}, handlers());
    assert.equal(denied.status, 401);
    const accepted = await runDailyCollect({ CRON_SECRET: 'cron-test-secret' }, handlers());
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { ok: true });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test('request colo is published as the handler region', () => {
  const previous = process.env.VERCEL_REGION;
  try {
    bindProcessEnv({ VERCEL_REGION: 'icn1' }, 'ICN');
    assert.equal(process.env.VERCEL_REGION, 'ICN');
  } finally {
    if (previous === undefined) delete process.env.VERCEL_REGION;
    else process.env.VERCEL_REGION = previous;
  }
});

test('Wrangler config, workflow, and API files describe the same production surface', () => {
  const config = readFileSync(join(root, 'wrangler.toml'), 'utf8');
  assert.match(config, /name = "stargate"/);
  assert.match(config, /main = "worker\/index\.js"/);
  assert.match(config, /directory = "\.site-public"/);
  assert.match(config, /region = "aws:ap-northeast-2"/);
  assert.match(config, /crons = \["10 21 \* \* \*"\]/);
  for (const path of ['/api/*', '/viz-dashboard', '/viz-dashboard/*', '/research/airport-congestion/data/latest.json', '/naver-cafe-research/data/latest.json']) {
    assert.match(config, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const workflow = readFileSync(join(root, '.github/workflows/cloudflare-production.yml'), 'utf8');
  assert.match(workflow, /CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow, /wrangler@4 deploy/);
  assert.doesNotMatch(workflow, /VERCEL_DEPLOY_HOOK_URL/);
  assert.equal(existsSync(join(root, '.github/workflows/vercel-production.yml')), false);

  const deployed = new Set();
  for (const entry of readdirSync(join(root, 'api'), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== '_lib') {
      for (const nested of readdirSync(join(root, 'api', entry.name))) {
        if (nested.endsWith('.js')) deployed.add(`/api/${entry.name}/${nested.replace(/\[|\]|\.js/g, '')}`.replace(/\/kind$/, ''));
      }
    } else if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== '[resource].js') {
      deployed.add(`/api/${entry.name.replace('.js', '')}`);
    }
  }
  const source = readFileSync(join(root, 'worker/handlers.mjs'), 'utf8');
  for (const path of deployed) assert.match(source, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('the Worker entry serves redirects and unknown APIs from the real handlers', async () => {
  const worker = (await import('../worker/index.js')).default;
  const redirect = await worker.fetch(new Request('https://stargate.example/viz-dashboard/nested'), {});
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), '/choropleth/');
  const missing = await worker.fetch(new Request('https://stargate.example/api/unknown-resource'), {});
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { ok: false, error: 'not_found' });
  const previous = process.env.VERCEL_REGION;
  const previousCron = process.env.CRON_SECRET;
  try {
    const customs = await worker.fetch(new Request('https://stargate.example/api/customs'), { VERCEL_REGION: 'icn1' });
    assert.equal(customs.status, 400);
    assert.equal(customs.headers.get('x-proxy-region'), 'icn1');
    delete process.env.CRON_SECRET;
    await assert.rejects(() => worker.scheduled({}, {}), /daily-collect HTTP 401/);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_REGION;
    else process.env.VERCEL_REGION = previous;
    if (previousCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCron;
  }
});
