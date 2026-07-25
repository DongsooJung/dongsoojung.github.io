const test = require('node:test');
const assert = require('node:assert/strict');
const smsHandler = require('../api/sms');
const {
  constantTimeEqual,
  isKoreanMobile,
  maskPhone,
  normalizePhone,
  personalize,
  validatePayload,
} = smsHandler._private;

test('normalizes and validates Korean mobile numbers', () => {
  assert.equal(normalizePhone('010-1234-5678'), '01012345678');
  assert.equal(isKoreanMobile('01012345678'), true);
  assert.equal(isKoreanMobile('0212345678'), false);
  assert.equal(isKoreanMobile('0101234'), false);
});

test('personalizes every name token', () => {
  assert.equal(
    personalize('{이름}님, 안녕하세요. 담당자: {이름}', '김연구'),
    '김연구님, 안녕하세요. 담당자: 김연구',
  );
});

test('accepts up to ten unique recipients', () => {
  const recipients = Array.from({ length: 10 }, (_, index) => ({
    name: `고객${index + 1}`,
    phone: `010-1234-${String(index).padStart(4, '0')}`,
  }));
  const result = validatePayload({
    recipients,
    message: '{이름}님 안녕하세요.',
    confirmation: '발송',
  });

  assert.equal(result.error, undefined);
  assert.equal(result.recipients.length, 10);
});

test('rejects duplicates and more than ten recipients', () => {
  const duplicate = validatePayload({
    recipients: [
      { name: '가', phone: '010-1111-2222' },
      { name: '나', phone: '01011112222' },
    ],
    message: '안녕하세요.',
    confirmation: '발송',
  });
  assert.match(duplicate.error, /중복/);

  const tooMany = validatePayload({
    recipients: Array.from({ length: 11 }, (_, index) => ({
      name: `고객${index}`,
      phone: `010-2222-${String(index).padStart(4, '0')}`,
    })),
    message: '안녕하세요.',
    confirmation: '발송',
  });
  assert.match(tooMany.error, /10명/);
});

test('requires explicit confirmation', () => {
  const result = validatePayload({
    recipients: [{ name: '고객', phone: '010-1234-5678' }],
    message: '안녕하세요.',
    confirmation: '',
  });
  assert.match(result.error, /발송/);
});

test('compares admin tokens and masks phone numbers', () => {
  assert.equal(constantTimeEqual('secret', 'secret'), true);
  assert.equal(constantTimeEqual('secret', 'different'), false);
  assert.equal(maskPhone('01012345678'), '010****5678');
});

test('handler sends personalized messages through the SOLAPI endpoint', async (context) => {
  const originalFetch = global.fetch;
  const originalEnv = {
    SOLAPI_API_KEY: process.env.SOLAPI_API_KEY,
    SOLAPI_API_SECRET: process.env.SOLAPI_API_SECRET,
    SOLAPI_SENDER_NUMBER: process.env.SOLAPI_SENDER_NUMBER,
    SMS_ADMIN_TOKEN: process.env.SMS_ADMIN_TOKEN,
  };
  let request;

  process.env.SOLAPI_API_KEY = 'test-key';
  process.env.SOLAPI_API_SECRET = 'test-secret';
  process.env.SOLAPI_SENDER_NUMBER = '0212345678';
  process.env.SMS_ADMIN_TOKEN = 'test-admin-token';
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ groupId: 'group-test', failedMessageList: [] }),
    };
  };

  context.after(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await smsHandler(
    {
      method: 'POST',
      headers: {
        host: 'example.test',
        origin: 'https://example.test',
        'x-admin-token': 'test-admin-token',
      },
      body: {
        recipients: [
          { name: '김연구', phone: '010-1111-2222' },
          { name: '이분석', phone: '010-3333-4444' },
        ],
        message: '{이름}님, 자료가 준비되었습니다.',
        confirmation: '발송',
      },
    },
    response,
  );

  const payload = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://api.solapi.com/messages/v4/send-many/detail');
  assert.match(request.options.headers.Authorization, /^HMAC-SHA256 apiKey=test-key,/);
  assert.equal(payload.messages.length, 2);
  assert.equal(payload.messages[0].text, '김연구님, 자료가 준비되었습니다.');
  assert.equal(payload.messages[0].from, '0212345678');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.accepted, 2);
});
