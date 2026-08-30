// 관세청 국가별 수출입실적(GW) API 프록시 (국내 서울 리전 egress 목적)
//
// 관세청 게이트웨이가 해외(GitHub Actions 미국) IP를 403으로 차단하는 경우를
// 우회하기 위해, 이 저장소를 배포하는 Vercel 프로젝트의 서울(icn1) 리전에서
// 국내 IP로 중계한다. 수출입은행 프록시(exchange-rate/proxy)와 같은 패턴.
//
// 호출:  GET /api/customs?strtYymm=YYYYMM&endYymm=YYYYMM[&numOfRows=500&pageNo=1]
//        헤더  x-data-key: <data.go.kr 인증키>   (또는 ?serviceKey= 쿼리)
//
// 자가 진단: 응답 헤더 x-proxy-region 에 실제 실행 리전, x-upstream-status 에
// 관세청 게이트웨이의 HTTP 상태가 담긴다. icn1이 아니면 리전 미적용.

const TARGET = 'https://apis.data.go.kr/1220000/nationtrade/getNationtradeList';

export default async function handler(req, res) {
  const q = req.query || {};
  const strtYymm = String(q.strtYymm || '').replace(/[^0-9]/g, '');
  const endYymm = String(q.endYymm || strtYymm).replace(/[^0-9]/g, '');
  const numOfRows = String(q.numOfRows || '500').replace(/[^0-9]/g, '');
  const pageNo = String(q.pageNo || '1').replace(/[^0-9]/g, '');
  const serviceKey = req.headers['x-data-key'] || q.serviceKey || '';
  const region = process.env.VERCEL_REGION || 'unknown';
  res.setHeader('x-proxy-region', region);

  if (!strtYymm || !serviceKey) {
    res.status(400).json({ error: 'strtYymm 및 x-data-key(헤더) 또는 serviceKey 필요', region });
    return;
  }

  const url = `${TARGET}?serviceKey=${encodeURIComponent(serviceKey)}`
    + `&strtYymm=${strtYymm}&endYymm=${endYymm}&numOfRows=${numOfRows}&pageNo=${pageNo}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'stargate-customs-proxy', 'Accept': 'application/xml' },
    });
    const text = await r.text();
    res.setHeader('x-upstream-status', String(r.status));
    res.setHeader('content-type', 'text/xml; charset=utf-8');
    res.status(r.status).send(text);
  } catch (e) {
    res.status(502).json({ error: 'fetch_failed', detail: String(e), region });
  }
}
