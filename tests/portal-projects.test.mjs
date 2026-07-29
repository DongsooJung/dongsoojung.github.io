import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterProjects,
  matchesProject,
  normalizeQuery,
} from '../assets/portal-projects-core.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(
  readFileSync(join(root, 'assets/projects.json'), 'utf8'),
);

test('projects.json has unique ids and required fields', () => {
  const ids = new Set();
  assert.ok(Array.isArray(catalog.projects));
  assert.ok(catalog.projects.length >= 20);
  for (const project of catalog.projects) {
    assert.ok(project.id, 'missing id');
    assert.ok(!ids.has(project.id), `duplicate id ${project.id}`);
    ids.add(project.id);
    assert.ok(project.title);
    assert.ok(project.subtitle);
    assert.ok(Array.isArray(project.categories));
    assert.equal(typeof project.hiddenByDefault, 'boolean');
    if (project.kind !== 'article') {
      assert.ok(project.href);
    }
  }
});

test('normalizeQuery collapses whitespace', () => {
  assert.equal(normalizeQuery('  KOI   Coach '), 'koi coach');
});

test('default view hides hiddenByDefault projects', () => {
  const visible = filterProjects(catalog.projects, { showHidden: false });
  assert.ok(visible.every((p) => !p.hiddenByDefault));
  assert.ok(visible.some((p) => p.id === 'cybersecurity'));
  assert.ok(!visible.some((p) => p.id === 'quote-maker'));
  assert.ok(!visible.some((p) => p.id === 'hwaseong-real-estate'));
});

test('showHidden reveals collapsed projects', () => {
  const visible = filterProjects(catalog.projects, { showHidden: true });
  assert.equal(visible.length, catalog.projects.length);
  assert.ok(visible.some((p) => p.id === 'quote-maker'));
});

test('category and search filters combine', () => {
  const education = filterProjects(catalog.projects, {
    category: 'education',
    showHidden: true,
  });
  assert.ok(education.every((p) => p.categories.includes('education')));
  assert.ok(education.some((p) => p.id === 'koi-coach'));

  const search = filterProjects(catalog.projects, {
    query: '나라장터',
    showHidden: true,
  });
  assert.ok(search.length >= 2);
  assert.ok(search.every((p) => matchesProject(p, { query: '나라장터' })));
});

test('title sort is deterministic', () => {
  const sorted = filterProjects(catalog.projects, {
    showHidden: true,
    sort: 'title',
  });
  const titles = sorted.map((p) => p.title);
  const expected = titles.slice().sort((a, b) => a.localeCompare(b, 'ko'));
  assert.deepEqual(titles, expected);
});
