import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../assets/home-page-views.js', import.meta.url), 'utf8');

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.className = '';
  }

  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  getAttribute() { return null; }
  querySelector() { return null; }
  closest() { return null; }
}

function render(state, rows) {
  const nodes = new Map([
    ['home-page-view-panel', new Element()],
    ['home-page-view-list', new Element()],
    ['home-page-view-status', new Element()],
  ]);
  const listeners = new Map();
  const location = { origin: 'https://www.stargatekorea.net', href: 'https://www.stargatekorea.net/' };
  const context = {
    URL,
    Intl,
    window: {
      location,
      StargateUsage: {
        getLoadState: () => ({ views: state }),
        getPageViewRows: () => rows,
      },
    },
    document: {
      getElementById: (id) => nodes.get(id) || null,
      createElement: () => new Element(),
      querySelectorAll: () => [],
      addEventListener: (name, listener) => listeners.set(name, listener),
    },
  };
  runInNewContext(source, context);
  return { nodes, listeners };
}

test('home page renders capped public page-view rows and excludes private paths', () => {
  const { nodes } = render('ready', [
    { page_path: '/', page_views: 12 },
    { page_path: '/research/', page_views: 7 },
    { page_path: '/admin/visitors/', page_views: 99 },
  ]);
  const items = nodes.get('home-page-view-list').children;
  assert.equal(nodes.get('home-page-view-panel').dataset.state, 'ready');
  assert.equal(nodes.get('home-page-view-status').textContent, '최근 30일 · 연결된 사이트 도메인 합산');
  assert.equal(items.length, 2);
  assert.equal(items[0].children[1].textContent, '메인 페이지');
  assert.equal(items[0].children[2].textContent, '12회');
  assert.equal(items[1].children[1].href, '/research/');
});

test('home page does not replace an analytics error with misleading zero counts', () => {
  const { nodes } = render('error', [{ page_path: '/', page_views: 12 }]);
  assert.equal(nodes.get('home-page-view-list').children.length, 0);
  assert.match(nodes.get('home-page-view-status').textContent, /불러오지 못했습니다/);
  assert.doesNotMatch(source, /innerHTML/);
});
