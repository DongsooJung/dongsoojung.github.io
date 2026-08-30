import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OPERATIONS, buildUrl, kstYmdHm, normalize, parsePayload } from './scsbid-lib.mjs';

const key = String(process.env.PPS_SCSBID_API_KEY || process.env.DATA_GO_KR_API_KEY || '').trim();
if (!key) throw new Error('PPS_SCSBID_API_KEY 또는 DATA_GO_KR_API_KEY가 필요합니다.');

const now = new Date();
const start = new Date(now.getTime() - 30 * 86400000);
const outputDir = resolve('data/scsbid');
await mkdir(outputDir, { recursive: true });

for (const [kind, config] of Object.entries(OPERATIONS)) {
  const url = buildUrl(config.path, { pageNo: 1, numOfRows: 100, type: 'json', inqryDiv: 1, inqryBgnDt: kstYmdHm(start), inqryEndDt: kstYmdHm(now) }, key);
  const response = await fetch(url, { headers: { Accept: 'application/json, text/xml, */*', 'User-Agent': 'stargate-bidpilot-collector/1.0' } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${config.label} 낙찰정보 HTTP ${response.status}`);
  const parsed = parsePayload(text);
  const items = parsed.items.map((row) => normalize(row, kind)).filter((item) => item.noticeNo && item.title);
  const payload = { ok: true, kind, kindLabel: config.label, days: 30, snapshotLimit: 100, rowCount: items.length, sourceTotalCount: parsed.totalCount || items.length, items, source: '조달청 나라장터 낙찰정보서비스', updatedAt: now.toISOString() };
  await writeFile(resolve(outputDir, `${kind}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`${config.label}: ${items.length}건`);
}
