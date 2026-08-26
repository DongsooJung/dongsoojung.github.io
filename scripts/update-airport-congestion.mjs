import fs from 'node:fs/promises';
import path from 'node:path';

const key = process.env.DATA_GO_KR_API_KEY;
if (!key) {
  console.log('DATA_GO_KR_API_KEY is not configured; keeping the last snapshot.');
  process.exit(0);
}

const decodeKey = value => {
  try { return decodeURIComponent(value); } catch { return value; }
};

async function requestJson(url, params) {
  const query = new URLSearchParams({ ...params, serviceKey: decodeKey(key) });
  const response = await fetch(`${url}?${query}`, { headers: { accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  try { return JSON.parse(text); }
  catch { throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 160)}`); }
}

function itemsOf(payload) {
  const body = payload?.response?.body ?? payload?.body ?? payload;
  const items = body?.items?.item ?? body?.items ?? [];
  return Array.isArray(items) ? items : items ? [items] : [];
}

const forecastUrl = 'https://apis.data.go.kr/B551177/PassengerNoticeKR/getfPassengerNoticeIKR';
const arrivalUrl = 'https://apis.data.go.kr/B551177/StatusOfArrivals/getArrivalsCongestion';

const [todayRaw, tomorrowRaw, t1Raw, t2Raw] = await Promise.all([
  requestJson(forecastUrl, { selectdate: '0', type: 'json' }),
  requestJson(forecastUrl, { selectdate: '1', type: 'json' }),
  requestJson(arrivalUrl, { numOfRows: '100', pageNo: '1', terno: 'T1', type: 'json' }),
  requestJson(arrivalUrl, { numOfRows: '100', pageNo: '1', terno: 'T2', type: 'json' })
]);

const now = new Date();
const snapshot = {
  status: 'ok',
  generated_at: now.toISOString(),
  generated_at_kst: new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(now),
  source: 'Incheon International Airport Corporation / data.go.kr',
  forecast: { today: itemsOf(todayRaw), tomorrow: itemsOf(tomorrowRaw) },
  arrivals: [...itemsOf(t1Raw), ...itemsOf(t2Raw)]
};

if (!snapshot.forecast.today.length && !snapshot.forecast.tomorrow.length) {
  throw new Error('Passenger forecast API returned no rows. Check API permission and response schema.');
}

const output = path.join(process.cwd(), 'research/airport-congestion/data/latest.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Saved ${snapshot.forecast.today.length} today rows, ${snapshot.forecast.tomorrow.length} tomorrow rows, and ${snapshot.arrivals.length} arrival rows.`);
