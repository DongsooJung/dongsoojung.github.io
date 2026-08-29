const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'strategy/q3-45day/app.js'), 'utf8');
const page = fs.readFileSync(path.join(repo, 'strategy/q3-45day/index.html'), 'utf8');
const hub = fs.readFileSync(path.join(repo, 'strategy/index.html'), 'utf8');
const sandbox = {};
vm.runInNewContext(source.slice(0, source.indexOf("  const root =")) + '\nthis.plan = { areas, sprints }; })();', sandbox);
const tasks = sandbox.plan.sprints.flatMap(s => s.tasks);
const home = tasks.filter(t => t[0].startsWith('q3-home-'));

test('preserve the 38 original IDs and add five unique homepage tasks', () => {
  assert.equal(tasks.length, 43);
  assert.equal(new Set(tasks.map(t => t[0])).size, 43);
  for (let i = 1; i <= 38; i++) assert.ok(tasks.some(t => t[0] === `q3-${String(i).padStart(2, '0')}`));
  assert.equal(sandbox.plan.areas.length, 7);
  assert.equal(home.length, 5);
  assert.equal(home.filter(t => t[2] === 'P1').length, 3);
  assert.equal(home.filter(t => t[2] === 'P2').length, 2);
});
test('unknown homepage status never becomes a completed historical deployment', () => {
  assert.ok(home.every(t => t[6] === '미확인'));
  assert.ok(page.includes('오늘 라이브 검증한 결과가 아닙니다'));
  assert.ok(page.includes('stargate-main/commit/b92ef42'));
  assert.ok(page.includes('TLS 신뢰 오류'));
  assert.ok(page.includes('계정 인증·앱 등록 현재 상태: 미확인'));
  assert.equal(tasks.filter(t => t[1] === 'Android').length, 8);
  assert.ok(!page.includes('mailto:'));
});
test('new deadlines belong to their sprint and every task has a supported priority/status', () => {
  for (const s of sandbox.plan.sprints) for (const t of s.tasks) {
    const due = `2026-${t[3].replace('.', '-')}`;
    assert.ok(due >= s.start && due <= s.end, t[0]);
    assert.ok(['P0', 'P1', 'P2'].includes(t[2]));
    assert.ok(['미확인', '예정', '진행중', '완료', '보류'].includes(t[6]));
  }
});
test('MegaStudy submission uses the confirmed August 16 deadline', () => {
  const submission = tasks.find(t => t[0] === 'q3-05');
  assert.equal(submission[3], '08.16');
  assert.ok(submission[5].includes('내부 제출 목표 12:00'));
  assert.equal(sandbox.plan.sprints.find(s => s.tasks.includes(submission)).no, 'S0');
  assert.ok(page.includes('실제 마감 · 내부 12:00'));
  assert.ok(!page.includes('내부 제출선</span><strong>08.21'));
});
test('hub integrates one Q3 card and links to the existing homepage workstream', () => {
  assert.equal((hub.match(/href="\/strategy\/q3-45day\/" data-card/g) || []).length, 1);
  assert.ok(hub.includes('/strategy/q3-45day/#homepage-ops'));
  assert.ok(hub.includes('43개 실행과제'));
  for (const t of home) assert.ok(page.includes(`href="#${t[0]}"`));
  assert.ok(source.includes("stargate-q3-2026-status-v1"));
  assert.ok(source.includes("if (!state[t[0]]) state[t[0]] = t[6]"));
});
test('local script and style references resolve and hash links have targets', () => {
  const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  for (const t of tasks) ids.add(t[0]);
  for (const m of page.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
  for (const m of page.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g)) {
    const url = m[1];
    if (!/\.(js|css)$/.test(url) || url.startsWith('http')) continue;
    const file = url.startsWith('/') ? path.join(repo, url) : path.join(repo, 'strategy/q3-45day', url);
    assert.ok(fs.existsSync(file), file);
  }
});
