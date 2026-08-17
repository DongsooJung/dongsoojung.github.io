const {
  STATE_COOKIE,
  clearStateCookie,
  parseCookies,
  requireConfig,
  sessionFromToken,
  setSession,
  tokenRequest,
  verifyState,
} = require('../_lib/kakao');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const config = requireConfig(req);
    const code = String(req.query?.code || '');
    const state = String(req.query?.state || '');
    const signedState = parseCookies(req)[STATE_COOKIE];
    clearStateCookie(res);

    if (!code || !verifyState(signedState, state, config.sessionSecret)) {
      return res.redirect(302, '/?auth=state_error');
    }

    const token = await tokenRequest(config, {
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
      code,
    });
    setSession(res, sessionFromToken(token), config.sessionSecret);
    return res.redirect(302, '/?auth=success');
  } catch (error) {
    console.error('Kakao OAuth callback failed', error.status || '', error.detail || error.message);
    return res.redirect(302, '/?auth=token_error');
  }
};
