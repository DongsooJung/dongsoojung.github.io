const { clearSession, getConfig, isSameOrigin, setCommonHeaders } = require('./_lib/kakao');

module.exports = function handler(req, res) {
  setCommonHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'POST 요청만 허용됩니다.' });
  }
  const config = getConfig(req);
  if (!isSameOrigin(req, config)) {
    return res.status(403).json({ ok: false, message: '허용되지 않은 요청 출처입니다.' });
  }
  clearSession(res);
  return res.status(200).json({ ok: true });
};
