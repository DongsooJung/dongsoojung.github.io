import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseArgs, sanitizeHtml, normalizeAnswer, compareAnswers, reportMarkdown, decodeEntities,
  safeSlug, escapeText,
} from '../scripts/content-drafts/generate-drafts.mjs';

test('parseArgs defaults and bounds', () => {
  assert.equal(parseArgs([]).count, 1);
  assert.equal(parseArgs(['--count', '3', '--topic', ' parity ']).topic, 'parity');
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.throws(() => parseArgs(['--count', '9']));
  assert.throws(() => parseArgs(['--publish']));
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

test('script only ever creates WordPress drafts', () => {
  const src = readFileSync(new URL('../scripts/content-drafts/generate-drafts.mjs', import.meta.url), 'utf8');
  assert.match(src, /const WP_STATUS = 'draft'/);
  assert.doesNotMatch(src, /status:\s*'publish'/);
});
