/**
 * PATCH /api/leads?id=<uuid>&action=contact
 *
 * Marks a lead as contacted and records the follow-up time.
 * Requires x-admin-token header matching SMS_ADMIN_TOKEN env var.
 * Served through api/[resource].js so it does not count as its own function.
 *
 * Response: { ok: true, leadId, updatedAt } | { ok: false, message }
 */

import crypto from 'node:crypto';

const ALLOWED_ORIGINS = new Set([
  'https://stargateedu.co.kr',
  'https://www.stargateedu.co.kr',
]);

function requestOrigin(req) {
  return String(req.headers?.origin || '').trim();
}

function setCorsHeaders(req, res) {
  const origin = requestOrigin(req);
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function isValidUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Read id/action from the raw URL so repeated or injected keys are rejected. */
function parseTarget(req) {
  const search = typeof req.url === 'string' ? req.url.split('?')[1] || '' : '';
  const params = new URLSearchParams(search);
  if (params.getAll('id').length !== 1 || params.getAll('action').length !== 1) return null;
  const leadId = params.get('id');
  if (!isValidUUID(leadId) || params.get('action') !== 'contact') return null;
  return leadId;
}

function tokenMatches(provided, expected) {
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
    res.setHeader('Access-Control-Max-Age', '600');
    return res.status(204).end();
  }

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH, OPTIONS');
    return res.status(405).json({ ok: false, message: 'PATCH 요청만 허용됩니다.' });
  }

  // Admin token authentication
  const adminToken = process.env.SMS_ADMIN_TOKEN;
  if (!adminToken) {
    return res.status(503).json({ ok: false, message: '관리자 인증 환경 설정이 완료되지 않았습니다.' });
  }
  const provided = String(req.headers?.['x-admin-token'] || '').trim();
  if (!provided || !tokenMatches(provided, adminToken)) {
    return res.status(401).json({ ok: false, message: '관리자 인증에 실패했습니다.' });
  }

  const leadId = parseTarget(req);
  if (!leadId) {
    return res.status(400).json({ ok: false, message: 'URL 형식이 올바르지 않습니다. /api/leads?id={uuid}&action=contact' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({ ok: false, message: 'Supabase 환경 설정이 완료되지 않았습니다.' });
  }

  try {
    // Call Supabase RPC mark_lead_contacted
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/mark_lead_contacted`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ p_lead_id: leadId }),
    });

    const result = await rpcRes.json().catch(() => null);

    if (!rpcRes.ok) {
      const message = String(result?.message || result?.error || `Supabase 오류 (${rpcRes.status})`).slice(0, 200);
      console.error('[leads] mark_lead_contacted RPC failed', { leadId, status: rpcRes.status, message });
      return res.status(502).json({ ok: false, message });
    }

    // result === true: updated, result === false: not found or already contacted
    if (result === false) {
      return res.status(404).json({
        ok: false,
        message: '해당 문의를 찾을 수 없거나 이미 처리된 상태입니다.',
        leadId,
      });
    }

    return res.status(200).json({
      ok: true,
      leadId,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[leads] unexpected error', { leadId, error: error?.message || String(error) });
    return res.status(500).json({ ok: false, message: '서버 내부 오류가 발생했습니다.' });
  }
}

export const __test = { parseTarget, tokenMatches };
