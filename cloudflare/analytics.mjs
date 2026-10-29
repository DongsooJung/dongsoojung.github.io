export const METHODS = new Set(['get_site_region_stats', 'get_site_visit_stats', 'get_site_usage_stats', 'get_site_visit_summary', 'get_site_usage_summary', 'get_site_button_click_counts', 'record_site_visit', 'record_site_usage_event']);
export const MAX_BODY_BYTES = 8192;
export const MAX_IMPORT_BYTES = 262144;
export const HISTORY_SOURCE = 'supabase:inftexpcnfinglwlrvsj';
export const HISTORY_EXPECTED = { visits: 385, events: 1375 };
const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only Cloudflare-provided coarse geography is accepted; never persist IPs.
export function coarseRegion(cf) {
  const country = typeof cf?.country === 'string' && /^[A-Z]{2}$/.test(cf.country) && !['XX','T1'].includes(cf.country) ? cf.country : null;
  const region = country && typeof cf?.region === 'string' ? cf.region.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) : '';
  return { country, region: region || null };
}

export class RequestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function koreaDay(now = Date.now()) {
  return new Date(Number(now) + 9 * 3600000).toISOString().slice(0, 10);
}

function uuid(value, name) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new RequestError(`Invalid ${name}`);
  return value.toLowerCase();
}

function text(value, name, max) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f]/.test(value)) throw new RequestError(`Invalid ${name}`);
  return value.trim() || null;
}

export function relativePath(value, name = 'path', max = 512) {
  if (typeof value !== 'string' || value.length > max || !value.startsWith('/') || value.startsWith('//') || /[\\?#\u0000-\u001f]/.test(value)) throw new RequestError(`Invalid ${name}`);
  try {
    if (value.split('/').some(part => ['.', '..'].includes(decodeURIComponent(part)))) throw new Error();
  } catch { throw new RequestError(`Invalid ${name}`); }
  return value;
}

function target(value) {
  const result = text(value, 'p_target_url', 1024);
  if (!result) return null;
  if (result.startsWith('/')) return relativePath(result, 'p_target_url', 1024);
  let url;
  try { url = new URL(result); } catch { throw new RequestError('Invalid p_target_url'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new RequestError('Invalid p_target_url');
  // Keep link destinations useful for aggregate counts, without query values.
  return `${url.origin}${url.pathname}`;
}

export function validatePayload(method, payload, now = Date.now()) {
  if (!METHODS.has(method)) throw new RequestError('Unknown analytics method', 404);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new RequestError('Expected a JSON object');
  if (['get_site_region_stats','get_site_visit_stats','get_site_usage_stats','get_site_visit_summary','get_site_usage_summary'].includes(method)) {
    const days = payload.p_days ?? 30;
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new RequestError('p_days must be between 1 and 90');
    if (method === 'get_site_usage_summary' && ![7,14,30].includes(days)) throw new RequestError('Public usage windows are 7, 14 or 30 days');
    return { p_days: days };
  }
  if (method === 'get_site_button_click_counts') return { p_page_path: relativePath(payload.p_page_path, 'p_page_path') };
  const common = { p_visitor_id: uuid(payload.p_visitor_id, 'p_visitor_id') };
  if (method === 'record_site_visit') {
    if (payload.p_visit_date !== koreaDay(now)) throw new RequestError('p_visit_date must be today in Asia/Seoul');
    return { ...common, p_visit_date: payload.p_visit_date, p_path: relativePath(payload.p_path ?? '/', 'p_path') };
  }
  if (!['page_view', 'click'].includes(payload.p_event_type)) throw new RequestError('Invalid p_event_type');
  if (payload.p_device_type != null && !['mobile', 'tablet', 'desktop'].includes(payload.p_device_type)) throw new RequestError('Invalid p_device_type');
  return {
    ...common,
    p_event_id: uuid(payload.p_event_id, 'p_event_id'),
    p_session_id: uuid(payload.p_session_id, 'p_session_id'),
    p_event_type: payload.p_event_type,
    p_page_path: relativePath(payload.p_page_path, 'p_page_path'),
    p_page_title: text(payload.p_page_title, 'p_page_title', 240),
    p_element_label: text(payload.p_element_label, 'p_element_label', 160),
    p_element_kind: text(payload.p_element_kind, 'p_element_kind', 48),
    p_target_url: target(payload.p_target_url),
    p_device_type: payload.p_device_type ?? null,
  };
}

export async function readPayload(request, maxBytes = MAX_BODY_BYTES) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new RequestError('Expected application/json', 415);
  if (Number(request.headers.get('content-length')) > maxBytes) throw new RequestError('Analytics payload too large', 413);
  const reader = request.body?.getReader();
  let bytes = 0;
  const chunks = [];
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new RequestError('Analytics payload too large', 413); }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
  catch { throw new RequestError('Invalid JSON'); }
}

async function sha256(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function isImportAuthorized(secret, authorization) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof authorization !== 'string' || authorization.length > 512 || !authorization.startsWith('Bearer ')) return false;
  const expected = await sha256(secret), actual = await sha256(authorization.slice(7));
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return difference === 0;
}

export async function historyUuid(kind, value) {
  const hex = await sha256(JSON.stringify([HISTORY_SOURCE, kind, String(value).toLowerCase()]));
  // UUIDv8: deterministic source namespace, separate from native browser IDs.
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-${((parseInt(hex[16],16)&3)|8).toString(16)}${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

function historyDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value) throw new RequestError('Invalid historical visit date');
  return value;
}

function historyTime(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now) throw new RequestError('Invalid historical timestamp');
  return value;
}

function historyText(value, name, max, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || value.length > max || (required && !value.length) || value.includes('\0')) throw new RequestError(`Invalid historical ${name}`);
  return value;
}

export async function prepareHistoryImport(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.source !== HISTORY_SOURCE || !/^[0-9a-f]{64}$/.test(payload.manifest_sha256 || '')) throw new RequestError('Invalid historical import manifest');
  const common = { source: HISTORY_SOURCE, manifest_sha256: payload.manifest_sha256 };
  if (payload.action === 'finalize') {
    if (payload.expected_visits !== HISTORY_EXPECTED.visits || payload.expected_events !== HISTORY_EXPECTED.events) throw new RequestError('Historical snapshot counts must match the authoritative export');
    return { ...common, action: 'finalize' };
  }
  if (payload.action !== 'batch' || !['visits','events'].includes(payload.kind) || !Array.isArray(payload.rows) || !payload.rows.length || payload.rows.length > 250) throw new RequestError('Invalid historical import batch');
  const prepared = [];
  for (const raw of payload.rows) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RequestError('Invalid historical source row');
    const visitor = uuid(raw.visitor_id, 'historical visitor_id');
    const created = historyTime(raw.created_at, now);
    let originalId, row;
    if (payload.kind === 'visits') {
      if (!((Number.isSafeInteger(raw.id) && raw.id > 0) || (typeof raw.id === 'string' && /^[1-9]\d{0,18}$/.test(raw.id)))) throw new RequestError('Invalid historical visit id');
      originalId = String(raw.id);
      const date = historyDate(raw.visit_date);
      if (date > koreaDay(now)) throw new RequestError('Historical visit date is in the future');
      row = { visitor_id: await historyUuid('visitor',visitor), visit_date: date, path: historyText(raw.path,'path',512,true), created_at: created };
    } else {
      originalId = uuid(raw.event_id, 'historical event_id');
      if (!['page_view','click'].includes(raw.event_type)) throw new RequestError('Invalid historical event type');
      if (raw.device_type != null && !['mobile','tablet','desktop'].includes(raw.device_type)) throw new RequestError('Invalid historical device type');
      row = {
        event_id: await historyUuid('event',originalId), visitor_id: await historyUuid('visitor',visitor),
        session_id: await historyUuid('session',uuid(raw.session_id,'historical session_id')),
        event_type: raw.event_type, page_path: historyText(raw.page_path,'page_path',512,true),
        page_title: historyText(raw.page_title,'page_title',240), element_label: historyText(raw.element_label,'element_label',160),
        element_kind: historyText(raw.element_kind,'element_kind',48), target_url: historyText(raw.target_url,'target_url',1024),
        device_type: raw.device_type ?? null, created_at: created, event_date: koreaDay(Date.parse(created)),
      };
    }
    prepared.push({ original_id: originalId, hash: await sha256(JSON.stringify(row)), row });
  }
  return { ...common, action: 'batch', kind: payload.kind, rows: prepared };
}

const countsSql = `COUNT(CASE WHEN event_type='page_view' THEN 1 END) AS page_views,
  COUNT(CASE WHEN event_type='click' THEN 1 END) AS clicks,
  COUNT(DISTINCT CASE WHEN event_type='page_view' THEN visitor_id END) AS visitors,
  COUNT(DISTINCT CASE WHEN event_type='click' THEN visitor_id END) AS clicking_visitors`;
const engagement = row => ({ ...row, engagement_rate: row.visitors ? Math.round(row.clicking_visitors / row.visitors * 1000) / 10 : 0 });
const allEvents = `WITH all_events AS (
  SELECT event_id,visitor_id,session_id,event_type,page_path,element_label,target_url,event_date FROM events
  UNION ALL SELECT event_id,visitor_id,session_id,event_type,page_path,element_label,target_url,event_date FROM history_events
  WHERE source IN (SELECT source FROM history_runs WHERE completed_at IS NOT NULL)
)`;

export class AnalyticsStore {
  constructor(storage, now = Date.now()) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS visits (visitor_id TEXT NOT NULL, visit_date TEXT NOT NULL, path TEXT NOT NULL, PRIMARY KEY(visitor_id, visit_date));
      CREATE INDEX IF NOT EXISTS visits_date ON visits(visit_date);
      CREATE TABLE IF NOT EXISTS day_counts (date TEXT PRIMARY KEY, visits INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS button_counts (key TEXT PRIMARY KEY, page_path TEXT NOT NULL, element_label TEXT NOT NULL, target_url TEXT, clicks INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS button_counts_page ON button_counts(page_path);
      CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, session_id TEXT NOT NULL,
        event_type TEXT NOT NULL, page_path TEXT NOT NULL, page_title TEXT, element_label TEXT, element_kind TEXT,
        target_url TEXT, device_type TEXT, event_date TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_date ON events(event_date);
      CREATE TABLE IF NOT EXISTS event_regions (event_id TEXT PRIMARY KEY, country TEXT NOT NULL, region TEXT);
      CREATE INDEX IF NOT EXISTS event_regions_location ON event_regions(country,region);
      CREATE INDEX IF NOT EXISTS events_page_type_date ON events(page_path, event_type, event_date);
      CREATE TABLE IF NOT EXISTS history_runs (source TEXT PRIMARY KEY, manifest_sha256 TEXT NOT NULL, completed_at TEXT, first_date TEXT, last_date TEXT, visits INTEGER, events INTEGER);
      CREATE TABLE IF NOT EXISTS import_ledger (source TEXT NOT NULL, kind TEXT NOT NULL, original_id TEXT NOT NULL, row_hash TEXT NOT NULL, PRIMARY KEY(source,kind,original_id));
      CREATE TABLE IF NOT EXISTS history_visits (source TEXT NOT NULL, original_id TEXT NOT NULL, visitor_id TEXT NOT NULL, visit_date TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(source,original_id), UNIQUE(source,visitor_id,visit_date));
      CREATE INDEX IF NOT EXISTS history_visits_date ON history_visits(visit_date);
      CREATE TABLE IF NOT EXISTS history_events (source TEXT NOT NULL, original_id TEXT NOT NULL, event_id TEXT NOT NULL UNIQUE, visitor_id TEXT NOT NULL, session_id TEXT NOT NULL,
        event_type TEXT NOT NULL, page_path TEXT NOT NULL, page_title TEXT, element_label TEXT, element_kind TEXT, target_url TEXT, device_type TEXT, created_at TEXT NOT NULL, event_date TEXT NOT NULL, PRIMARY KEY(source,original_id));
      CREATE INDEX IF NOT EXISTS history_events_date ON history_events(event_date);
      CREATE INDEX IF NOT EXISTS history_events_page_date ON history_events(page_path,event_type,event_date);`);
    this.sql.exec('INSERT OR IGNORE INTO metadata(key,value) VALUES (?,?)', 'started_at', new Date(now).toISOString());
    this.startedAt = this.rows("SELECT value FROM metadata WHERE key='started_at'")[0].value;
    this.sql.exec('INSERT OR IGNORE INTO metadata(key,value) VALUES (?,?)', 'region_started_at', new Date(now).toISOString());
    this.regionStartedAt = this.rows("SELECT value FROM metadata WHERE key='region_started_at'")[0].value;
    this.lastPrunedDay = null;
  }

  rows(sql, ...bindings) { return this.sql.exec(sql, ...bindings).toArray(); }
  history() {
    return this.rows('SELECT source,visits,events,first_date,last_date,completed_at,manifest_sha256 FROM history_runs WHERE completed_at IS NOT NULL')[0] || null;
  }
  meta(now = Date.now()) {
    const history = this.history();
    return { source: 'cloudflare', started_at: this.startedAt, retention_days: 90, ...(history ? { historical_import: history, historical_retention: 'permanent', coverage: [
      { source: history.source, first_date: history.first_date, last_date: history.last_date },
      { source: 'cloudflare', first_date: koreaDay(Date.parse(this.startedAt)), last_date: koreaDay(now) },
    ] } : {}) };
  }
  startDay(days, now) {
    const history = this.history();
    const first = [koreaDay(Date.parse(this.startedAt)), ...(history ? [history.first_date] : [])].sort()[0];
    return [koreaDay(now - (days - 1) * DAY), first].sort().at(-1);
  }
  dates(days, now) {
    const dates = [];
    const end = koreaDay(now);
    const history = this.history(), nativeFirst = koreaDay(Date.parse(this.startedAt));
    for (let day = this.startDay(days, now); day <= end; day = new Date(Date.parse(day + 'T00:00:00Z') + DAY).toISOString().slice(0, 10)) {
      if (!history || day >= nativeFirst || (day >= history.first_date && day <= history.last_date)) dates.push(day);
    }
    return dates;
  }
  prune(now = Date.now()) {
    const day = koreaDay(now);
    if (this.lastPrunedDay === day) return;
    const cutoff = koreaDay(now - 89 * DAY);
    this.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM visits WHERE visit_date < ?', cutoff);
      this.sql.exec('DELETE FROM event_regions WHERE event_id IN (SELECT event_id FROM events WHERE event_date < ?)', cutoff);
      this.sql.exec('DELETE FROM events WHERE event_date < ?', cutoff);
    });
    this.lastPrunedDay = day;
  }
  visit(visitor, day, path) {
    const inserted = this.rows('INSERT OR IGNORE INTO visits(visitor_id,visit_date,path) VALUES (?,?,?) RETURNING visitor_id', visitor, day, path).length > 0;
    if (inserted) this.sql.exec('INSERT INTO day_counts(date,visits) VALUES (?,1) ON CONFLICT(date) DO UPDATE SET visits=visits+1', day);
    return inserted;
  }
  recordVisit(p) {
    return this.storage.transactionSync(() => this.visit(p.p_visitor_id, p.p_visit_date, p.p_path));
  }
  recordEvent(p, now, geo) {
    return this.storage.transactionSync(() => {
      const day = koreaDay(now);
      const inserted = this.rows(`INSERT OR IGNORE INTO events(event_id,visitor_id,session_id,event_type,page_path,page_title,element_label,element_kind,target_url,device_type,event_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING event_id`, p.p_event_id, p.p_visitor_id, p.p_session_id, p.p_event_type, p.p_page_path, p.p_page_title, p.p_element_label, p.p_element_kind, p.p_target_url, p.p_device_type, day).length > 0;
      if (inserted && geo?.country) this.sql.exec('INSERT INTO event_regions(event_id,country,region) VALUES (?,?,?)', p.p_event_id, geo.country, geo.region);
      if (inserted && p.p_event_type === 'page_view') this.visit(p.p_visitor_id, day, p.p_page_path);
      if (inserted && p.p_event_type === 'click') this.sql.exec(`INSERT INTO button_counts(key,page_path,element_label,target_url,clicks)
        VALUES (?,?,?,?,1) ON CONFLICT(key) DO UPDATE SET clicks=clicks+1`, JSON.stringify([p.p_page_path,p.p_element_label || '(이름 없는 버튼)',p.p_target_url]), p.p_page_path, p.p_element_label || '(이름 없는 버튼)', p.p_target_url);
      return inserted;
    });
  }
  visits(days, now) {
    const byDay = new Map(this.rows('SELECT date,visits FROM day_counts WHERE date >= ? AND date <= ? ORDER BY date', this.startDay(days, now), koreaDay(now)).map(row => [row.date, row.visits]));
    const daily = this.dates(days, now).map(date => ({ date, visits: byDay.get(date) || 0 }));
    return { ...this.meta(now), today: byDay.get(koreaDay(now)) || 0, total: this.rows('SELECT COALESCE(SUM(visits),0) AS total FROM day_counts')[0].total, period: daily.reduce((total, row) => total + row.visits, 0), daily };
  }
  usage(days, now) {
    const start = this.startDay(days, now), end = koreaDay(now);
    const where = 'WHERE event_date >= ? AND event_date <= ?';
    const totals = this.rows(`${allEvents} SELECT ${countsSql}, COUNT(DISTINCT session_id) AS sessions FROM all_events ${where}`, start, end)[0];
    const dailyRows = new Map(this.rows(`${allEvents} SELECT event_date AS date, ${countsSql} FROM all_events ${where} GROUP BY event_date ORDER BY event_date`, start, end).map(row => [row.date, row]));
    return {
      ...this.meta(now), days, ...engagement(totals),
      daily: this.dates(days, now).map(date => engagement(dailyRows.get(date) || { date, page_views: 0, clicks: 0, visitors: 0, clicking_visitors: 0 })),
      pages: this.rows(`${allEvents} SELECT page_path, ${countsSql} FROM all_events ${where} GROUP BY page_path ORDER BY clicks DESC,page_views DESC,page_path LIMIT 500`, start, end).map(engagement),
      buttons: this.rows(`${allEvents} SELECT page_path, COALESCE(element_label,'(이름 없는 버튼)') AS element_label, target_url,
        COUNT(*) AS clicks, COUNT(DISTINCT visitor_id) AS clicking_visitors FROM all_events ${where} AND event_type='click'
        GROUP BY page_path,COALESCE(element_label,'(이름 없는 버튼)'),target_url ORDER BY clicks DESC,page_path,element_label LIMIT 100`, start, end),
    };
  }
  regions(days, now) {
    const start = this.startDay(days,now), end = koreaDay(now);
    const rows = this.rows(`${allEvents} SELECT g.country,g.region,COUNT(*) AS clicks
      FROM all_events e LEFT JOIN event_regions g ON e.event_id=g.event_id
      WHERE e.event_type='click' AND e.event_date>=? AND e.event_date<=?
      GROUP BY g.country,g.region ORDER BY clicks DESC,g.country,g.region`, start,end);
    const total = rows.reduce((sum,row)=>sum+row.clicks,0);
    const known = rows.filter(row=>row.country);
    return {source:'cloudflare',days,started_at:this.regionStartedAt,total_clicks:total,
      located_clicks:known.reduce((sum,row)=>sum+row.clicks,0),
      unknown_clicks:rows.filter(row=>!row.country).reduce((sum,row)=>sum+row.clicks,0),
      regions:known.slice(0,10).map(row=>({...row,share:total?Math.round(row.clicks/total*1000)/10:0})),
      scope:'sitewide',precision:'country-region'};
  }
  buttonCounts(path) {
    return this.rows(`SELECT element_label,target_url,clicks FROM button_counts WHERE page_path=?
      ORDER BY clicks DESC,element_label,target_url LIMIT 500`, path);
  }
  visitSummary(now) {
    const full = this.visits(1,now);
    return {source:'cloudflare',today:full.today,total:full.total,historical_included:!!full.historical_import};
  }
  usageSummary(days,now) {
    const start = this.startDay(days,now),end = koreaDay(now);
    return {
      source:'cloudflare',
      pages:this.rows(`${allEvents} SELECT page_path,COUNT(*) AS page_views FROM all_events
        WHERE event_type='page_view' AND event_date>=? AND event_date<=? GROUP BY page_path ORDER BY page_views DESC,page_path LIMIT 500`,start,end),
      buttons:this.rows(`${allEvents} SELECT target_url,COUNT(*) AS clicks FROM all_events
        WHERE event_type='click' AND event_date>=? AND event_date<=? GROUP BY target_url ORDER BY clicks DESC,target_url LIMIT 100`,start,end),
    };
  }
  importHistory(prepared, now = Date.now()) {
    return this.storage.transactionSync(() => {
      this.sql.exec('INSERT OR IGNORE INTO history_runs(source,manifest_sha256) VALUES (?,?)', prepared.source, prepared.manifest_sha256);
      const run = this.rows('SELECT * FROM history_runs WHERE source=?', prepared.source)[0];
      if (run.manifest_sha256 !== prepared.manifest_sha256) throw new RequestError('Historical manifest conflicts with the existing import',409);
      if (prepared.action === 'batch') {
        let inserted = 0, skipped = 0;
        for (const item of prepared.rows) {
          const previous = this.rows('SELECT row_hash FROM import_ledger WHERE source=? AND kind=? AND original_id=?', prepared.source, prepared.kind, item.original_id)[0];
          if (previous) {
            if (previous.row_hash !== item.hash) throw new RequestError('Historical source row conflicts with an earlier batch',409);
            skipped++;
            continue;
          }
          if (run.completed_at) throw new RequestError('Historical import is already finalized',409);
          const r = item.row;
          if (prepared.kind === 'visits') {
            this.sql.exec('INSERT INTO history_visits(source,original_id,visitor_id,visit_date,path,created_at) VALUES (?,?,?,?,?,?)', prepared.source,item.original_id,r.visitor_id,r.visit_date,r.path,r.created_at);
          } else {
            this.sql.exec(`INSERT INTO history_events(source,original_id,event_id,visitor_id,session_id,event_type,page_path,page_title,element_label,element_kind,target_url,device_type,created_at,event_date)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, prepared.source,item.original_id,r.event_id,r.visitor_id,r.session_id,r.event_type,r.page_path,r.page_title,r.element_label,r.element_kind,r.target_url,r.device_type,r.created_at,r.event_date);
          }
          this.sql.exec('INSERT INTO import_ledger(source,kind,original_id,row_hash) VALUES (?,?,?,?)', prepared.source,prepared.kind,item.original_id,item.hash);
          inserted++;
        }
        return { source: prepared.source, kind: prepared.kind, inserted, skipped, completed: !!run.completed_at };
      }
      const visits = this.rows('SELECT COUNT(*) AS n FROM history_visits WHERE source=?', prepared.source)[0].n;
      const events = this.rows('SELECT COUNT(*) AS n FROM history_events WHERE source=?', prepared.source)[0].n;
      const ledgerVisits = this.rows("SELECT COUNT(*) AS n FROM import_ledger WHERE source=? AND kind='visits'",prepared.source)[0].n;
      const ledgerEvents = this.rows("SELECT COUNT(*) AS n FROM import_ledger WHERE source=? AND kind='events'",prepared.source)[0].n;
      if (visits !== HISTORY_EXPECTED.visits || events !== HISTORY_EXPECTED.events || ledgerVisits !== visits || ledgerEvents !== events) throw new RequestError('Historical snapshot is incomplete; finalization refused',409);
      if (run.completed_at) return { completed: true, already_completed: true, historical_import: this.history() };
      const dates = this.rows(`SELECT MIN(date) AS first_date,MAX(date) AS last_date FROM (
        SELECT visit_date AS date FROM history_visits WHERE source=? UNION ALL SELECT event_date AS date FROM history_events WHERE source=?)`, prepared.source,prepared.source)[0];
      for (const day of this.rows('SELECT visit_date,COUNT(*) AS n FROM history_visits WHERE source=? GROUP BY visit_date',prepared.source)) {
        this.sql.exec('INSERT INTO day_counts(date,visits) VALUES (?,?) ON CONFLICT(date) DO UPDATE SET visits=visits+excluded.visits',day.visit_date,day.n);
      }
      for (const button of this.rows(`SELECT page_path,COALESCE(element_label,'(이름 없는 버튼)') AS element_label,target_url,COUNT(*) AS n FROM history_events
        WHERE source=? AND event_type='click' GROUP BY page_path,COALESCE(element_label,'(이름 없는 버튼)'),target_url`,prepared.source)) {
        this.sql.exec('INSERT INTO button_counts(key,page_path,element_label,target_url,clicks) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET clicks=clicks+excluded.clicks',
          JSON.stringify([button.page_path,button.element_label,button.target_url]),button.page_path,button.element_label,button.target_url,button.n);
      }
      this.sql.exec('UPDATE history_runs SET completed_at=?,first_date=?,last_date=?,visits=?,events=? WHERE source=?',new Date(now).toISOString(),dates.first_date,dates.last_date,visits,events,prepared.source);
      return { completed: true, already_completed: false, historical_import: this.history() };
    });
  }
  call(method, payload, now = Date.now(), geo = null) {
    const p = validatePayload(method, payload, now);
    this.prune(now);
    switch (method) {
      case 'record_site_visit': return this.recordVisit(p);
      case 'record_site_usage_event': return this.recordEvent(p, now, coarseRegion(geo));
      case 'get_site_region_stats': return this.regions(p.p_days, now);
      case 'get_site_visit_stats': return this.visits(p.p_days, now);
      case 'get_site_usage_stats': return this.usage(p.p_days, now);
      case 'get_site_visit_summary': return this.visitSummary(now);
      case 'get_site_usage_summary': return this.usageSummary(p.p_days,now);
      case 'get_site_button_click_counts': return this.buttonCounts(p.p_page_path);
    }
  }
}

