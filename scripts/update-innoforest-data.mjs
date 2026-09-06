import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API_URL = 'https://live-api.innoforest.co.kr/dataroom/v1/corporations?page=1&limit=100';
const OUTPUT_URL = new URL('../strategy/innoforest/data/latest.json', import.meta.url);

function collectedAtKst() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:${value.second}+09:00`;
}

const response = await fetch(API_URL, { headers: { accept: 'application/json' } });
if (!response.ok) throw new Error(`혁신의숲 API 응답 오류: ${response.status}`);

const source = await response.json();
if (!Array.isArray(source.content) || source.content.length !== 100) {
  throw new Error(`예상한 100개 대신 ${source.content?.length ?? 0}개를 받았습니다.`);
}

const companies = source.content.map((company, index) => {
  const revenueWon = Number(company.revenueValue);
  const revenueEok = Number.isFinite(revenueWon) && company.revenueValue !== null
    ? revenueWon / 100_000_000
    : null;

  return {
    rank: index + 1,
    id: company.corporationId,
    name: company.corporationName,
    product: company.productName ?? '',
    revenue: revenueEok === null
      ? null
      : `${revenueEok.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`,
    revenue_krw_100m: revenueEok,
    employees: company.employeeCount === null ? null : `${company.employeeCount.toLocaleString('ko-KR')}명`,
    employee_count: company.employeeCount ?? null,
    source_url: `https://www.innoforest.co.kr/company/${company.corporationId}/${encodeURIComponent(company.corporationName)}`
  };
});

const payload = {
  source: {
    name: '혁신의 숲',
    url: 'https://www.innoforest.co.kr/dataroom',
    view: '데이터룸 · 기업조회(전일 기준) · 1페이지',
    collected_at: collectedAtKst(),
    page_size: 100,
    total_companies: source.totalElementCount,
    note: '공개 데이터룸 1페이지를 100개 단위로 수집했습니다. 비로그인 공개 화면에서 제공하지 않는 값은 비공개로 표시됩니다.'
  },
  companies
};

await writeFile(fileURLToPath(OUTPUT_URL), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`혁신의숲 기업 ${companies.length}개를 저장했습니다.`);
