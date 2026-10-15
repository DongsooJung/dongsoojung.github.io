export const METHODS = new Set(['get_site_visit_stats', 'get_site_usage_stats', 'get_site_button_click_counts', 'record_site_visit', 'record_site_usage_event']);
export const MAX_BODY_BYTES = 8192;
const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (method === 'get_site_visit_stats' || method === 'get_site_usage_stats') {
    const days = payload.p_days ?? 30;
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new RequestError('p_days must be between 1 and 90');
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

export async function readPayload(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new RequestError('Expected application/json', 415);
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new RequestError('Analytics payload too large', 413);
  const reader = request.body?.getReader();
  let bytes = 0;
  const chunks = [];
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new RequestError('Analytics payload too large', 413); }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
  catch { throw new RequestError('Invalid JSON'); }
}

const countsSql = `COUNT(CASE WHEN event_type='page_view' THEN 1 END) AS page_views,
  COUNT(CASE WHEN event_type='click' THEN 1 END) AS clicks,
  COUNT(DISTINCT CASE WHEN event_type='page_view' THEN visitor_id END) AS visitors,
  COUNT(DISTINCT CASE WHEN event_type='click' THEN visitor_id END) AS clicking_visitors`;
const engagement = row => ({ ...row, engagement_rate: row.visitors ? Math.round(row.clicking_visitors / row.visitors * 1000) / 10 : 0 });

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
      CREATE INDEX IF NOT EXISTS events_page_type_date ON events(page_path, event_type, event_date);`);
    this.sql.exec('INSERT OR IGNORE INTO metadata(key,value) VALUES (?,?)', 'started_at', new Date(now).toISOString());
    this.startedAt = this.rows("SELECT value FROM metadata WHERE key='started_at'")[0].value;
    this.lastPrunedDay = null;
  }

  rows(sql, ...bindings) { return this.sql.exec(sql, ...bindings).toArray(); }
  meta() { return { source: 'cloudflare', started_at: this.startedAt, retention_days: 90 }; }
  startDay(days, now) {
    return [koreaDay(now - (days - 1) * DAY), koreaDay(Date.parse(this.startedAt))].sort().at(-1);
  }
  dates(days, now) {
    const dates = [];
    const end = koreaDay(now);
    for (let day = this.startDay(days, now); day <= end; day = new Date(Date.parse(day + 'T00:00:00Z') + DAY).toISOString().slice(0, 10)) dates.push(day);
    return dates;
  }
  prune(now = Date.now()) {
    const day = koreaDay(now);
    if (this.lastPrunedDay === day) return;
    const cutoff = koreaDay(now - 89 * DAY);
    this.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM visits WHERE visit_date < ?', cutoff);
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
  recordEvent(p, now) {
    return this.storage.transactionSync(() => {
      const day = koreaDay(now);
      const inserted = this.rows(`INSERT OR IGNORE INTO events(event_id,visitor_id,session_id,event_type,page_path,page_title,element_label,element_kind,target_url,device_type,event_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING event_id`, p.p_event_id, p.p_visitor_id, p.p_session_id, p.p_event_type, p.p_page_path, p.p_page_title, p.p_element_label, p.p_element_kind, p.p_target_url, p.p_device_type, day).length > 0;
      if (inserted && p.p_event_type === 'page_view') this.visit(p.p_visitor_id, day, p.p_page_path);
      if (inserted && p.p_event_type === 'click') this.sql.exec(`INSERT INTO button_counts(key,page_path,element_label,target_url,clicks)
        VALUES (?,?,?,?,1) ON CONFLICT(key) DO UPDATE SET clicks=clicks+1`, JSON.stringify([p.p_page_path,p.p_element_label || '(이름 없는 버튼)',p.p_target_url]), p.p_page_path, p.p_element_label || '(이름 없는 버튼)', p.p_target_url);
      return inserted;
    });
  }
  visits(days, now) {
    const byDay = new Map(this.rows('SELECT date,visits FROM day_counts WHERE date >= ? AND date <= ? ORDER BY date', this.startDay(days, now), koreaDay(now)).map(row => [row.date, row.visits]));
    const daily = this.dates(days, now).map(date => ({ date, visits: byDay.get(date) || 0 }));
    return { ...this.meta(), today: byDay.get(koreaDay(now)) || 0, total: this.rows('SELECT COALESCE(SUM(visits),0) AS total FROM day_counts')[0].total, period: daily.reduce((total, row) => total + row.visits, 0), daily };
  }
  usage(days, now) {
    const start = this.startDay(days, now), end = koreaDay(now);
    const where = 'WHERE event_date >= ? AND event_date <= ?';
    const totals = this.rows(`SELECT ${countsSql}, COUNT(DISTINCT session_id) AS sessions FROM events ${where}`, start, end)[0];
    const dailyRows = new Map(this.rows(`SELECT event_date AS date, ${countsSql} FROM events ${where} GROUP BY event_date ORDER BY event_date`, start, end).map(row => [row.date, row]));
    return {
      ...this.meta(), days, ...engagement(totals),
      daily: this.dates(days, now).map(date => engagement(dailyRows.get(date) || { date, page_views: 0, clicks: 0, visitors: 0, clicking_visitors: 0 })),
      pages: this.rows(`SELECT page_path, ${countsSql} FROM events ${where} GROUP BY page_path ORDER BY clicks DESC,page_views DESC,page_path LIMIT 500`, start, end).map(engagement),
      buttons: this.rows(`SELECT page_path, COALESCE(element_label,'(이름 없는 버튼)') AS element_label, target_url,
        COUNT(*) AS clicks, COUNT(DISTINCT visitor_id) AS clicking_visitors FROM events ${where} AND event_type='click'
        GROUP BY page_path,element_label,target_url ORDER BY clicks DESC,page_path,element_label LIMIT 100`, start, end),
    };
  }
  buttonCounts(path) {
    return this.rows(`SELECT element_label,target_url,clicks FROM button_counts WHERE page_path=?
      ORDER BY clicks DESC,element_label,target_url LIMIT 500`, path);
  }
  call(method, payload, now = Date.now()) {
    const p = validatePayload(method, payload, now);
    this.prune(now);
    switch (method) {
      case 'record_site_visit': return this.recordVisit(p);
      case 'record_site_usage_event': return this.recordEvent(p, now);
      case 'get_site_visit_stats': return this.visits(p.p_days, now);
      case 'get_site_usage_stats': return this.usage(p.p_days, now);
      case 'get_site_button_click_counts': return this.buttonCounts(p.p_page_path);
    }
  }
}
