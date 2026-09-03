const crypto = require('crypto');

const SOLAPI_ENDPOINT = 'https://api.solapi.com/messages/v4/send-many/detail';
const MAX_BODY_LENGTH = 700;
const MAX_REQUEST_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set(['https://stargateedu.co.kr', 'https://www.stargateedu.co.kr']);
const ALLOWED_CATEGORIES = new Set(['일반문의', '결제·환불', '서비스 장애', '수업·교육', '배송', '개인정보', '기타 불편사항']);
const ALLOWED_URGENCY = new Set(['일반', '빠른 확인 요청', '긴급']);

const rateBuckets = globalThis.__STARGATE_SUPPORT_RATE__ || new Map();
const sentTickets = globalThis.__STARGATE_SUPPORT_SENT__ || new Map();
globalThis.__STARGATE_SUPPORT_RATE__ = rateBuckets;
globalThis.__STARGATE_SUPPORT_SENT__ = sentTickets;

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function isKoreanMobile(phone) {
  return /^01(?:0|1|6|7|8|9)\d{7,8}$/.test(phone);
}

function createAuthHeader(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

function requestOrigin(req) {
  return String(req.headers?.origin || '').trim();
}

function isAllowedOrigin(req) {
  return ALLOWED_ORIGINS.has(requestOrigin(req));
}

function safeText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function requestIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 80);
}

function cleanupMaps(now = Date.now()) {
  for (const [key, value] of rateBuckets) {
    if (!value || now - value.startedAt > RATE_WINDOW_MS * 2) rateBuckets.delete(key);
  }
  for (const [ticketId, timestamp] of sentTickets) {
    if (now - timestamp > IDEMPOTENCY_TTL_MS) sentTickets.delete(ticketId);
  }
}

function consumeRateLimit(ip, now = Date.now()) {
  cleanupMaps(now);
  const current = rateBuckets.get(ip);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return { ok: true, remaining: RATE_LIMIT - 1 };
  }
  if (current.count >= RATE_LIMIT) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - current.startedAt)) / 1000)) };
  }
  current.count += 1;
  return { ok: true, remaining: RATE_LIMIT - current.count };
}

function validate(body, now = Date.now()) {
  const ticketId = safeText(body?.ticketId, 40);
  const name = safeText(body?.name, 40);
  const phone = normalizePhone(body?.phone);
  const category = safeText(body?.category, 30);
  const urgency = safeText(body?.urgency, 30) || '일반';
  const message = safeText(body?.message, MAX_BODY_LENGTH);
  const submittedAt = safeText(body?.submittedAt, 40);

  if (!/^SG-\d{6}-[A-Z0-9]{5}$/.test(ticketId)) return { error: '접수번호 형식이 올바르지 않습니다.' };
  if (!name || name.length < 2) return { error: '이름을 확인해 주세요.' };
  if (!isKoreanMobile(phone)) return { error: '휴대전화번호 형식이 올바르지 않습니다.' };
  if (!ALLOWED_CATEGORIES.has(category)) return { error: '허용되지 않은 문의 유형입니다.' };
  if (!ALLOWED_URGENCY.has(urgency)) return { error: '허용되지 않은 긴급도입니다.' };
  if (message.length < 5) return { error: '문의 내용을 5자 이상 입력해 주세요.' };

  const submitted = Date.parse(submittedAt);
  if (!Number.isFinite(submitted) || Math.abs(now - submitted) > 15 * 60 * 1000) {
    return { error: '접수 시간이 유효하지 않습니다.' };
  }

  return { ticketId, name, phone, category, urgency, message, submittedAt };
}

async function sendMessages(messages, apiKey, apiSecret) {
  const response = await fetch(SOLAPI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: createAuthHeader(apiKey, apiSecret),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ messages, strict: true, allowDuplicates: false, showMessageList: false }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(data?.errorMessage || data?.message || `SOLAPI 요청 오류 (${response.status})`).slice(0, 240);
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function handler(req, res) {
  const origin = requestOrigin(req);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Origin');
  if (ALLOWED_ORIGINS.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);

  if (req.method === 'OPTIONS') {
    if (!isAllowedOrigin(req)) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, message: 'POST 요청만 허용됩니다.' });
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ ok: false, message: '허용되지 않은 요청 출처입니다.' });
  }
  if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return res.status(415).json({ ok: false, message: 'JSON 요청만 허용됩니다.' });
  }
  const contentLength = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return res.status(413).json({ ok: false, message: '요청 데이터가 너무 큽니다.' });
  }

  const ip = requestIp(req);
  const rate = consumeRateLimit(ip);
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return res.status(429).json({ ok: false, message: '잠시 후 다시 시도해 주세요.' });
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = normalizePhone(process.env.SOLAPI_SENDER_NUMBER);
  const adminPhone = normalizePhone(process.env.SUPPORT_ADMIN_PHONE || process.env.SOLAPI_ADMIN_PHONE);

  if (!apiKey || !apiSecret || !sender) {
    return res.status(503).json({ ok: false, message: '문자 발송 환경 설정이 완료되지 않았습니다.' });
  }

  const input = validate(req.body);
  if (input.error) return res.status(400).json({ ok: false, message: input.error });

  cleanupMaps();
  if (sentTickets.has(input.ticketId)) {
    return res.status(200).json({ ok: true, duplicate: true, ticketId: input.ticketId, requested: 0, accepted: 0, failed: 0 });
  }

  const customerText = `[STARGATE] ${input.name}님, 고객센터 문의가 접수되었습니다.\n접수번호: ${input.ticketId}\n문의유형: ${input.category}\n담당자 확인 후 연락드리겠습니다.`;
  const adminText = `[STARGATE CS] 신규 문의\n${input.ticketId}\n${input.urgency} / ${input.category}\n고객: ${input.name} ${input.phone}\n내용: ${input.message.slice(0, 350)}`;

  const messages = [{ to: input.phone, from: sender, text: customerText, country: '82', autoTypeDetect: true }];
  if (isKoreanMobile(adminPhone) && adminPhone !== input.phone) {
    messages.push({ to: adminPhone, from: sender, text: adminText, country: '82', autoTypeDetect: true });
  }

  try {
    const data = await sendMessages(messages, apiKey, apiSecret);
    const failed = Array.isArray(data.failedMessageList) ? data.failedMessageList : [];
    if (failed.length === 0) sentTickets.set(input.ticketId, Date.now());
    return res.status(200).json({
      ok: failed.length === 0,
      ticketId: input.ticketId,
      requested: messages.length,
      accepted: messages.length - failed.length,
      failed: failed.length,
      groupId: data.groupId || null,
    });
  } catch (error) {
    console.error('support-sms failed', { ticketId: input.ticketId, message: error?.message || String(error) });
    return res.status(502).json({ ok: false, message: '문의는 접수되었지만 문자 발송에 실패했습니다.' });
  }
}

module.exports = handler;
module.exports._private = {
  ALLOWED_CATEGORIES,
  ALLOWED_ORIGINS,
  ALLOWED_URGENCY,
  consumeRateLimit,
  createAuthHeader,
  isAllowedOrigin,
  isKoreanMobile,
  normalizePhone,
  requestIp,
  validate,
};
