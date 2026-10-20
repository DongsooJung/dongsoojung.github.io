(() => {
  const cards = [...document.querySelectorAll('[data-card]')];
  if (!cards.length) return;
  if (document.body.classList.contains('research')) {
    const labels = { urban:'도시·공간', society:'경제·사회', research:'연구·AI', essays:'난제·에세이', education:'교육·수학', operations:'운영·제품' };
    const states = { pending:'출처 점검 대기', snapshot_checked:'게시본 확인 · 원출처 대조 대기', verified:'원출처 대조 완료', not_applicable:'기준월 비적용', source_unavailable:'원출처 접근 불가', awaiting_publication:'공표 대기', needs_review:'수치·범위 검증 필요' };
    const nodes = new Map();
    const review = document.createElement('p');
    review.className = 'dashboard-data-summary';
    const summaryText = document.createElement('span');
    summaryText.textContent = '출처·자료 기준 점검 목록을 불러오는 중입니다. ';
    const link = document.createElement('a');
    link.href = '/research/data-review/';
    link.textContent = '출처·자료 기준 전체 보기';
    review.append(summaryText, link);
    document.querySelector('.toolbar')?.after(review);
    cards.forEach((card) => {
      const node = document.createElement('div');
      node.className = 'dashboard-data-status';
      node.dataset.state = 'unknown';
      const details = document.createElement('span');
      details.className = 'dashboard-data-details';
      details.textContent = `분류: ${labels[card.dataset.primary] || '미확인'} · 출처·자료 기준 확인 중`;
      const state = document.createElement('span');
      state.className = 'dashboard-data-state';
      state.textContent = '출처 점검 대기';
      node.append(details, state);
      card.querySelector('.project-body')?.append(node);
      const url = new URL(card.getAttribute('href'), location.origin);
      const key = /^(www\.)?stargateedu\.co\.kr$/.test(url.hostname) || url.origin === location.origin
        ? url.pathname : url.href.replace(/\/$/, '');
      nodes.set(key, { node, details, state });
    });
    (async () => {
      try {
        const response = await fetch('/research/data-catalog.json', { cache:'no-store', signal:AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Catalog unavailable');
        const catalog = await response.json();
        let checked = 0, verified = 0;
        catalog.projects.forEach((project) => {
          const entry = nodes.get(project.key);
          if (!entry) return;
          checked += project.checkedAt ? 1 : 0;
          verified += project.reviewStatus === 'verified' ? 1 : 0;
          const source = project.source.label || `${project.sourceHint} (미검증)`;
          const period = project.dataAsOf || project.dataPeriod || project.referenceDescription || (project.reviewStatus === 'not_applicable' ? '비적용' : '미확인');
          entry.details.textContent = `출처: ${source} · 분류: ${project.classification} · 자료 기준: ${period} · 수집: ${project.collectedAt || '미공개'} · 게시본 갱신: ${project.snapshotUpdatedAt || '미확인'} · 확인: ${project.checkedAt || '미확인'} (UTC)`;
          entry.node.dataset.state = project.reviewStatus === 'verified' ? 'ok'
            : project.reviewStatus === 'needs_review' ? 'error'
            : project.freshness === 'older_than_target' ? 'stale' : 'unknown';
          entry.state.textContent = states[project.reviewStatus] || '점검 대기';
          if (project.issues.length) entry.state.title = project.issues.join(' ');
        });
        summaryText.textContent = `원출처 대조 ${verified}/${cards.length} · 게시본 등 확인 기록 ${checked}/${cards.length} · 2026년 9·10월 자료 단계별 점검 중. `;
      } catch (_) {
        summaryText.textContent = '출처 점검 목록을 불러오지 못했습니다. ';
        nodes.forEach(({ details }) => { details.textContent = '출처·자료 기준 확인 불가 · 전체 점검표를 확인하세요.'; });
      }
    })();
    return;
  }

  // Only these snapshots expose a machine-readable collection time.
  const monitored = {
    '/research/airport-congestion/': { file: '/research/airport-congestion/data/latest.json', field: 'generated_at', maxAgeHours: 0.75, mode: '정기 수집 · 10분 목표', source: '인천국제공항공사' },
    '/research/gimpo-airport-congestion/': { file: '/research/gimpo-airport-congestion/data/latest.json', field: 'generated_at', maxAgeHours: 0.75, mode: '정기 수집 · 10분 목표', source: '한국공항공사' },
    '/exchange-rate/': { file: '/exchange-rate/data.json', field: 'updatedAt', maxAgeHours: 168, mode: 'ECB 환율 스냅샷', source: '유럽중앙은행(ECB)' },
    '/trade/': { file: '/trade/data.json', field: 'updatedAt', maxAgeHours: 960, mode: '월간 API 스냅샷', source: '관세청' },
    '/class101/': { file: '/class101/data/latest.json', field: 'collectedAt', maxAgeHours: 36, mode: '일일 공개목록 수집', source: 'CLASS101 공개 페이지' },
    '/inflearn/': { file: '/inflearn/data/latest.json', field: 'collectedAt', maxAgeHours: 36, mode: '일일 공개목록 수집', source: '인프런 공개 페이지' }
  };
  const format = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const normalizePath = (href) => {
    try { return new URL(href, location.origin).pathname; }
    catch (_) { return ''; }
  };
  const groupMode = (card) => {
    const group = card.closest('[data-card-group]');
    const lane = group?.dataset.lane || '';
    if (lane === 'education') return '교육 콘텐츠';
    if (lane === 'operations') return '운영 도구';
    if (lane === 'research') return '연구·분석';
    if (group?.id === 'company-finance') return '재무 분석';
    if (group?.id === 'execution') return '실행 계획·도구';
    return '데이터 방식 미확인';
  };
  const statusNodes = new Map();
  cards.forEach((card) => {
    const body = card.querySelector('.project-body');
    if (!body) return;
    const source = card.querySelector('.project-footer span')?.textContent?.trim() || '출처 미표기';
    const config = monitored[normalizePath(card.getAttribute('href'))];
    const node = document.createElement('div');
    node.className = 'dashboard-data-status';
    node.dataset.state = config ? 'checking' : 'unknown';
    const details = document.createElement('span');
    details.className = 'dashboard-data-details';
    const state = document.createElement('span');
    state.className = 'dashboard-data-state';
    details.textContent = config
      ? '출처: ' + config.source + ' · 방식: ' + config.mode + ' · 갱신: 확인 중'
      : '출처: 미확인 · 카드 표기: ' + source + ' · 분류: ' + groupMode(card) + ' · 갱신: 시각 미공개';
    state.textContent = config ? '스냅샷 확인 중' : '자동 검증 미연결';
    node.append(details, state);
    body.appendChild(node);
    statusNodes.set(card, { details, state, node, source, config });
  });

  const summary = document.createElement('p');
  summary.className = 'dashboard-data-summary';
  const section = document.querySelector('#dashboards');
  const toolbar = section?.querySelector('.toolbar') || document.querySelector('.toolbar');
  if (toolbar) toolbar.insertAdjacentElement('afterend', summary);
  function refreshSummary() {
    const counts = { ok: 0, stale: 0, error: 0, checking: 0, unknown: 0 };
    statusNodes.forEach(({ node }) => { counts[node.dataset.state] += 1; });
    summary.textContent = '데이터 상태 · 스냅샷 확인 ' + counts.ok +
      ' · 갱신 지연 ' + counts.stale + ' · 확인 실패 ' + counts.error +
      ' · 확인 중 ' + counts.checking + ' · 자동 검증 미연결 ' + counts.unknown +
      ' | 상태는 데이터 파일의 수집 시각을 기준으로 합니다.';
  }
  refreshSummary();

  const byFile = new Map();
  statusNodes.forEach((entry) => {
    if (!entry.config) return;
    const list = byFile.get(entry.config.file) || [];
    list.push(entry);
    byFile.set(entry.config.file, list);
  });
  byFile.forEach(async (entries, file) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let state = 'error', updated = '확인 불가', message = '데이터 확인 실패';
    try {
      const response = await fetch(file, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!data || data.status === 'error' || (file === '/trade/data.json' && data.sourceMode !== 'api') || (file === '/exchange-rate/data.json' && data.sourceMode !== 'ecb')) throw new Error('data status error');
      const config = entries[0].config;
      const raw = data[config.field];
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw))
        ? new Date(raw + 'T00:00:00+09:00') : new Date(raw);
      const age = (Date.now() - date.getTime()) / 3600000;
      if (!Number.isFinite(age) || age < -0.1) throw new Error('invalid collection time');
      updated = config.field === 'updatedAt' ? String(raw) : format.format(date) + ' KST';
      state = age > config.maxAgeHours ? 'stale' : 'ok';
      message = state === 'ok' ? '스냅샷 확인' : '갱신 지연';
    } catch (_) {
      // A failed fetch or invalid timestamp must never be shown as healthy.
    } finally {
      clearTimeout(timeout);
      entries.forEach(({ details, node, state: label, config }) => {
        details.textContent = '출처: ' + config.source + ' · 방식: ' + config.mode + ' · 갱신: ' + updated;
        node.dataset.state = state;
        label.textContent = message;
      });
      refreshSummary();
    }
  });
})();
