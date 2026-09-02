const DEMO_NOTICES = [
  {
    title: '공공데이터 기반 지역경제 시각화 대시보드 구축',
    url: 'https://www.g2b.go.kr/',
    budget: 58000000,
    method: '협상에의한계약',
    deadline: '2026-09-20',
    description: '공공 API 수집, 데이터 분석, 반응형 웹 대시보드 시각화',
  },
  {
    title: '교육 데이터 분석 및 AI 학습지원 서비스 고도화',
    url: 'https://www.g2b.go.kr/',
    budget: 84000000,
    method: '협상에의한계약',
    deadline: '2026-09-26',
    description: '교육 데이터 파이프라인, 생성형 AI, 관리자 대시보드 개발',
  },
  {
    title: '전산실 서버 장비 납품 및 설치',
    url: 'https://www.g2b.go.kr/',
    budget: 130000000,
    method: '최저가',
    deadline: '2026-09-15',
    description: '랙 서버와 네트워크 장비 납품, 현장 설치',
  },
];

const POSITIVE = [
  ['공공데이터', 18], ['데이터', 8], ['시각화', 16], ['대시보드', 16],
  ['교육', 12], ['ai', 14], ['인공지능', 14], ['웹', 8], ['api', 10],
  ['분석', 10], ['자동화', 10], ['연구', 6],
];
const NEGATIVE = [
  ['하드웨어', -24], ['장비', -20], ['납품', -18], ['건설', -24],
  ['토목', -24], ['전기공사', -22], ['최저가', -12],
];

function scoreNotice(notice = {}) {
  const text = `${notice.title || ''} ${notice.description || ''} ${notice.method || ''}`.toLowerCase();
  let score = 38;
  const strengths = [];
  const risks = [];
  for (const [keyword, points] of POSITIVE) {
    if (text.includes(keyword)) {
      score += points;
      if (strengths.length < 3) strengths.push(keyword);
    }
  }
  for (const [keyword, points] of NEGATIVE) {
    if (text.includes(keyword)) {
      score += points;
      if (risks.length < 2) risks.push(keyword);
    }
  }
  const budget = Number(notice.budget || 0);
  if (budget >= 30000000 && budget <= 100000000) score += 8;
  if (budget > 250000000) {
    score -= 12;
    risks.push('대형 예산');
  }
  score = Math.max(0, Math.min(100, score));
  const go = score >= 65;
  return {
    ...notice,
    go,
    score,
    win_prob: Math.max(5, Math.min(78, Math.round(score * 0.72))),
    reason: strengths.length
      ? `핵심 역량 일치: ${strengths.join(' · ')}`
      : '현재 등록된 핵심 역량과의 직접 일치가 적습니다.',
    risk: risks.length ? `주의 요소: ${risks.join(' · ')}` : '',
    mode: 'DEMO',
  };
}

function allowCors(req, res) {
  const allowed = new Set(['https://stargateedu.co.kr', 'https://www.stargateedu.co.kr']);
  const origin = String(req.headers?.origin || '');
  if (allowed.has(origin)) res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,x-run-token');
  res.setHeader('vary', 'Origin');
  res.setHeader('cache-control', 'no-store');
}

export default function handler(req, res) {
  allowCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const action = String(req.query?.action || 'healthz');

  if (action === 'healthz' && req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'bidscout',
      mode: 'DEMO',
      source: 'built-in fixtures',
      externalRequests: false,
    });
  }

  if (action === 'run' && req.method === 'POST') {
    const results = DEMO_NOTICES.map(scoreNotice).sort((a, b) => b.score - a.score);
    return res.status(200).json({
      ok: true,
      mode: 'DEMO',
      collected: results.length,
      scored: results.length,
      go: results.filter((item) => item.go).length,
      top: results,
      notice: '배포 확인용 데모 데이터이며 실제 나라장터 조회가 아닙니다.',
    });
  }

  if (action === 'ingest' && req.method === 'POST') {
    const notices = Array.isArray(req.body?.notices) ? req.body.notices.slice(0, 20) : [];
    if (!notices.length) {
      return res.status(400).json({ ok: false, error: 'notices_required', message: '판정할 공고를 입력해 주십시오.' });
    }
    const results = notices.map(scoreNotice).sort((a, b) => b.score - a.score);
    return res.status(200).json({
      ok: true,
      mode: 'DEMO',
      scored: results.length,
      go: results.filter((item) => item.go).length,
      results,
      notice: '규칙 기반 데모 판정입니다. 입찰 의사결정에는 원문 검토가 필요합니다.',
    });
  }

  const allowed = action === 'healthz' ? 'GET' : action === 'run' || action === 'ingest' ? 'POST' : '';
  if (allowed) {
    res.setHeader('allow', allowed);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  return res.status(404).json({ ok: false, error: 'action_not_found' });
}

export const __test = { scoreNotice, DEMO_NOTICES };
