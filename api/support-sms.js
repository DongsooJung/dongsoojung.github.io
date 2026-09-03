const crypto = require('crypto');

const SOLAPI_ENDPOINT = 'https://api.solapi.com/messages/v4/send-many/detail';
const MAX_BODY_LENGTH = 700;

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
  return String(req.headers?.origin || '');
}

function isAllowedOrigin(req) {
  const origin = requestOrigin(req);
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.replace(/^www\./, '');
    return host === 'stargateedu.co.kr';
  } catch {
    return false;
  }
}

function safeText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function validate(body) {
  const ticketId = safeText(body?.ticketId, 40);
  const name = safeText(body?.name, 40);
  const phone = normalizePhone(body?.phone);
  const category = safeText(body?.category, 30);
  const urgency = safeText(body?.urgency, 30) || '일반';
  const message = safeText(body?.message, MAX_BODY_LENGTH);
  const submittedAt = safeText(body?.submittedAt, 40);

  if (!/^SG-\d{6}-[A-Z0-9]{5}$/.test(ticketId)) return { error: '접수번호 형식이 올바르지 않습니다.' };
  if (!name) return { error: '이름이 필요합니다.' };
  if (!isKoreanMobile(phone)) return { error: '휴대전화번호 형식이 올바르지 않습니다.' };
  if (!category) return { error: '문의 유형이 필요합니다.' };
  if (message.length < 5) return { error: '문의 내용을 5자 이상 입력해 주세요.' };

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
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', 'https://stargateedu.co.kr');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, message: 'POST 요청만 허용됩니다.' });
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ ok: false, message: '허용되지 않은 요청 출처입니다.' });
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

  const customerText = `[STARGATE] ${input.name}님, 고객센터 문의가 접수되었습니다.\n접수번호: ${input.ticketId}\n문의유형: ${input.category}\n담당자 확인 후 연락드리겠습니다.`;
  const adminText = `[STARGATE CS] 신규 문의\n${input.ticketId}\n${input.urgency} / ${input.category}\n고객: ${input.name} ${input.phone}\n내용: ${input.message.slice(0, 350)}`;

  const messages = [{ to: input.phone, from: sender, text: customerText, country: '82', autoTypeDetect: true }];
  if (isKoreanMobile(adminPhone) && adminPhone !== input.phone) {
    messages.push({ to: adminPhone, from: sender, text: adminText, country: '82', autoTypeDetect: true });
  }

  try {
    const data = await sendMessages(messages, apiKey, apiSecret);
    const failed = Array.isArray(data.failedMessageList) ? data.failedMessageList : [];
    return res.status(200).json({
      ok: failed.length === 0,
      ticketId: input.ticketId,
      requested: messages.length,
      accepted: messages.length - failed.length,
      failed: failed.length,
      groupId: data.groupId || null,
    });
  } catch (error) {
    console.error('support-sms failed', error?.message || error);
    return res.status(502).json({ ok: false, message: '문의는 접수되었지만 문자 발송에 실패했습니다.' });
  }
}

module.exports = handler;
module.exports._private = { createAuthHeader, isAllowedOrigin, isKoreanMobile, normalizePhone, validate };
