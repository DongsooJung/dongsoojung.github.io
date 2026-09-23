(() => {
  const STORAGE_KEY = 'stargate-q4-2026-status-v1';
  const areas = ['수주', 'Android', '홈페이지', '콘텐츠', '법인'];
  const sprints = [
    { no:'W1', range:'10.01–10.12', start:'2026-10-01', end:'2026-10-12', title:'상태 확인과 파이프라인 고정', goal:'Q3에서 미확인이던 외부 상태를 증빙하고, 수주 후보를 다시 잠깁니다.', tasks:[
      ['q4-01','수주','P0','10.08','위시켓·BidPilot 상위 3건 재점수','종료 공고 제거, 적합도 75+만 유지하고 제안 1건 제출','예정'],
      ['q4-02','Android','P0','10.10','Play Console 신원·패키지 상태 캡처','kr.co.stargateedu.app 등록·확인 경고 0건 여부를 스크린샷으로 기록','미확인'],
      ['q4-03','홈페이지','P0','10.12','portal HTTPS·CTA 4곳 실측','portal.stargateedu.co.kr TLS·도착 화면을 점검일·URL·응답코드로 기록','미확인']
    ]},
    { no:'W2', range:'10.13–10.26', start:'2026-10-13', end:'2026-10-26', title:'한 개의 매출 경로 열기', goal:'수주 또는 유료상품 중 하나만 외부에 내보냅니다.', tasks:[
      ['q4-04','수주','P0','10.20','맞춤 제안 3건·미팅 1건','GIS·데이터 파이프라인·AI 자동화만 제안. 회신 없으면 후속 1회 후 종료','예정'],
      ['q4-05','콘텐츠','P1','10.24','유료 MVP 1종 판매페이지','가격·샘플·전달 흐름이 있는 구매 가능 초안. 추가 시리즈는 만들지 않음','예정'],
      ['q4-06','Android','P0','10.26','AAB 내부 테스트 1회','assetlinks·오프라인 안내·서명 상태를 테스트 트랙에서 확인','예정']
    ]},
    { no:'W3', range:'10.27–11.09', start:'2026-10-27', end:'2026-11-09', title:'운영 루프와 분기 현금', goal:'주간 리포트와 법인 장부를 반복 가능한 형태로 고정합니다.', tasks:[
      ['q4-07','법인','P0','11.02','Q3 마감 증빙·Q4 현금흐름 1장','매출·비용·세금·고정비를 한 장으로 정리하고 10–11월 점검일을 캘린더에 등록','예정'],
      ['q4-08','홈페이지','P1','11.06','파비콘·OG·sitemap 실응답','자산 2종 배포 후 아이콘·공유 미리보기·sitemap 응답을 확인','미확인'],
      ['q4-09','수주','P0','11.09','계약 1건 또는 Q4 리드 3건 고정','계약이 없으면 상위 리드 범위·다음 행동을 문서로 남김','예정']
    ]},
    { no:'CLOSE', range:'11.10–11.14', start:'2026-11-10', end:'2026-11-14', title:'45일 판정', goal:'10개 과제 중 완료·보류·다음 분기 이관을 확정합니다.', tasks:[
      ['q4-10','법인','P0','11.14','45일 스냅숏과 다음 5개 행동','완료 증빙 링크, 미완료 사유, 12월 첫 주 행동 5개를 이 보드에 기록','예정']
    ]}
  ];
  const root = document.querySelector('[data-sprints]');
  const areaSelect = document.querySelector('[data-area-filter]');
  const priorityButtons = [...document.querySelectorAll('[data-priority]')];
  let priority = 'all';
  const readState = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { return {}; } };
  const state = readState();
  sprints.flatMap((s) => s.tasks).forEach((t) => { if (!state[t[0]]) state[t[0]] = t[6]; });
  const saveState = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} };
  const esc = (value) => String(value).replace(/[&<>'\"]/g, (c) => ({'&':'&','<':'<','>':'>',"'":'&#39;','"':'"'}[c]));
  areas.forEach((area) => areaSelect.insertAdjacentHTML('beforeend', `<option value="${esc(area)}">${esc(area)}</option>`));
  const taskHtml = (task) => {
    const [id, area, pri, due, title, detail] = task;
    const status = state[id];
    return `<div id="${id}" class="task ${status === '완료' ? 'done' : ''}" data-task data-id="${id}" data-area="${esc(area)}" data-pri="${pri}">
      <div class="task-meta"><span class="priority ${pri.toLowerCase()}">${pri}</span><span class="task-area">${esc(area)}</span></div>
      <div class="task-title">${esc(title)}<small>${esc(detail)}</small></div>
      <time class="task-date" datetime="2026-${due.replace('.', '-')}">${due}</time>
      <select class="status-select" data-status aria-label="${esc(title)} 진행상태" data-value="${status}">
        ${['미확인','예정','진행중','완료','보류'].map((v) => `<option${v === status ? ' selected' : ''}>${v}</option>`).join('')}
      </select></div>`;
  };
  root.innerHTML = sprints.map((sprint) => `<article class="sprint" data-sprint data-start="${sprint.start}" data-end="${sprint.end}">
    <header class="sprint-head"><div class="sprint-no">${sprint.no}<small>${sprint.range}</small></div><div class="sprint-title"><h3>${esc(sprint.title)}</h3><p>${esc(sprint.goal)}</p></div><div class="sprint-score"><strong data-sprint-score>0/${sprint.tasks.length}</strong><span>완료</span></div></header>
    <div class="task-list">${sprint.tasks.map(taskHtml).join('')}</div></article>`).join('');
  const updateProgress = () => {
    const tasks = [...document.querySelectorAll('[data-task]')];
    const done = tasks.filter((task) => state[task.dataset.id] === '완료').length;
    const pct = Math.round(done / tasks.length * 100);
    document.querySelector('[data-progress]').textContent = `${pct}%`;
    document.querySelector('[data-completed]').textContent = done;
    document.querySelector('[data-total]').textContent = tasks.length;
    document.querySelector('[data-progress-bar]').style.width = `${pct}%`;
    document.querySelector('[data-progress-ring]').style.setProperty('--progress', pct);
    document.querySelectorAll('[data-sprint]').forEach((sprint) => {
      const sprintTasks = [...sprint.querySelectorAll('[data-task]')];
      sprint.querySelector('[data-sprint-score]').textContent = `${sprintTasks.filter((t) => state[t.dataset.id] === '완료').length}/${sprintTasks.length}`;
    });
  };
  const applyFilter = () => {
    let visible = 0;
    document.querySelectorAll('[data-task]').forEach((task) => {
      const show = (priority === 'all' || task.dataset.pri === priority) && (areaSelect.value === 'all' || task.dataset.area === areaSelect.value);
      task.hidden = !show; if (show) visible += 1;
    });
    document.querySelectorAll('[data-sprint]').forEach((sprint) => { sprint.hidden = !sprint.querySelector('[data-task]:not([hidden])'); });
    document.querySelector('[data-empty]').classList.toggle('show', visible === 0);
  };
  const markCurrent = () => {
    const now = new Date();
    const kst = new Date(now.toLocaleString('en-US', { timeZone:'Asia/Seoul' }));
    const today = `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,'0')}-${String(kst.getDate()).padStart(2,'0')}`;
    const current = [...document.querySelectorAll('[data-sprint]')].find((s) => today >= s.dataset.start && today <= s.dataset.end);
    current?.classList.add('current');
    const focus = current ? `${current.querySelector('.sprint-no').childNodes[0].textContent.trim()} · ${current.querySelector('h3').textContent}` : (today < '2026-10-01' ? '10월 1일 실행 시작 전 · Q3 인계 확인' : 'Q4 45일 종료 · 판정 필요');
    document.querySelector('[data-current-focus]').textContent = `현재 초점 · ${focus}`;
    const end = new Date('2026-11-14T23:59:59+09:00');
    document.querySelector('[data-days-left]').textContent = Math.max(0, Math.ceil((end - now) / 86400000));
  };
  document.querySelectorAll('[data-status]').forEach((select) => select.addEventListener('change', () => {
    const task = select.closest('[data-task]'); state[task.dataset.id] = select.value; select.dataset.value = select.value; task.classList.toggle('done', select.value === '완료'); saveState(); updateProgress();
  }));
  priorityButtons.forEach((button) => button.addEventListener('click', () => {
    priority = button.dataset.priority; priorityButtons.forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); }); applyFilter();
  }));
  areaSelect.addEventListener('change', applyFilter);
  document.querySelector('[data-reset]').addEventListener('click', () => {
    if (!window.confirm('이 브라우저에 저장된 Q4 진행상태를 초기값으로 되돌릴까요?')) return;
    sprints.flatMap((s) => s.tasks).forEach((t) => { state[t[0]] = t[6]; }); saveState(); location.reload();
  });
  updateProgress(); applyFilter(); markCurrent();
})();
