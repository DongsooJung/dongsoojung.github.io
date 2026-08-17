const {
  clearSession,
  currentSession,
  isSameOrigin,
  refreshSession,
  requireConfig,
  setCommonHeaders,
  setSession,
} = require('./_lib/kakao');

function safeUrl(value, fallback) {
  try {
    const url = new URL(String(value || fallback));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function validate(body, origin) {
  const text = String(body?.message || '').trim();
  const buttonTitle = String(body?.buttonTitle || '홈페이지 열기').trim().slice(0, 20);
  if (!text || text.length > 1000) return { error: '메시지는 1자 이상 1,000자 이하로 입력해 주세요.' };
  return {
    text,
    buttonTitle: buttonTitle || '홈페이지 열기',
    linkUrl: safeUrl(body?.linkUrl, 'https://www.stargateedu.co.kr/'),
    origin,
  };
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

    const input = validate(req.body, config.origin);
    if (input.error) return res.status(400).json({ ok: false, message: input.error });

    let session = await currentSession(req, res, config);
    if (!session) return res.status(401).json({ ok: false, message: '카카오 로그인이 필요합니다.' });

    let response = await sendMemo(session.accessToken, input);
    if (response.status === 401 && session.refreshToken) {
      session = await refreshSession(config, session);
      setSession(res, session, config.sessionSecret);
      response = await sendMemo(session.accessToken, input);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.result_code !== 0) {
      if (response.status === 401) clearSession(res);
      const detail = String(data.msg || data.message || '').slice(0, 160);
      console.error('Kakao memo send failed', response.status, data.code || '', detail);
      return res.status(response.status === 401 ? 401 : 502).json({
        ok: false,
        message: response.status === 401
          ? '로그인이 만료되었습니다. 다시 로그인해 주세요.'
          : '카카오톡 메시지를 보내지 못했습니다. 앱 동의항목을 확인해 주세요.',
      });
    }

    return res.status(200).json({ ok: true, message: '카카오톡 나에게 보내기를 완료했습니다.' });
  } catch (error) {
    const unavailable = error.code === 'KAKAO_NOT_CONFIGURED';
    console.error('Kakao send error', error.message);
    return res.status(unavailable ? 503 : 502).json({
      ok: false,
      message: unavailable ? error.message : '카카오 API 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
};

module.exports._private = { safeUrl, validate };
