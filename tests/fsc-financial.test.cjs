const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

async function dashboard() {
  const nodes = new Map(), charts = [], downloads = [], blobs = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id, value: '', dataset: {}, textContent: '', innerHTML: '', children: [],
      classList: { add() {}, toggle() {} }, listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      appendChild(child) { this.children.push(child); },
    });
    return nodes.get(id);
  };
  class Chart {
    static defaults = { font: {} };
    constructor(canvas, config) { charts.push({ id: canvas.id, config }); }
    destroy() {}
  }
  const row = (id, curCd, sales) => ({ crno: id, curCd, bizYear: '2023', enpSaleAmt: sales,
    enpCrtmNpf: sales / 10, enpTastAmt: sales * 2, fnclDebtRto: 20, basDt: '20231231' });
  const seed = { bizYear: '2023', totalCount: 99999, fetchedAt: '2026-07-26T20:33:58Z',
    items: [row('KR1', 'KRW', 100000000), row('KR2', 'KRW', 300000000), row('CN1', 'CNY', 9e15)] };
  const context = {
    document: { getElementById: node, querySelectorAll: () => [],
      createDocumentFragment: () => ({ children: [], appendChild(child) { this.children.push(child); } }),
      createElement: tag => tag === 'a' ? { click() { downloads.push(this.download); } } : { innerHTML: '' },
    }, Chart, localStorage: { getItem: () => null },
    fetch: async () => ({ ok: true, json: async () => seed }),
    Blob: class { constructor(parts) { blobs.push(parts.join('')); } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    URLSearchParams, Intl, Date, console,
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../fsc-financial/app.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { node, charts, downloads, blobs };
}

test('foreign currency cannot change won medians or enter won charts', async () => {
  const d = await dashboard();
  assert.equal(d.node('kpiCount').textContent, '3');
  assert.equal(d.node('kpiSales').textContent, '2.0억');
  const bar = d.charts.find(x => x.id === 'chartSales');
  assert.deepEqual(Array.from(bar.config.data.datasets[0].data), [3, 1]);
  const scatter = d.charts.find(x => x.id === 'chartScatter');
  assert.equal(scatter.config.data.datasets[0].data.length, 2);
  const rows = d.node('tbody').children[0].children.map(x => x.innerHTML).join('');
  assert.match(rows, /CNY/);
  assert.match(rows, /9,000,000,000,000,000 CNY/);
  assert.equal(d.node('nextBtn').disabled, true);
});

test('CSV keeps the displayed year, currencies and collection time when query input changes', async () => {
  const d = await dashboard();
  d.node('bizYear').value = '2026';
  d.node('csvBtn').listeners.click();
  assert.match(d.downloads[0], /2023_historical_snapshot_unverified/);
  assert.match(d.blobs[0], /curCd,basDt,source_mode,collected_at/);
  assert.match(d.blobs[0], /CNY,20231231,historical_snapshot_unverified,2026-07-26T20:33:58Z/);
  assert.doesNotMatch(d.node('status').textContent, /2026년 사업연도/);
});
