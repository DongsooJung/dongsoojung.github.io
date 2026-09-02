import fs from 'node:fs/promises';
import path from 'node:path';

const OUTPUT = path.join(process.cwd(), 'research/gimpo-airport-congestion/data/latest.json');
const API_BASES = [
  'https://api.odcloud.kr/api/getAPRTPsgrCongestion/v1/aprtPsgrCongestion',
  'https://api.odcloud.kr/api/getAPRTPsgrCongestion_v2/v1/aprtPsgrCongestion\u200bV2',
  'https://api.odcloud.kr/api/getAPRTPsgrCongestion_v2/v1/aprtPsgrCongestionV2',
];
const LEVELS = { 0: '정보 없음', 1: '원활', 2: '보통', 3: '혼잡', 4: '매우 혼잡' };
const ZONES = [
  ['A', '1구간', '체크인 → 신분확인', 'CGDR_A_LVL'],
  ['B', '2구간', '신분확인 → 보안검색', 'CGDR_B_LVL'],
  ['C', '3구간', '보안검색 → 항공기 탑승', 'CGDR_C_LVL'],
];

function kstLabel(date = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
}

function encodedKey(value) {
  const key = String(value || '').trim();
  return /%[0-9A-F]{2}/i.test(key) ? key : encodeURIComponent(key);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function collect() {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) {
    console.log('DATA_GO_KR_API_KEY is not configured; keeping the pending snapshot.');
    return;
  }

  const query = new URLSearchParams({ page: '1', perPage: '100', returnType: 'JSON' });
  query.set('cond[IATA_APCD::EQ]', 'GMP');
  let payload;
  let sourceEndpoint;
  let lastError;

  for (const base of API_BASES) {
    const url = `${base}?serviceKey=${encodedKey(key)}&${query}`;
    try {
      payload = await fetchJson(url);
      sourceEndpoint = base;
      break;
    } catch (error) {
      lastError = error;
      console.warn(`Gimpo congestion endpoint failed: ${error.message}`);
    }
  }

  const rows = Array.isArray(payload?.data) ? payload.data.filter(row => row?.IATA_APCD === 'GMP') : [];
  if (!rows.length) {
    console.log(`No Gimpo record returned; keeping the last snapshot. ${lastError?.message || ''}`);
    return;
  }

  const item = rows.at(-1);
  const level = Number(item.CGDR_ALL_LVL);
  const generated = new Date();
  const snapshot = {
    status: 'ok',
    generated_at: generated.toISOString(),
    generated_at_kst: kstLabel(generated),
    source: '한국공항공사 공항 혼잡도 정보_GW',
    source_url: 'https://www.data.go.kr/data/15159598/openapi.do',
    source_endpoint: sourceEndpoint,
    airport: { code: 'GMP', name: '김포국제공항', terminal: '국내선' },
    observed_at: String(item.PRC_HR || ''),
    overall: { level, text: LEVELS[level] || '정보 없음' },
    zones: ZONES.map(([id, name, route, field]) => {
      const zoneLevel = Number(item[field]);
      return { id, name, route, level: zoneLevel, text: LEVELS[zoneLevel] || '정보 없음' };
    }),
    record_count: rows.length,
    message: '한국공항공사 공식 혼잡도 데이터를 10분 주기로 갱신합니다.',
  };

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUTPUT}: ${snapshot.overall.text}`);
}

collect().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
