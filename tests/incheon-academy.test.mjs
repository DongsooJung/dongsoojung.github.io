import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Incheon counts reconcile and contain only public aggregates', () => {
  const data = JSON.parse(read('data/academy/incheon.json'));
  assert.equal(data.period, '2026-08-01');
  assert.equal(data.districts.length, 9);
  assert.equal(data.districts.flatMap(g => g.members).length, 11);
  assert.equal(data.validation.inputRows, 74061);
  assert.equal(data.validation.unmappedRows, 0);
  assert.equal(data.validation.sheetCount, 10);
  for (const metric of ['academyCount','teachingRoomCount','total']) assert.equal(data.totals[metric], data.districts.reduce((sum,g) => sum + g[metric], 0));
  assert.equal(data.totals.total, 6839);
  assert.equal(data.totals.academyCount + data.totals.teachingRoomCount, data.totals.total);
  assert.equal(data.validation.duplicateCourseRows + data.totals.total, data.validation.inputRows);
  assert.equal(data.source.sha256.length, 64);
  for (const group of data.districts) {
    assert.deepEqual(Object.keys(group).sort(), ['code','name','members','academyCount','teachingRoomCount','total'].sort());
    assert.equal(group.academyCount + group.teachingRoomCount, group.total);
    for (const key of ['academyCount','teachingRoomCount','total']) assert.ok(Number.isSafeInteger(group[key]) && group[key] >= 0);
  }
  assert.match(data.definition, /등록번호·운영상태/);
  assert.match(data.boundary.note, /현행 행정경계가 아님/);
});

test('every reference polygon joins to a documented comparison area', () => {
  const data = JSON.parse(read('data/academy/incheon.json'));
  const geo = JSON.parse(read(data.boundary.path.slice(1)));
  assert.equal(geo.features.length, 10);
  assert.deepEqual(new Set(geo.features.map(f => f.properties.code)), new Set(data.districts.map(g => g.code)));
  assert.equal(data.boundary.version, '2013');
  assert.ok(geo.features.every(f => ['Polygon','MultiPolygon'].includes(f.geometry.type)));
});

test('prerendered pages expose counts, caveats and working links', () => {
  for (const path of ['incheon-academy-map/index.html','research/urban-atlas/index.html','sudogwon-academy-map/index.html']) {
    const html = read(path);
    assert.match(html, /6,839/);
    assert.match(html, /2026-08-01/);
    assert.match(html, /9개 비교권역/);
    assert.doesNotMatch(html, /인천은 데이터 확보 전까지|인천 10개 군·구는 데이터 확보 후/);
  }
  assert.match(read('incheon-academy-map/index.html'), /<table>/);
  assert.match(read('research/urban-atlas/index.html'), /href="\/incheon-academy-map\/"/);
  assert.match(read('sitemap.xml'), /https:\/\/stargateedu.co.kr\/incheon-academy-map\//);
  assert.doesNotMatch(read('sudogwon-academy-map/index.html'), /총 59,492/);
});

test('new browser script and retained inline map parse', () => {
  new vm.Script(read('assets/incheon-academy.js'));
  for (const match of read('sudogwon-academy-map/index.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
