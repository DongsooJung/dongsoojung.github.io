const AIRPORT_BASE = 'https://www.airport.kr';
const FORECAST_PATH = '/ap_ko/883/subview.do';
const WAITING_PATH = '/pgn/ap_ko/passengerNoticeApiData.do';
const STATIC_FALLBACK = 'https://www.stargateedu.co.kr/research/airport-congestion/data/latest.json';
const STALE_AFTER_MINUTES = 20;

let lastGoodSnapshot = null;

function kstDate(offsetDays = 0, now = Date.now()) {
  const date = new Date(now + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}${get('month')}${get('day')}`;
}

function stripTags(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberCell(value) {
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function parseForecastHtml(html, terminal) {
  const table = String(html).match(/<table[^>]*id=["']userEx["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) throw new Error(`${terminal} passenger forecast table was not found.`);

  const rows = [];
  for (const match of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map((cell) => stripTags(cell[1]));
    const time = cells[0]?.match(/^(\d{2})\s*~\s*(\d{2})시$/);
    if (!time) continue;
    const values = cells.slice(1).map(numberCell);
    const row = { atime: `${time[1]}_${time[2]}` };
    if (terminal === 'T1') {
      if (values.length < 11) continue;
      Object.assign(row, {
        t1ag1: values[0], t1ag2: values[1], t1ag3: values[2], t1ag4: values[3],
        t1sumset1: values[4],
        t1dg1: values[5], t1dg2: values[6], t1dg3: values[7], t1dg4: values[8], t1dg5: values[9],
        t1sumset2: values[10],
      });
    } else {
      if (values.length < 6) continue;
      Object.assign(row, {
        t2ag1: values[0], t2ag2: values[1], t2sumset1: values[2],
        t2dg1: values[3], t2dg2: values[4], t2sumset2: values[5],
      });
    }
    rows.push(row);
  }
  if (rows.length !== 24) throw new Error(`${terminal} passenger forecast returned ${rows.length} rows.`);
  return rows;
}

function mergeTerminalRows(t1Rows, t2Rows) {
  const t2ByTime = new Map(t2Rows.map((row) => [row.atime, row]));
  return t1Rows.map((row) => ({ ...row, ...(t2ByTime.get(row.atime) || {}) }));
}

function validateSnapshot(snapshot) {
  if (snapshot?.status !== 'ok') throw new Error('Airport snapshot status is not ok.');
  if (snapshot?.forecast?.today?.length !== 24 || snapshot?.forecast?.tomorrow?.length !== 24) {
    throw new Error('Airport forecast must contain 24 rows for today and tomorrow.');
  }
  if (!Array.isArray(snapshot?.waiting) || snapshot.waiting.length < 1) {
    throw new Error('Airport waiting data is empty.');
  }
  return snapshot;
}

function freshness(snapshot, now = Date.now()) {
  const generated = Date.parse(snapshot?.generated_at || '');
  const ageMinutes = Number.isFinite(generated) ? Math.max(0, Math.floor((now - generated) / 60_000)) : null;
  return {
    age_minutes: ageMinutes,
    stale_after_minutes: STALE_AFTER_MINUTES,
    stale: ageMinutes == null || ageMinutes > STALE_AFTER_MINUTES,
  };
}

async function airportFetch(pathname, params) {
  const url = new URL(pathname, AIRPORT_BASE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: pathname === WAITING_PATH ? 'application/json' : 'text/html,application/xhtml+xml',
      referer: `${AIRPORT_BASE}${FORECAST_PATH}`,
      'user-agent': 'STARGATE Airport Congestion API/2.0',
    },
  });
  if (!response.ok) throw new Error(`Airport upstream HTTP ${response.status}`);
  return response;
}

async function fetchForecast(terminal, date) {
  const response = await airportFetch(FORECAST_PATH, { selTm: terminal, pday: date });
  return parseForecastHtml(await response.text(), terminal);
}

async function fetchWaiting(terminal) {
  const response = await airportFetch(WAITING_PATH, { tmnlId: terminal === 'T1' ? '1' : '2' });
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : payload?.data ?? payload?.result ?? [];
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${terminal} departure waiting data was empty.`);
  return rows.map((row) => ({
    terminal,
    gate_id: String(row.gateId ?? '').trim(),
    gate_status: String(row.gateStts ?? '').trim(),
    wait_minutes: row.wtngTm === '-' || row.wtngTm == null ? null : numberCell(row.wtngTm),
    waiting_people: row.wtngPrsnm === '-' || row.wtngPrsnm == null ? null : numberCell(row.wtngPrsnm),
    operating_from: String(row.operBgngTm ?? '').trim(),
    operating_to: String(row.operEndTm ?? '').trim(),
    observed_at: String(row.ocrTm ?? '').trim(),
  }));
}

async function collectLiveSnapshot(now = new Date()) {
  const today = kstDate(0, now.getTime());
  const tomorrow = kstDate(1, now.getTime());
  const [todayT1, todayT2, tomorrowT1, tomorrowT2, waitingT1, waitingT2] = await Promise.all([
    fetchForecast('T1', today), fetchForecast('T2', today),
    fetchForecast('T1', tomorrow), fetchForecast('T2', tomorrow),
    fetchWaiting('T1'), fetchWaiting('T2'),
  ]);
  return validateSnapshot({
    status: 'ok',
    generated_at: now.toISOString(),
    generated_at_kst: new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).format(now),
    source: 'Incheon International Airport Corporation',
    source_urls: {
      forecast: `${AIRPORT_BASE}${FORECAST_PATH}`,
      departure_waiting: `${AIRPORT_BASE}/ap_ko/6651/subview.do`,
    },
    forecast_dates: { today, tomorrow },
    forecast: {
      today: mergeTerminalRows(todayT1, todayT2),
      tomorrow: mergeTerminalRows(tomorrowT1, tomorrowT2),
    },
    waiting: [...waitingT1, ...waitingT2],
  });
}

async function fetchStaticFallback() {
  const response = await fetch(`${STATIC_FALLBACK}?fallback=${Date.now()}`, {
    cache: 'no-store', signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Static fallback HTTP ${response.status}`);
  return validateSnapshot(await response.json());
}

function setHeaders(res, fallback = false) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.setHeader('Vercel-CDN-Cache-Control', fallback
    ? 'public, max-age=60, stale-while-revalidate=1200'
    : 'public, max-age=300, stale-while-revalidate=1200');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setHeaders(res);
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    setHeaders(res);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const snapshot = await collectLiveSnapshot();
    lastGoodSnapshot = snapshot;
    setHeaders(res);
    return res.status(200).json({
      ...snapshot,
      delivery: { mode: 'live', fallback: false, region: process.env.VERCEL_REGION || 'local', ...freshness(snapshot) },
    });
  } catch (liveError) {
    try {
      const snapshot = lastGoodSnapshot || await fetchStaticFallback();
      setHeaders(res, true);
      return res.status(200).json({
        ...snapshot,
        delivery: {
          mode: lastGoodSnapshot ? 'memory_fallback' : 'static_fallback',
          fallback: true,
          region: process.env.VERCEL_REGION || 'local',
          ...freshness(snapshot),
        },
      });
    } catch (fallbackError) {
      setHeaders(res, true);
      return res.status(502).json({
        ok: false,
        error: 'airport_data_unavailable',
        message: '실시간 및 마지막 정상 인천공항 데이터를 모두 불러오지 못했습니다.',
      });
    }
  }
}

export const __test = {
  STALE_AFTER_MINUTES, kstDate, numberCell, parseForecastHtml, mergeTerminalRows, validateSnapshot, freshness,
};
