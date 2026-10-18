import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';
import { OPERATIONS, buildUrl, kstYmdHm, newestNotices, normalize, parsePayload } from './bidpublic-lib.mjs';
import { retryWithBackoff, loadExistingData, validateData } from '../.github/lib/collector-utils.mjs';

setGlobalDispatcher(new Agent({ connect: { timeout: 30000 } }));

const key = String(process.env.PPS_BIDPUBLIC_API_KEY || process.env.PPS_SCSBID_API_KEY || process.env.DATA_GO_KR_API_KEY || '').trim();
if (!key) throw new Error('PPS_BIDPUBLIC_API_KEY 또는 공통 조달청 인증키가 필요합니다.');

const now = new Date(); const start = new Date(now.getTime() - 30 * 86400000); const outputDir = resolve('data/bidpublic');
await mkdir(outputDir, { recursive: true });

let anyFailed = false;

async function fetchPage(config, pageNo, numOfRows) {
  return retryWithBackoff(
    async () => {
      const url = buildUrl(config.path, { pageNo, numOfRows, type: 'json', inqryDiv: 1, inqryBgnDt: kstYmdHm(start), inqryEndDt: kstYmdHm(now) }, key);
      const response = await fetch(url, { 
        headers: { Accept: 'application/json, text/xml, */*', 'User-Agent': 'stargate-bidpilot-collector/1.0' },
        signal: AbortSignal.timeout(45000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${config.label} 입찰공고 HTTP ${response.status}`);
      return parsePayload(text);
    },
    { maxAttempts: 4, baseDelayMs: 3000, label: `조달청 입찰공고 ${config.label} page ${pageNo}` }
  );
}

for (const [kind, config] of Object.entries(OPERATIONS)) {
  const outputPath = resolve(outputDir, `${kind}.json`);
  
  try {
    const probe = await fetchPage(config, 1, 1);
    const totalCount = probe.totalCount || probe.items.length;
    const lastPage = Math.max(1, Math.ceil(totalCount / 100));
    const pageNumbers = lastPage > 1 ? [lastPage - 1, lastPage] : [lastPage];
    const pages = [];
    for (const pageNo of pageNumbers) pages.push(await fetchPage(config, pageNo, 100));
    const normalized = pages.flatMap((page) => page.items.map((row) => normalize(row, kind)));
    const items = newestNotices(normalized, 100);
    const payload = { ok: true, kind, kindLabel: config.label, days: 30, snapshotLimit: 100, rowCount: items.length, sourceTotalCount: totalCount, sort: 'noticeAt-desc', items, source: '조달청 나라장터 입찰공고정보서비스', updatedAt: now.toISOString() };
    
    const isValid = validateData(payload, (data) => data.ok && Array.isArray(data.items));
    
    if (!isValid) {
      console.warn(`${config.label}: 유효하지 않은 데이터, 기존 파일 유지`);
      const existing = await loadExistingData(outputPath);
      if (existing) {
        console.log(`${config.label}: 기존 데이터 유지됨`);
        continue;
      } else {
        throw new Error(`${config.label}: 유효하지 않은 데이터이며 기존 파일도 없음`);
      }
    }
    
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`${config.label}: ${items.length}건`);
  } catch (error) {
    console.error(`${config.label} 수집 실패:`, error.message);
    anyFailed = true;
    const existing = await loadExistingData(outputPath);
    if (existing) {
      console.log(`${config.label}: 기존 데이터 유지됨 (수집 실패)`);
    } else {
      throw error;
    }
  }
}

if (anyFailed) {
  console.error('일부 카테고리 수집 실패 - 실패 알림을 위해 non-zero exit');
  process.exit(1);
}
