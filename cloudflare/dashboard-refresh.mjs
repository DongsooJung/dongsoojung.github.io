// Scheduled public data collection. Upstream dates are never replaced by fetch time.
export const DASHBOARD_NAMES = ['exchange-rate', 'trade', 'urban'];
export const DASHBOARD_UPSTREAMS = {
  fx: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml',
  fxSnapshot: 'https://raw.githubusercontent.com/DongsooJung/dongsoojung.github.io/main/exchange-rate/data.json',
  trade: 'https://apis.data.go.kr/1220000/nationtrade/getNationtradeList',
  tradeSnapshot: 'https://raw.githubusercontent.com/DongsooJung/dongsoojung.github.io/main/trade/data.json',
  urban: 'https://raw.githubusercontent.com/DongsooJung/ds-research-urban-analytics/main/docs/data.json',
};
const HOUR = 3600000;
const DAY = 24 * HOUR;
const intervals = { 'exchange-rate': 6 * HOUR, trade: DAY, urban: HOUR };
const FAILURE_RETRY = 15 * 60000;
const labels = { 'exchange-rate': '환율', trade: '무역', urban: '서울 도시데이터' };
const modes = { 'exchange-rate': 'official_collection', trade: 'official_collection', urban: 'published_snapshot' };
const currencyMeta = [
  { code: 'USD', label: '미국 달러', per: 1, color: '#3987e5' },
  { code: 'JPY', label: '일본 엔', per: 100, color: '#199e70' },
  { code: 'EUR', label: '유로', per: 1, color: '#c98500' },
  { code: 'CNY', label: '중국 위안', per: 1, color: '#b06de0' },
];
class RefreshError extends Error { constructor(code) { super(code); this.code = code; } }
const iso = now => new Date(now).toISOString();
const koreanDay = now => new Date(now + 9 * HOUR).toISOString().slice(0, 10);
const round = value => Math.round(value * 100) / 100;

async function readResponse(response, maxBytes) {
  if (!response.ok) throw new RefreshError(`UPSTREAM_HTTP_${response.status}`);
  if (Number(response.headers.get('content-length')) > maxBytes) throw new RefreshError('UPSTREAM_TOO_LARGE');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new RefreshError('UPSTREAM_TOO_LARGE'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
async function getText(fetchFn, url, headers = {}, maxBytes = 12 * 1024 * 1024) {
  const response = await fetchFn(url, { headers: { Accept: 'application/json, application/xml, text/xml', ...headers }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  return readResponse(response, maxBytes);
}
async function getJSON(fetchFn, url) {
  try { return JSON.parse(await getText(fetchFn, url)); }
  catch (error) { if (error instanceof RefreshError) throw error; throw new RefreshError('UPSTREAM_INVALID_JSON'); }
}

export function parseEcbHistory(xml, now = Date.now()) {
  const monthly = new Map();
  const dates = new Set();
  let latest = null;
  for (const block of xml.matchAll(/<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g)) {
    const date = block[1], rates = {};
    if (dates.has(date)) throw new RefreshError('ECB_DUPLICATE_DATE');
    dates.add(date);
    if (date > koreanDay(now)) throw new RefreshError('UPSTREAM_FUTURE_DATE');
    for (const row of block[2].matchAll(/<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/>/g)) rates[row[1]] = Number(row[2]);
    if (![rates.KRW, rates.USD, rates.JPY].every(value => Number.isFinite(value) && value > 0)) throw new RefreshError('ECB_MISSING_CURRENCY');
    const converted = { USD: rates.KRW / rates.USD, JPY: rates.KRW / rates.JPY * 100, EUR: rates.KRW };
    if (Number.isFinite(rates.CNY) && rates.CNY > 0) converted.CNY = rates.KRW / rates.CNY;
    if (!latest || latest.date < date) latest = { date, rates: Object.fromEntries(Object.entries(converted).map(([key, value]) => [key, round(value)])) };
    const month = date.slice(0, 7);
    if (!monthly.has(month)) monthly.set(month, {});
    const bucket = monthly.get(month);
    for (const [code, value] of Object.entries(converted)) (bucket[code] ||= []).push(value);
  }
  if (!latest || !monthly.size) throw new RefreshError('ECB_EMPTY_DATA');
  if (now - Date.parse(latest.date + 'T00:00:00+09:00') > 8 * DAY) throw new RefreshError('ECB_STALE_SOURCE');
  const series = [...monthly].sort(([a], [b]) => a.localeCompare(b)).map(([ym, currencies]) => ({
    ym, days: Math.min(...Object.values(currencies).map(values => values.length)),
    rates: Object.fromEntries(Object.entries(currencies).map(([code, values]) => [code, {
      avg: round(values.reduce((a, b) => a + b, 0) / values.length), min: round(Math.min(...values)), max: round(Math.max(...values)),
    }])),
  }));
  return {
    source: '유럽중앙은행(ECB) 공식 일일 기준환율', sourceUrl: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/',
    sourceMode: 'ecb', updatedAt: latest.date, observedAt: latest.date,
    coverage: { start: series[0].ym, end: series.at(-1).ym, months: series.length },
    unit: '원 (KRW) · ECB 일일 기준환율의 월평균', currencies: currencyMeta,
    notes: 'Cloudflare가 ECB 원본 XML을 수집해 월평균·월최저·월최고를 계산합니다. USD·EUR·CNY는 1단위, JPY는 100엔 기준입니다. 시장 체결가가 아닌 공식 일일 기준환율입니다.',
    latest, series, observationCoverage: { start: [...dates].sort()[0], end: latest.date, days: dates.size },
  };
}

async function collectExchange(previous, fetchFn, now) {
  const baseline = previous || await getJSON(fetchFn, DASHBOARD_UPSTREAMS.fxSnapshot);
  if (baseline?.sourceMode !== 'ecb' || !Array.isArray(baseline.series) || !baseline.series.length || !baseline.latest?.date) throw new RefreshError('ECB_INVALID_BASELINE');
  const recent = parseEcbHistory(await getText(fetchFn, DASHBOARD_UPSTREAMS.fx, {}, 512 * 1024), now);
  if (recent.observationCoverage.days < 40 || Date.parse(recent.latest.date) - Date.parse(recent.observationCoverage.start) < 60 * DAY) throw new RefreshError('ECB_INCOMPLETE_RECENT_HISTORY');
  if (recent.latest.date < baseline.latest.date) throw new RefreshError('UPSTREAM_SOURCE_REGRESSED');
  const byMonth = new Map(baseline.series.map(row => [row.ym, row]));
  // The leading month may be cut by the rolling 90-day feed. Keep its full baseline.
  const leadingMonth = recent.observationCoverage.start.slice(0, 7);
  for (const row of recent.series) if (row.ym > leadingMonth) byMonth.set(row.ym, row);
  const series = [...byMonth.values()].sort((a, b) => a.ym.localeCompare(b.ym));
  return { ...baseline, ...recent, series, coverage: { start: series[0].ym, end: series.at(-1).ym, months: series.length } };
}

function xmlText(block, tag) {
  const value = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? '';
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}
function number(block, tag) {
  const raw = xmlText(block, tag).replaceAll(',', '');
  if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) throw new RefreshError('CUSTOMS_INVALID_AMOUNT');
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new RefreshError('CUSTOMS_INVALID_AMOUNT');
  return value;
}
export function parseCustomsMonth(xml) {
  if (!['00', '0000'].includes(xmlText(xml, 'resultCode'))) throw new RefreshError('CUSTOMS_API_REJECTED');
  const declaredCount = Number(xmlText(xml, 'totalCount'));
  if (declaredCount > 500) throw new RefreshError('CUSTOMS_TRUNCATED_PAGE');
  let total = null;
  const countries = [];
  for (const item of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)) {
    const block = item[1], cd = xmlText(block, 'statCd'), name = xmlText(block, 'statCdCntnKor1'), year = xmlText(block, 'year');
    const exp = number(block, 'expDlr'), imp = number(block, 'impDlr');
    const rawBalance = xmlText(block, 'balPayments');
    const bal = rawBalance ? number(block, 'balPayments') : exp - imp;
    const row = { exp, imp, bal };
    if ([cd, name, year].includes('총계')) total = row;
    else if (cd && name) countries.push({ cd, name, ...row });
  }
  if (!countries.length && !total) throw new RefreshError('CUSTOMS_MONTH_UNPUBLISHED');
  if (!total) total = countries.reduce((acc, row) => ({ exp: acc.exp + row.exp, imp: acc.imp + row.imp, bal: acc.bal + row.bal }), { exp: 0, imp: 0, bal: 0 });
  const million = row => ({ ...row, exp: Math.round(row.exp / 1e6), imp: Math.round(row.imp / 1e6), bal: Math.round(row.bal / 1e6) });
  return { total: million(total), countries: countries.sort((a, b) => b.exp - a.exp).slice(0, 40).map(million) };
}
export function tradeMonths(now) {
  const date = new Date(now + 9 * HOUR);
  const lastMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - (date.getUTCDate() < 15 ? 2 : 1), 1));
  return [0, 1, 2].map(offset => new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() - offset, 1)).toISOString().slice(0, 7));
}
function validTrade(payload) {
  if (!payload || !['api', 'official'].includes(payload.sourceMode) || !Array.isArray(payload.series) || !payload.series.length || !payload.countries) throw new RefreshError('TRADE_INVALID_SNAPSHOT');
  for (const row of payload.series) if (!/^\d{4}-\d{2}$/.test(row.ym) || ![row.exp, row.imp, row.bal].every(Number.isFinite) || row.approx) throw new RefreshError('TRADE_INVALID_SNAPSHOT');
  return payload;
}
async function collectTrade(env, previous, fetchFn, now) {
  const baseline = validTrade(previous || await getJSON(fetchFn, DASHBOARD_UPSTREAMS.tradeSnapshot));
  if (!env.CUSTOMS_API_KEY) return { payload: baseline, sourceAt: baseline.latestYm, mode: 'published_snapshot', error: 'CUSTOMS_KEY_NOT_CONFIGURED' };
  try {
  const months = tradeMonths(now), rows = new Map(baseline.series.map(row => [row.ym, row]));
  const countries = { ...baseline.countries };
  for (const month of months) {
    const params = new URLSearchParams({ strtYymm: month.replace('-', ''), endYymm: month.replace('-', ''), numOfRows: '500', pageNo: '1' });
    let url, headers;
    if (env.CUSTOMS_PROXY_BASE) {
      const proxy = new URL(env.CUSTOMS_PROXY_BASE);
      if (proxy.protocol !== 'https:' || proxy.username || proxy.password || proxy.search || proxy.hash) throw new RefreshError('CUSTOMS_INVALID_PROXY');
      url = `${proxy.href.replace(/\/$/, '')}?${params}`;
      headers = { 'x-data-key': env.CUSTOMS_API_KEY };
    } else {
      params.set('serviceKey', env.CUSTOMS_API_KEY);
      url = `${DASHBOARD_UPSTREAMS.trade}?${params}`;
    }
    const result = parseCustomsMonth(await getText(fetchFn, url, headers, 2 * 1024 * 1024));
    rows.set(month, { ym: month, ...result.total });
    countries[month] = result.countries;
  }
  const series = [...rows.values()].sort((a, b) => a.ym.localeCompare(b.ym));
  const latestYm = series.at(-1).ym;
  return { payload: { ...baseline, sourceMode: 'api', updatedAt: koreanDay(now), latestYm, series, countries, countryLatestYm: [...Object.keys(countries)].filter(key => countries[key]?.length).sort().at(-1) }, sourceAt: months[0], mode: 'official_collection' };
  } catch (error) {
    if (!previous) error.fallbackPayload = baseline;
    throw error;
  }
}

function urbanSourceAt(payload, now) {
  if (payload?.meta?.source_mode !== 'api' || !Array.isArray(payload.ranking) || !payload.ranking.length) throw new RefreshError('URBAN_INVALID_SNAPSHOT');
  const observed = payload.meta.data_updated_at;
  if (typeof observed !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(observed)) throw new RefreshError('URBAN_INVALID_SOURCE_TIME');
  const date = `${observed.replace(' ', 'T')}:00+09:00`;
  if (!Number.isFinite(Date.parse(date)) || Date.parse(date) > now + 5 * 60000) throw new RefreshError('URBAN_INVALID_SOURCE_TIME');
  return date;
}
function isStale(name, sourceAt, now) {
  if (!sourceAt) return true;
  if (name === 'trade') return sourceAt < tradeMonths(now)[0];
  const date = name === 'exchange-rate' ? `${sourceAt}T00:00:00+09:00` : sourceAt;
  return !Number.isFinite(Date.parse(date)) || now - Date.parse(date) > (name === 'urban' ? 3 * HOUR : 8 * DAY);
}

export class DashboardStore {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS dashboard_state (name TEXT PRIMARY KEY, state_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dashboard_chunks (name TEXT NOT NULL, position INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY(name,position));`);
    this.inflight = null;
  }
  rows(sql, ...bindings) { return this.sql.exec(sql, ...bindings).toArray(); }
  state(name) { const row = this.rows('SELECT state_json FROM dashboard_state WHERE name=?', name)[0]; return row ? JSON.parse(row.state_json) : null; }
  write(name, state, payload) {
    this.storage.transactionSync(() => {
      if (payload !== undefined) {
        this.sql.exec('DELETE FROM dashboard_chunks WHERE name=?', name);
        const serialized = JSON.stringify(payload);
        let offset = 0, position = 0;
        while (offset < serialized.length) {
          let end = Math.min(offset + 60000, serialized.length);
          if (end < serialized.length && /[\uD800-\uDBFF]/.test(serialized[end - 1])) end--;
          this.sql.exec('INSERT INTO dashboard_chunks(name,position,content) VALUES (?,?,?)', name, position++, serialized.slice(offset, end));
          offset = end;
        }
      }
      this.sql.exec('INSERT INTO dashboard_state(name,state_json) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET state_json=excluded.state_json', name, JSON.stringify(state));
    });
  }
  get(name, now = Date.now()) {
    if (!DASHBOARD_NAMES.includes(name)) return null;
    const state = this.state(name);
    const payloadRows = this.rows('SELECT content FROM dashboard_chunks WHERE name=? ORDER BY position', name);
    const payload = payloadRows.length ? JSON.parse(payloadRows.map(row => row.content).join('')) : null;
    const meta = { name, label: labels[name], mode: modes[name], status: 'pending', source_at: null, refreshed_at: null, checked_at: null, error: null, ...state };
    meta.stale = isStale(name, meta.source_at, now);
    if (payload && meta.stale && !meta.error) meta.status = 'stale';
    return { payload, meta };
  }
  status(now = Date.now()) {
    return { checked_at: iso(now), last_run: this.state('_run'), datasets: DASHBOARD_NAMES.map(name => {
      const state = this.state(name);
      const meta = { name, label: labels[name], mode: modes[name], status: 'pending', source_at: null, refreshed_at: null, checked_at: null, error: null, ...state };
      meta.stale = isStale(name, meta.source_at, now);
      if (meta.stale && meta.status === 'ok') meta.status = 'stale';
      return meta;
    }) };
  }
  async refresh(env = {}, { fetchFn = fetch, now = Date.now(), trigger = 'scheduled' } = {}) {
    const wallStarted = Date.now();
    if (!['scheduled', 'bootstrap'].includes(trigger)) throw new Error('Invalid refresh trigger');
    this.write('_run', { ...this.state('_run'), last_trigger: trigger, started_at: iso(now), ...(trigger === 'scheduled' ? { last_scheduled_at: iso(now) } : {}) });
    if (this.inflight) return this.inflight;
    this.inflight = this.refreshAll(env, fetchFn, now);
    try {
      await this.inflight;
      this.write('_run', { ...this.state('_run'), completed_at: iso(now + Math.max(0, Date.now() - wallStarted)) });
      return this.status(now);
    } finally { this.inflight = null; }
  }
  async refreshAll(env, fetchFn, now) {
    for (const name of DASHBOARD_NAMES) {
      const previous = this.get(name, now);
      const retryAfter = previous.meta.error ? Math.min(intervals[name], FAILURE_RETRY) : intervals[name];
      if (previous.meta.checked_at && now - Date.parse(previous.meta.checked_at) < retryAfter) continue;
      let result;
      try {
        if (name === 'exchange-rate') {
          const payload = await collectExchange(previous.payload, fetchFn, now);
          result = { payload, sourceAt: payload.latest.date, mode: 'official_collection' };
        } else if (name === 'trade') result = await collectTrade(env, previous.payload, fetchFn, now);
        else {
          const payload = await getJSON(fetchFn, DASHBOARD_UPSTREAMS.urban);
          result = { payload, sourceAt: urbanSourceAt(payload, now), mode: 'published_snapshot' };
        }
        if (previous.meta.source_at && result.sourceAt < previous.meta.source_at) throw new RefreshError('UPSTREAM_SOURCE_REGRESSED');
        const stale = isStale(name, result.sourceAt, now);
        this.write(name, {
          name, label: labels[name], mode: result.mode,
          source_url: name === 'exchange-rate' ? DASHBOARD_UPSTREAMS.fx : name === 'trade' && result.mode === 'official_collection' ? DASHBOARD_UPSTREAMS.trade : name === 'trade' ? DASHBOARD_UPSTREAMS.tradeSnapshot : DASHBOARD_UPSTREAMS.urban,
          source_at: result.sourceAt, refreshed_at: iso(now), checked_at: iso(now),
          status: result.error ? 'degraded' : stale ? 'stale' : 'ok', error: result.error || null,
          next_refresh_at: iso(now + (result.error ? FAILURE_RETRY : intervals[name])), ...(name === 'urban' ? { upstream_generated_at: result.payload.meta.generated_at || null } : {}),
        }, result.payload);
      } catch (error) {
        const code = error instanceof RefreshError ? error.code : 'UPSTREAM_REFRESH_FAILED';
        if (!previous.payload && error.fallbackPayload) {
          this.write(name, { name, label: labels[name], mode: 'published_snapshot', source_url: DASHBOARD_UPSTREAMS.tradeSnapshot, source_at: error.fallbackPayload.latestYm, refreshed_at: iso(now), checked_at: iso(now), status: 'degraded', error: code, next_refresh_at: iso(now + FAILURE_RETRY) }, error.fallbackPayload);
        } else this.write(name, { ...previous.meta, checked_at: iso(now), status: previous.payload ? 'degraded' : 'error', error: code, next_refresh_at: iso(now + FAILURE_RETRY) });
      }
    }
    return this.status(now);
  }
}
