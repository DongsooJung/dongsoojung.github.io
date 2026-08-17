const crypto = require('crypto');
const { requireConfig, setStateCookie } = require('../_lib/kakao');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const config = requireConfig(req);
    const state = crypto.randomBytes(24).toString('base64url');
    setStateCookie(res, state, config.sessionSecret);

    const authorizeUrl = new URL('https://kauth.kakao.com/oauth/authorize');
    authorizeUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'talk_message',
      state,
    }).toString();
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.redirect(302, authorizeUrl.toString());
  } catch {
    return res.redirect(302, '/?auth=config_error');
  }
};
