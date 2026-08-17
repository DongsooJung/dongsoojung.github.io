const { getConfig, setCommonHeaders } = require('./_lib/kakao');

module.exports = function handler(req, res) {
  setCommonHeaders(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false });
  }
  const config = getConfig(req);
  return res.status(200).json({
    ok: true,
    configured: Boolean(config.clientId && config.origin && config.redirectUri && config.sessionSecret.length >= 32),
  });
};
