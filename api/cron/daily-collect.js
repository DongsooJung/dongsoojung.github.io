/** Daily Vercel Cron: G2B construction/service bids + LH notices -> Supabase. */
import bidHandler from '../bid-pblanc/[kind].js';
import lhHandler from '../lh-sale-info.js';

export const maxDuration = 300;

function kstYmdHm(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${map.year}${map.month}${map.day}${map.hour === '24' ? '00' : map.hour}${map.minute}`;
}

function invoke(handler, body, query = {}) {
  return new Promise((resolve, reject) => {
    const req = { method: 'POST', headers: {}, query, body };
    const res = {
      headers: {}, statusCode: 200,
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.statusCode = code; return this; },
      json(payload) {
        if (this.statusCode >= 400 || payload?.ok === false) reject(new Error(payload?.error || `handler_${this.statusCode}`));
        else resolve(payload);
      },
      end() { resolve({ ok: true }); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function collectBid(kind, range) {
  const common = { pageSize: 100, saveToSupabase: true, ...range };
  const first = await invoke(bidHandler, { ...common, pageNo: 1 }, { kind });
  const pages = Math.min(10, Math.max(1, Math.ceil((first.totalCount || 0) / 100)));
  let rowCount = first.rowCount || 0;
  let saved = first.saved || 0;
  for (let pageNo = 2; pageNo <= pages; pageNo += 1) {
    const result = await invoke(bidHandler, { ...common, pageNo }, { kind });
    rowCount += result.rowCount || 0;
    saved += result.saved || 0;
  }
  return { kind, pages, rowCount, saved, totalCount: first.totalCount || 0 };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const startedAt = new Date();
  const range = {
    inqryBgnDt: kstYmdHm(new Date(startedAt.getTime() - 36 * 60 * 60 * 1000)),
    inqryEndDt: kstYmdHm(startedAt),
  };
  try {
    const cnstwk = await collectBid('cnstwk', range);
    const servc = await collectBid('servc', range);
    const lhRaw = await invoke(lhHandler, { pageNo: 1, pageSize: 100, saveToSupabase: true, typeCode: 'all' });
    const lh = { kind: 'lh', pages: 1, rowCount: lhRaw.rowCount || 0, saved: lhRaw.saved || 0, totalCount: lhRaw.totalCount || 0 };
    return res.status(200).json({ ok: true, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), range, results: [cnstwk, servc, lh] });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'daily_collect_failed' });
  }
}

export const __test = { kstYmdHm };
