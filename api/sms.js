const crypto = require('crypto');

const SOLAPI_ENDPOINT = 'https://api.solapi.com/messages/v4/send-many/detail';
const MAX_RECIPIENTS = 10;
const MAX_TEXT_LENGTH = 1000;

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function isKoreanMobile(phone) {
  return /^01(?:0|1|6|7|8|9)\d{7,8}$/.test(phone);
}

function personalize(template, name) {
  return template.replace(/\{이름\}/g, name).trim();
}

function createAuthHeader(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(date + salt)
    .digest('hex');

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

function constantTimeEqual(received, expected) {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function maskPhone(phone) {
  if (phone.length < 8) return '***';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function requestHost(req) {
  return String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
    .split(',')[0]
    .trim();
}

function isSameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;

  try {
    return new URL(origin).host === requestHost(req);
  } catch {
    return false;
  }
}

function validatePayload(body) {
  const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
  const template = String(body?.message || '').trim();
  const confirmation = String(body?.confirmation || '').trim();

  if (recipients.length < 1 || recipients.length > MAX_RECIPIENTS) {
    return { error: `수신자는 1명부터 ${MAX_RECIPIENTS}명까지 입력해 주세요.` };
  }
  if (!template || template.length > MAX_TEXT_LENGTH) {
    return { error: `문자 내용은 1자 이상 ${MAX_TEXT_LENGTH}자 이하로 입력해 주세요.` };
  }
  if (confirmation !== '발송') {
    return { error: '최종 확인란에 “발송”을 입력해 주세요.' };
  }

  const normalized = [];
  const seen = new Set();

  for (let index = 0; index < recipients.length; index += 1) {
    const raw = recipients[index] || {};
    const name = String(raw.name || '').trim().slice(0, 40);
    const phone = normalizePhone(raw.phone);

    if (!name) return { error: `${index + 1}번째 고객 이름을 입력해 주세요.` };
    if (!isKoreanMobile(phone)) {
      return { error: `${index + 1}번째 휴대폰 번호를 확인해 주세요.` };
    }
    if (seen.has(phone)) {
      return { error: `${index + 1}번째 휴대폰 번호가 중복되었습니다.` };
    }

    seen.add(phone);
    normalized.push({ name, phone });
  }

  return { recipients: normalized, template };
}

function safeSolapiError(data, fallback) {
  const code = String(data?.errorCode || data?.error?.code || '').slice(0, 80);
  const message = String(
    data?.errorMessage || data?.error?.message || data?.message || fallback,
  ).slice(0, 240);
  return { code, message };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'POST 요청만 허용됩니다.' });
  }
  if (!isSameOrigin(req)) {
    return res.status(403).json({ ok: false, message: '허용되지 않은 요청 출처입니다.' });
  }

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const sender = normalizePhone(process.env.SOLAPI_SENDER_NUMBER);
  const adminToken = process.env.SMS_ADMIN_TOKEN;

  if (!apiKey || !apiSecret || !sender || !adminToken) {
    return res.status(503).json({
      ok: false,
      message: '문자 발송 환경 설정이 아직 완료되지 않았습니다.',
    });
  }
  if (!constantTimeEqual(req.headers?.['x-admin-token'], adminToken)) {
    return res.status(401).json({ ok: false, message: '관리자 인증값이 올바르지 않습니다.' });
  }

  const validation = validatePayload(req.body);
  if (validation.error) {
    return res.status(400).json({ ok: false, message: validation.error });
  }

  const messages = validation.recipients.map(({ name, phone }) => ({
    to: phone,
    from: sender,
    text: personalize(validation.template, name),
    country: '82',
    autoTypeDetect: true,
  }));

  try {
    const response = await fetch(SOLAPI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: createAuthHeader(apiKey, apiSecret),
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        messages,
        strict: true,
        allowDuplicates: false,
        showMessageList: false,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = safeSolapiError(data, `SOLAPI 요청 오류 (${response.status})`);
      return res.status(502).json({
        ok: false,
        message: error.message,
        errorCode: error.code || undefined,
      });
    }

    const failed = Array.isArray(data.failedMessageList) ? data.failedMessageList : [];
    return res.status(200).json({
      ok: true,
      groupId: data.groupId || null,
      requested: messages.length,
      accepted: messages.length - failed.length,
      failed: failed.length,
      failedRecipients: failed.map((item) => maskPhone(normalizePhone(item?.to))),
      message: failed.length
        ? `${messages.length - failed.length}건이 접수되고 ${failed.length}건이 거절되었습니다.`
        : `${messages.length}건 모두 SOLAPI에 접수되었습니다.`,
    });
  } catch {
    return res.status(502).json({
      ok: false,
      message: 'SOLAPI 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
}

module.exports = handler;
module.exports._private = {
  constantTimeEqual,
  createAuthHeader,
  isKoreanMobile,
  maskPhone,
  normalizePhone,
  personalize,
  validatePayload,
};
