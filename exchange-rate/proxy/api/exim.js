// 한국수출입은행 환율 API 프록시 (국내 서울 리전 egress 목적)
//
// 수출입은행 API는 해외(GitHub Actions 미국) IP를 302로 차단한다.
// 이 함수를 Vercel 서울(icn1) 리전에 배포하면 국내 IP로 중계되어 우회할 수 있다.
//
// 호출:  GET /api/exim?searchdate=YYYYMMDD&data=AP01
//        헤더  x-exim-authkey: <수출입은행 인증키>   (또는 ?authkey= 쿼리)
//
// 자가 진단: 응답 헤더 x-proxy-region 에 실제 실행 리전이 담긴다.
//   - icn1 이면 서울에서 실행(우회 성공 기대)
//   - 그 외(iad1 등)면 리전 미적용 → 유료 플랜/리전 설정 확인 필요
//   - upstream_redirect 오류가 나오면 해당 리전에서도 차단된 것

const TARGET = 'https://www.koreaexim.go.kr/site/program/financial/exchangeJSON';

export default async function handler(req, res) {
  const q = req.query || {};
  const searchdate = String(q.searchdate || '').replace(/[^0-9]/g, '');
  const data = String(q.data || 'AP01').replace(/[^A-Za-z0-9]/g, '');
  const authkey = req.headers['x-exim-authkey'] || q.authkey || '';
  const region = process.env.VERCEL_REGION || 'unknown';
  res.setHeader('x-proxy-region', region);

  if (!searchdate || !authkey) {
    res.status(400).json({ error: 'searchdate 및 x-exim-authkey(헤더) 필요', region });
    return;
  }

  const url = `${TARGET}?authkey=${encodeURIComponent(authkey)}`
    + `&searchdate=${searchdate}&data=${encodeURIComponent(data)}`;
  try {
    const r = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'stargate-exim-proxy' },
    });
    if (r.status >= 300 && r.status < 400) {
      res.status(502).json({
        error: 'upstream_redirect',
        hint: '해당 리전 IP도 수출입은행에 차단됨(302). 서울 리전인지 확인 필요.',
        status: r.status,
        location: r.headers.get('location'),
        region,
      });
      return;
    }
    const text = await r.text();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.status(r.status).send(text);
  } catch (e) {
    res.status(502).json({ error: 'fetch_failed', detail: String(e), region });
  }
}
