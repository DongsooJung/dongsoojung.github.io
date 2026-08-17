const {
  clearSession,
  currentSession,
  refreshSession,
  requireConfig,
  setCommonHeaders,
  setSession,
} = require('./_lib/kakao');

async function fetchProfile(accessToken) {
  return fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

module.exports = async function handler(req, res) {
  setCommonHeaders(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, message: 'GET 요청만 허용됩니다.' });
  }

  try {
    const config = requireConfig(req);
    let session = await currentSession(req, res, config);
    if (!session) return res.status(200).json({ ok: true, authenticated: false });

    let response = await fetchProfile(session.accessToken);
    if (response.status === 401 && session.refreshToken) {
      session = await refreshSession(config, session);
      setSession(res, session, config.sessionSecret);
      response = await fetchProfile(session.accessToken);
    }
    if (!response.ok) {
      clearSession(res);
      return res.status(200).json({ ok: true, authenticated: false });
    }

    const profile = await response.json();
    const nickname = String(profile.properties?.nickname || profile.kakao_account?.profile?.nickname || '카카오 사용자');
    return res.status(200).json({
      ok: true,
      authenticated: true,
      user: { id: String(profile.id || ''), nickname: nickname.slice(0, 60) },
    });
  } catch (error) {
    const unavailable = error.code === 'KAKAO_NOT_CONFIGURED';
    return res.status(unavailable ? 503 : 502).json({
      ok: false,
      authenticated: false,
      message: unavailable ? error.message : '카카오 로그인 상태를 확인하지 못했습니다.',
    });
  }
};
