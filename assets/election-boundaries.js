/* Use a complete source at a time; partial layers can overlap older cached geometry. */
(function (root) {
  'use strict';
  function validateCollection(collection, mapping) {
    const expected = Object.keys(mapping), features = collection?.features;
    if (collection?.type !== 'FeatureCollection' || !Array.isArray(features) || features.length !== expected.length) return false;
    const names = new Set(), codes = new Set();
    function ringValid(ring) {
      return Array.isArray(ring) && ring.length >= 4 && ring.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] >= 124 && p[0] <= 132 && p[1] >= 33 && p[1] <= 39)
        && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
    }
    for (const f of features) {
      const p = f.properties || {}, name = p.emd_nm, code = p.emd_cd;
      if (!Object.hasOwn(mapping, name) || names.has(name) || !/^\d{10}$/.test(String(code)) || codes.has(String(code)) || p.district !== mapping[name]) return false;
      const g = f.geometry;
      const polygons = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : null;
      if (!polygons?.length || !polygons.every(poly => Array.isArray(poly) && poly.length > 0 && poly.every(ringValid))) return false;
      names.add(name); codes.add(String(code));
    }
    return true;
  }
  function chooseCollection(api, cached, mapping) {
    if (validateCollection(api, mapping)) return {...api, source: 'VWorld API · 목록 전체 일치 · 원자료 버전 미확인', sourceMode: 'api'};
    if (validateCollection(cached, mapping)) return {...cached, source: '저장 경계 · 원자료 버전 미확인', sourceMode: 'cache'};
    throw new Error('Complete, internally consistent boundary source unavailable');
  }
  const api = {validateCollection, chooseCollection};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ElectionBoundaries = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
