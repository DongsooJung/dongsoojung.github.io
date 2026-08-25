const {
  clearSession,
  currentSession,
  isSameOrigin,
  refreshSession,
  requireConfig,
  setCommonHeaders,
  setSession,
} = require('./_lib/kakao');

const MAX_MESSAGE_LENGTH = 200;
const MESSAGE_LINK_URL = 'https://stargateedu.co.kr/';

function validate(body) {
  const text = String(body?.message || '').trim();
  if (!text || text.length > MAX_MESSAGE_LENGTH) {
    return { error: '메시지는 1자 이상 200자 이하로 입력해 주세요.' };
  }
  return {
    text,
    buttonTitle: '홈페이지 열기',
    linkUrl: MESSAGE_LINK_URL,
  };
}

function mapKakaoError(data, status) {
  const code = Number(data?.code);
  const requiredScopes = Array.isArray(data?.required_scopes) ? data.required_scopes : [];
  if (code === -402 || requiredScopes.includes('talk_message')) {
    return { status: 403, code: 'KAKAO_CONSENT_REQUIRED', message: '카카오톡 메시지 전송 권한 동의가 필요합니다.' };
  }
  if (status === 401 || code === -401) {
    return { status: 401, code: 'KAKAO_LOGIN_EXPIRED', message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' };
  }
  if (code === -2) {
    return { status: 400, code: 'KAKAO_INVALID_TEMPLATE', message: '메시지 형식 또는 제품 링크 도메인 설정을 확인해 주세요.' };
  }
  if (code === -3) {
    return { status: 403, code: 'KAKAO_API_NOT_ALLOWED', message: '카카오 앱의 메시지 API 설정을 확인해 주세요.' };
  }
  if (code === -501) {
    return { status: 400, code: 'KAKAO_TALK_REQUIRED', message: '카카오톡에 가입된 계정으로 로그인해 주세요.' };
  }
  return { status: 502, code: 'KAKAO_SEND_FAILED', message: '카카오톡 메시지를 보내지 못했습니다.' };
}

async function sendMemo(accessToken, input) {
  const template = {
    object_type: 'text',
    text: input.text,
    link: { web_url: input.linkUrl, mobile_web_url: input.linkUrl },
    button_title: input.buttonTitle,
  };
  return fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: new URLSearchParams({ template_object: JSON.stringify(template) }),
  });
}

module.exports = async function handler(req, res) {
  setCommonHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'POST 요청만 허용됩니다.' });
  }

  try {
    const config = requireConfig(req);
    if (!isSameOrigin(req, config)) {
      return res.status(403).json({ ok: false, message: '허용되지 않은 요청 출처입니다.' });
    }

    const input = validate(req.body);
    if (input.error) return res.status(400).json({ ok: false, message: input.error });

    let session = await currentSession(req, res, config);
    if (!session) return res.status(401).json({ ok: false, code: 'KAKAO_LOGIN_REQUIRED', message: '카카오 로그인이 필요합니다.' });

    let response = await sendMemo(session.accessToken, input);
    if (response.status === 401 && session.refreshToken) {
      session = await refreshSession(config, session);
      setSession(res, session, config.sessionSecret);
      response = await sendMemo(session.accessToken, input);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.result_code !== 0) {
      const mapped = mapKakaoError(data, response.status);
      if (mapped.status === 401) clearSession(res);
      console.error('Kakao memo send failed', response.status, data.code || '');
      return res.status(mapped.status).json({ ok: false, code: mapped.code, message: mapped.message });
    }

    return res.status(200).json({ ok: true, message: '카카오톡 나에게 보내기를 완료했습니다.' });
  } catch (error) {
    const unavailable = error.code === 'KAKAO_NOT_CONFIGURED';
    console.error('Kakao send error', error.message);
    return res.status(unavailable ? 503 : 502).json({
      ok: false,
      code: unavailable ? 'KAKAO_NOT_CONFIGURED' : 'KAKAO_CONNECTION_FAILED',
      message: unavailable ? error.message : '카카오 API 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
};

module.exports._private = { MAX_MESSAGE_LENGTH, MESSAGE_LINK_URL, mapKakaoError, validate };
