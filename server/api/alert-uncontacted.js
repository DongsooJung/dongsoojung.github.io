/**
 * Uncontacted-lead alert, run once a day from api/cron/daily-collect.js.
 *
 * Vercel Hobby rejects cron expressions that run more than once per day and
 * the project is capped at 12 functions, so this is not a route of its own:
 * it is not registered in api/[resource].js and the daily cron, which checks
 * CRON_SECRET, is its only caller.
 *
 * Finds leads with status='new' that have not been followed up
 * within 24 hours and sends an SMS alert to the admin.
 * Logs every run to lead_events for 7-day continuous monitoring.
 */

import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY;
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET;
const SOLAPI_SENDER = (process.env.SOLAPI_SENDER_NUMBER || '').replace(/\D/g, '');
const ADMIN_PHONE = (process.env.SUPPORT_ADMIN_PHONE || process.env.SOLAPI_ADMIN_PHONE || '').replace(/\D/g, '');

const SOLAPI_ENDPOINT = 'https://api.solapi.com/messages/v4/send-many/detail';

function createSolapiAuth() {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto
    .createHmac('sha256', SOLAPI_API_SECRET)
    .update(date + salt)
    .digest('hex');
  return `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

function isKoreanMobile(phone) {
  return /^01(?:0|1|6|7|8|9)\d{7,8}$/.test(phone);
}

/** Supabase REST helper using service_role key */
async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(options.headers || {}),
    },
  });
  return res;
}

/** Write a lead_event record. non-throwing. */
async function logEvent(leadId, event, detail = {}) {
  try {
    await sbFetch('/rest/v1/lead_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ lead_id: leadId || null, event, detail }),
    });
  } catch (_) {
    // best-effort
  }
}

/** Write a cron_ok heartbeat with no lead_id. */
async function logCronHeartbeat(detail = {}) {
  try {
    await sbFetch('/rest/v1/lead_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ lead_id: null, event: 'cron_ok', detail }),
    });
  } catch (_) {
    // best-effort
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(503).json({ ok: false, message: 'Supabase 환경 설정 누락' });
  }

  // Query leads: status='new' AND submitted_at < now()-24h AND alerted_at IS NULL
  let uncontacted = [];
  try {
    const qRes = await sbFetch(
      '/rest/v1/leads' +
        '?status=eq.new' +
        '&submitted_at=lt.' + encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) +
        '&alerted_at=is.null' +
        '&select=id,name,submitted_at' +
        '&order=submitted_at.asc' +
        '&limit=50',
      { method: 'GET' },
    );
    if (!qRes.ok) {
      const body = await qRes.text().catch(() => '');
      throw new Error(`leads query failed (${qRes.status}): ${body}`);
    }
    uncontacted = await qRes.json();
  } catch (error) {
    console.error('[alert-uncontacted] leads query error', error?.message);
    await logCronHeartbeat({ error: error?.message || String(error), count: null });
    return res.status(502).json({ ok: false, message: '문의 조회 실패', error: error?.message });
  }

  const count = uncontacted.length;

  // Always log the cron heartbeat (7-day continuity tracking)
  await logCronHeartbeat({
    uncontacted_count: count,
    ran_at: new Date().toISOString(),
  });

  if (count === 0) {
    return res.status(200).json({ ok: true, alerted: 0, message: '미후속 문의 없음' });
  }

  // Build SMS alert text
  const oldest = uncontacted[0];
  const oldestTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(oldest.submitted_at));

  const alertText =
    `[STARGATE 미후속 경보]\n24시간 미후속 문의 ${count}건\n최초: ${oldest.name} ${oldestTime}\n/consult/ 원장을 확인하세요.`;

  // Send SMS alert to admin
  if (!(SOLAPI_API_KEY && SOLAPI_API_SECRET && isKoreanMobile(SOLAPI_SENDER) && isKoreanMobile(ADMIN_PHONE))) {
    console.warn('[alert-uncontacted] SMS skipped — SOLAPI or ADMIN_PHONE not configured');
    return res.status(503).json({ ok: false, alerted: 0, pending: count, smsSent: false, message: '경보 문자 환경 설정 누락' });
  }

  let smsSent = false;
  try {
    const smsRes = await fetch(SOLAPI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: createSolapiAuth(),
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        messages: [{ to: ADMIN_PHONE, from: SOLAPI_SENDER, text: alertText, country: '82', autoTypeDetect: true }],
        strict: true,
        allowDuplicates: false,
        showMessageList: false,
      }),
    });
    const smsData = await smsRes.json().catch(() => ({}));
    const failed = Array.isArray(smsData?.failedMessageList) ? smsData.failedMessageList.length : 0;
    smsSent = smsRes.ok && failed === 0;
    if (!smsSent) {
      console.error('[alert-uncontacted] SMS failed', { status: smsRes.status, failed });
    }
  } catch (error) {
    console.error('[alert-uncontacted] SMS error', error?.message);
  }

  // Leave alerted_at empty when the alert did not go out, so the next run
  // picks the same leads up again instead of silently dropping them.
  if (!smsSent) {
    return res.status(502).json({ ok: false, alerted: 0, pending: count, smsSent: false, message: '경보 문자 발송 실패' });
  }

  // Mark alerted_at on all uncontacted leads + log alerted_24h events
  const alertedAt = new Date().toISOString();
  const ids = uncontacted.map((l) => l.id);

  // Bulk update alerted_at using IN filter
  try {
    await sbFetch(
      '/rest/v1/leads?id=in.(' + ids.map((id) => `"${id}"`).join(',') + ')',
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ alerted_at: alertedAt }),
      },
    );
  } catch (error) {
    console.error('[alert-uncontacted] alerted_at patch failed', error?.message);
  }

  // Log alerted_24h for each lead
  for (const lead of uncontacted) {
    await logEvent(lead.id, 'alerted_24h', {
      alerted_at: alertedAt,
      sms_sent: smsSent,
    });
  }

  return res.status(200).json({
    ok: true,
    alerted: count,
    smsSent,
    message: `미후속 ${count}건 경보 처리 완료`,
  });
}
