import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OPERATIONS, buildUrl, kstYmdHm, newestNotices, normalize, parsePayload } from './bidpublic-lib.mjs';

const key = String(process.env.PPS_BIDPUBLIC_API_KEY || process.env.PPS_SCSBID_API_KEY || process.env.DATA_GO_KR_API_KEY || '').trim();
if (!key) throw new Error('PPS_BIDPUBLIC_API_KEY 또는 공통 조달청 인증키가 필요합니다.');

const now = new Date(); const start = new Date(now.getTime() - 30 * 86400000); const outputDir = resolve('data/bidpublic');
await mkdir(outputDir, { recursive: true });

async function fetchPage(config, pageNo, numOfRows) {
  const url = buildUrl(config.path, { pageNo, numOfRows, type: 'json', inqryDiv: 1, inqryBgnDt: kstYmdHm(start), inqryEndDt: kstYmdHm(now) }, key);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json, text/xml, */*', 'User-Agent': 'stargate-bidpilot-collector/1.0' } });
      const text = await response.text();
      if (!response.ok) throw new Error(`${config.label} 입찰공고 HTTP ${response.status}`);
      return parsePayload(text);
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1500));
    }
  }
}

for (const [kind, config] of Object.entries(OPERATIONS)) {
  const probe = await fetchPage(config, 1, 1);
  const totalCount = probe.totalCount || probe.items.length;
  const lastPage = Math.max(1, Math.ceil(totalCount / 100));
  const pageNumbers = lastPage > 1 ? [lastPage - 1, lastPage] : [lastPage];
  const pages = [];
  for (const pageNo of pageNumbers) pages.push(await fetchPage(config, pageNo, 100));
  const normalized = pages.flatMap((page) => page.items.map((row) => normalize(row, kind)));
  const items = newestNotices(normalized, 100);
  const payload = { ok: true, kind, kindLabel: config.label, days: 30, snapshotLimit: 100, rowCount: items.length, sourceTotalCount: totalCount, sort: 'noticeAt-desc', items, source: '조달청 나라장터 입찰공고정보서비스', updatedAt: now.toISOString() };
  await writeFile(resolve(outputDir, `${kind}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`${config.label}: ${items.length}건`);
}
