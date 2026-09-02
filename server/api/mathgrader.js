function allowCors(req, res) {
  const allowed = new Set(['https://stargateedu.co.kr', 'https://www.stargateedu.co.kr']);
  const origin = String(req.headers?.origin || '');
  if (allowed.has(origin)) res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,x-user-id');
  res.setHeader('vary', 'Origin');
  res.setHeader('cache-control', 'no-store');
}

function demoGrade(body = {}) {
  const problem = String(body.problem || '').trim();
  const rubric = String(body.rubric || '').trim();
  const maxScore = Math.max(1, Math.min(100, Number(body.max_score) || 10));
  const image = body.image && typeof body.image === 'object' ? body.image : {};
  if (!problem) return { error: '문제를 입력해 주십시오.' };
  if (!String(image.type || '').startsWith('image/')) return { error: '답안 이미지가 필요합니다.' };
  if (Number(image.size || 0) > 12 * 1024 * 1024) return { error: '이미지는 12MB 이하여야 합니다.' };

  const points = [0.3, 0.4, 0.3].map((share) => Number((maxScore * share).toFixed(1)));
  points[2] = Number((maxScore - points[0] - points[1]).toFixed(1));
  return {
    ok: true,
    mode: 'DEMO',
    readable: true,
    total_score: points[0] + points[1],
    max_score: maxScore,
    steps: [
      {
        step_no: 1,
        label: '문제 조건 파악',
        student_wrote: problem.slice(0, 80),
        verdict: 'correct',
        points: points[0],
        max_points: points[0],
        comment: '데모에서는 입력한 문제 문장을 기준으로 조건 파악 단계를 예시 표시합니다.',
      },
      {
        step_no: 2,
        label: rubric ? '채점 기준 적용' : '풀이 전략 전개',
        student_wrote: rubric ? rubric.slice(0, 80) : '답안 이미지 메타데이터 수신 완료',
        verdict: 'correct',
        points: points[1],
        max_points: points[1],
        comment: '운영 모드에서는 실제 이미지의 수식과 풀이 과정을 AI가 분석합니다.',
      },
      {
        step_no: 3,
        label: '계산 및 검산',
        student_wrote: String(image.name || '답안 이미지'),
        verdict: 'partial',
        points: 0,
        max_points: points[2],
        comment: '현재 데모는 이미지 내용을 읽지 않으므로 계산 정확성을 판정하지 않습니다.',
      },
    ],
    first_error: '이미지 내용 분석은 Gemini 연동 후 활성화됩니다.',
    misconception: '',
    hint: '운영 전환 전까지 이 점수는 UI 동작 확인용으로만 사용하십시오.',
    teacher_note: '배포 확인용 데모 결과입니다. 실제 학생 평가에 사용하지 마십시오.',
    balance: 3,
  };
}

export default function handler(req, res) {
  allowCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const action = String(req.query?.action || 'healthz');

  if (action === 'healthz' && req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'mathgrader',
      mode: 'DEMO',
      grader: 'metadata-stub',
      payments: false,
    });
  }
  if (action === 'credits' && req.method === 'GET') {
    return res.status(200).json({ ok: true, mode: 'DEMO', plan: 'trial', credits: 3 });
  }
  if (action === 'packs' && req.method === 'GET') {
    return res.status(200).json({ ok: true, mode: 'DEMO', payments_enabled: false, packs: [] });
  }
  if (action === 'grade' && req.method === 'POST') {
    const result = demoGrade(req.body || {});
    if (result.error) return res.status(400).json({ ok: false, detail: result.error });
    return res.status(200).json(result);
  }
  if (action.startsWith('payments')) {
    return res.status(503).json({ ok: false, error: 'payments_disabled', detail: '데모에서는 결제가 비활성화되어 있습니다.' });
  }

  const allowed = ['healthz', 'credits', 'packs'].includes(action) ? 'GET' : action === 'grade' ? 'POST' : '';
  if (allowed) {
    res.setHeader('allow', allowed);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  return res.status(404).json({ ok: false, error: 'action_not_found' });
}

export const __test = { demoGrade };
