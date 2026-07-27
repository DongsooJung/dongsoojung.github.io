import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../api/lh-sale-info.js');
const { parseLhPayload, normalizeItem, encodeServiceKey, PAGE_SIZE } = mod.__test;

test('page size is 30', () => {
  assert.equal(PAGE_SIZE, 30);
});

test('encodeServiceKey avoids double encoding', () => {
  assert.equal(encodeServiceKey('abc/def'), encodeURIComponent('abc/def'));
  assert.equal(encodeServiceKey('abc%2Fdef'), 'abc%2Fdef');
});

test('parseLhPayload reads dsList array shape', () => {
  const payload = JSON.stringify([
    {
      dsList: [
        {
          PAN_ID: '2016122300001530',
          PAN_NM: '테스트 분양주택',
          UPP_AIS_TP_CD: '05',
          UPP_AIS_TP_NM: '분양주택',
          AIS_TP_CD_NM: '공공분양',
          CNP_CD_NM: '경기도',
          PAN_SS: '공고중',
          PAN_NT_ST_DT: '2026.01.01',
          CLSG_DT: '2026.02.01',
          ALL_CNT: '42',
          DTL_URL: 'https://apply.lh.or.kr/example',
        },
      ],
    },
    { dsResInfo: [{ SS_CODE: 'Y' }] },
  ]);
  const parsed = parseLhPayload(payload);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.totalCount, 42);
  const row = normalizeItem(parsed.items[0], 1);
  assert.equal(row.pan_id, '2016122300001530');
  assert.equal(row.upp_ais_tp_cd, '05');
  assert.match(row.pan_nm, /분양주택/);
});

test('parseLhPayload rejects Forbidden body', () => {
  assert.throws(() => parseLhPayload('Forbidden'), /403 Forbidden/);
});
