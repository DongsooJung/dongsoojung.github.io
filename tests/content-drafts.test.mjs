import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseArgs, sanitizeHtml, normalizeAnswer, compareAnswers, reportMarkdown, decodeEntities,
  safeSlug, escapeText, fetchExistingTitles, selectTopic, TOPICS, loadHistory,
  wordpressDraftPayload, createWpDraft,
} from '../scripts/content-drafts/generate-drafts.mjs';

test('parseArgs defaults and bounds', () => {
  assert.equal(parseArgs([]).count, 1);
  assert.equal(parseArgs(['--count', '3', '--topic', ' parity ']).topic, 'parity');
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.throws(() => parseArgs(['--count', '9']));
  assert.throws(() => parseArgs(['--publish']));
  assert.equal(parseArgs(['--require-wordpress']).requireWordPress, true);
  assert.throws(() => parseArgs(['--require-wordpress', '--dry-run']));
});

const samplePost = {
  title: 'Parity in a puzzle', slug: 'parity-in-a-puzzle', excerpt: 'A checked lesson.',
  content_html: '<p>A lesson.</p><details><summary>Solution</summary><p>2</p></details>',
  checks: [{ ok: true }],
};

test('WordPress payload stays a draft and preserves supported editable HTML', () => {
  const payload = wordpressDraftPayload(samplePost);
  assert.equal(payload.status, 'draft');
  assert.equal(payload.content, `<!-- wp:html -->\n${samplePost.content_html}\n<!-- /wp:html -->`);
  assert.match(wordpressDraftPayload({ ...samplePost, checks: [{ ok: false }] }).title, /^\[검토 필요\]/);
});

test('WordPress delivery requires an independent read of all saved raw fields', async () => {
  const calls = [];
  const payload = wordpressDraftPayload(samplePost);
  const result = await createWpDraft(samplePost, {
    site: 'example.test', user: 'editor', appPassword: 'test-password',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (options.method === 'POST') return Response.json({ id: 42, status: 'draft' });
      return Response.json({ id: 42, status: 'draft', title: { raw: payload.title }, content: { raw: payload.content }, excerpt: { raw: payload.excerpt } });
    },
  });
  assert.equal(result.contentVerified, true);
  assert.equal(result.id, 42);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].options.body).status, 'draft');
  assert.match(calls[1].url, /posts\/42\?context=edit/);
  assert.ok(calls.every(({ options }) => options.redirect === 'error' && options.signal));
});

test('WordPress delivery rejects changed status, missing or altered saved content without retrying', async () => {
  const payload = wordpressDraftPayload(samplePost);
  for (const change of [{ status: 'pending' }, { content: { raw: '<p>Truncated</p>' } }, { title: { raw: 'Changed' } }, { excerpt: {} }]) {
    let writes = 0;
    await assert.rejects(createWpDraft(samplePost, {
      site: 'example.test', user: 'editor', appPassword: 'test-password',
      fetchImpl: async (_, options) => {
        if (options.method === 'POST') { writes++; return Response.json({ id: 42, status: 'draft' }); }
        return Response.json({ id: 42, status: 'draft', title: { raw: payload.title }, content: { raw: payload.content }, excerpt: { raw: payload.excerpt }, ...change });
      },
    }), /글 42 생성 후 검증 실패.*중복 생성하지/);
    assert.equal(writes, 1);
  }
});

test('WordPress delivery refuses incomplete credentials and does not expose response bodies', async () => {
  await assert.rejects(createWpDraft(samplePost, { site: 'example.test', user: '', appPassword: '', fetchImpl: () => { throw new Error('must not fetch'); } }), /인증정보/);
  await assert.rejects(createWpDraft(samplePost, {
    site: 'example.test', user: 'editor', appPassword: 'test-password',
    fetchImpl: async () => new Response('sensitive upstream diagnostics', { status: 401 }),
  }), (error) => /HTTP 401/.test(error.message) && !error.message.includes('sensitive upstream'));
});

test('sanitizeHtml strips executable content', () => {
  const dirty = '<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">b</a><iframe src=x></iframe><details><summary>s</summary>ok</details>';
  const clean = sanitizeHtml(dirty);
  assert.doesNotMatch(clean, /script|onclick|javascript:|iframe/i);
  assert.match(clean, /<details><summary>s<\/summary>ok<\/details>/);
});

test('sanitizeHtml defeats nested and leftover markup', () => {
  for (const dirty of ['<scr<script>ipt>alert(1)</script>', '<!<!--- comment --->>', '<<script>script>x', '<img src=x onerror=a()>', 'a < b and <p>ok</p>']) {
    const clean = sanitizeHtml(dirty);
    assert.doesNotMatch(clean, /<(?!\/?p>)/, `${dirty} -> ${clean}`);
  }
  assert.equal(sanitizeHtml('a < b and <p>ok</p>'), 'a &lt; b and <p>ok</p>');
});

test('safeSlug blocks path traversal', () => {
  assert.equal(safeSlug('../../etc/passwd', 'x'), 'etc-passwd');
  assert.equal(safeSlug('Telescoping Sums!', 'x'), 'telescoping-sums');
  assert.equal(safeSlug('../', 'fallback'), 'fallback');
  assert.equal(escapeText('<b>&'), '&lt;b&gt;&amp;');
});

test('normalizeAnswer ignores spacing, dollars, trailing dot', () => {
  assert.equal(normalizeAnswer(' $12$. '), '12');
  assert.equal(normalizeAnswer('Answer: n = 4'), 'n=4');
});

test('compareAnswers flags mismatches and missing answers', () => {
  const r = compareAnswers(
    [{ statement: 'a', answer: '12' }, { statement: 'b', answer: '7' }, { statement: 'c', answer: '1' }],
    [{ answer: '12', confidence: 'high' }, { answer: '8', confidence: 'medium' }],
  );
  assert.deepEqual(r.map((x) => x.ok), [true, false, false]);
  assert.match(reportMarkdown([{ title: 'T', checks: r, servedBy: ['m'], file: 'f.html' }]), /불일치 있음/);
});

test('decodeEntities handles WordPress smart quotes', () => {
  assert.equal(decodeEntities('Don&#8217;t &amp; do'), 'Don’t & do');
});

function titleResponse(titles, pages = 1) {
  return Response.json(titles.map((title) => ({ title: { rendered: title } })), {
    headers: { 'X-WP-TotalPages': String(pages) },
  });
}

test('existing titles include every public page without sending credentials', async () => {
  const calls = [];
  const titles = await fetchExistingTitles('example.test', {
    user: '', appPassword: '',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return url.searchParams.get('page') === '1'
        ? titleResponse(['First &amp; title'], 2)
        : titleResponse(['Older title', 'First &amp; title'], 2);
    },
  });
  assert.deepEqual(titles, ['First & title', 'Older title']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ url, options }) => url.searchParams.get('status') === 'publish' && !options.headers.Authorization));
  assert.equal(calls[0].url.searchParams.get('per_page'), '100');
});

test('authenticated title lookup includes draft, pending and scheduled posts', async () => {
  const calls = [];
  const titles = await fetchExistingTitles('example.test', {
    user: 'editor', appPassword: 'test-password',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const status = url.searchParams.get('status');
      return titleResponse([`${status} title`]);
    },
  });
  assert.deepEqual(titles, ['publish title', 'draft title', 'pending title', 'future title']);
  assert.ok(calls.every(({ options }) => options.headers.Authorization === `Basic ${Buffer.from('editor:test-password').toString('base64')}`));
  assert.ok(calls.every(({ options }) => options.redirect === 'error'));
});

test('partial credentials never query unpublished posts', async () => {
  let calls = 0;
  await fetchExistingTitles('example.test', {
    user: 'editor', appPassword: '',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url.searchParams.get('status'), 'publish');
      assert.equal(options.headers.Authorization, undefined);
      return titleResponse([]);
    },
  });
  assert.equal(calls, 1);
});

test('title lookup fails rather than treating HTTP errors or malformed pages as no history', async () => {
  for (const response of [new Response('', { status: 403 }), Response.json({ error: 'bad' }), Response.json([])]) {
    await assert.rejects(fetchExistingTitles('example.test', {
      user: '', appPassword: '', fetchImpl: async () => response,
    }), /WordPress/);
  }
  await assert.rejects(fetchExistingTitles('example.test', {
    user: 'editor', appPassword: 'test-password',
    fetchImpl: async (url) => url.searchParams.get('status') === 'publish'
      ? titleResponse(['Published title']) : new Response('', { status: 401 }),
  }), /draft.*HTTP 401/);
});

test('topic rotation changes at Monday midnight KST and stays fixed within a week', () => {
  const topics = [
    { title: 'One', aliases: [] }, { title: 'Two', aliases: [] }, { title: 'Three', aliases: [] },
  ];
  const before = selectTopic([], { topics, now: new Date('2026-11-15T14:59:59Z') });
  const after = selectTopic([], { topics, now: new Date('2026-11-15T15:00:00Z') });
  assert.equal((topics.findIndex((t) => t.title === before) + 1) % topics.length, topics.findIndex((t) => t.title === after));
  assert.equal(after, selectTopic([], { topics, now: new Date('2026-11-21T12:00:00Z') }));
});

test('topic selection skips aliases, punctuation variants and earlier selections', () => {
  for (const title of ['Invariants: What Never Changes?', 'Counting Handshakes', 'Remainders', 'Area Ratios', 'Divisors', 'Rectangles', 'Digit Sums']) {
    assert.throws(() => selectTopic([title], {
      topics: [TOPICS.find((t) => t.aliases.some((a) => title.toLowerCase().includes(a)))],
    }), /모두 사용/);
  }
  assert.throws(() => selectTopic(['DOUBLE-COUNTING: A second view'], {
    topics: [{ title: 'Double counting', aliases: ['double counting'] }],
  }), /모두 사용/);
  const avoid = ['Telescoping Sums: Let the Middle Cancel'];
  const now = new Date('2026-11-17T12:00:00Z');
  for (let i = 0; i < 5; i++) {
    const selected = selectTopic(avoid, { now });
    assert.ok(!avoid.includes(selected));
    assert.doesNotMatch(selected, /telescoping/i);
    avoid.push(selected);
  }
});

test('exhausted topics require explicit selection instead of silently repeating', () => {
  assert.throws(() => selectTopic(TOPICS.map((t) => t.title)), /--topic/);
  assert.throws(() => selectTopic([], { now: new Date('bad') }), /날짜/);
});

test('saved generation history survives another run and invalid history is not ignored', async (t) => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'stargate-draft-topics-'));
  t.after(() => fs.rm(out, { recursive: true, force: true }));
  assert.deepEqual(await loadHistory(out), []);
  const history = [{ title: 'Let the Middle Cancel', topic: 'Telescoping sums' }];
  await fs.writeFile(path.join(out, 'topic-history.json'), JSON.stringify(history));
  const restored = await loadHistory(out);
  assert.deepEqual(restored, history);
  assert.throws(() => selectTopic(restored.flatMap((entry) => [entry.title, entry.topic]), {
    topics: [{ title: 'Telescoping sums', aliases: ['telescoping'] }],
  }), /모두 사용/);
  for (const content of ['bad json', '{}', '[{}]']) {
    await fs.writeFile(path.join(out, 'topic-history.json'), content);
    await assert.rejects(loadHistory(out), /주제 이력/);
  }
});

test('pure helpers load in a clean CI directory without the optional generation SDK', async (t) => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'stargate-draft-import-'));
  t.after(() => fs.rm(out, { recursive: true, force: true }));
  const modulePath = path.join(out, 'generate-drafts.mjs');
  await fs.copyFile(new URL('../scripts/content-drafts/generate-drafts.mjs', import.meta.url), modulePath);
  const helpers = await import(pathToFileURL(modulePath).href);
  assert.equal(helpers.parseArgs(['--dry-run']).dryRun, true);
  assert.equal(helpers.selectTopic([], { topics: [{ title: 'Parity', aliases: [] }] }), 'Parity');
});

test('script only ever creates WordPress drafts', () => {
  const src = readFileSync(new URL('../scripts/content-drafts/generate-drafts.mjs', import.meta.url), 'utf8');
  assert.match(src, /const WP_STATUS = 'draft'/);
  assert.doesNotMatch(src, /status:\s*'publish'/);
});
