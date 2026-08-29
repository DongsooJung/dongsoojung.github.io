(() => {
  const STORAGE_KEY = 'stargate-q3-2026-status-v1';
  const areas = ['메가스터디', '위시켓', 'Android', '콘텐츠', '홈페이지', '자동화', '법인'];
  const sprints = [
    { no:'S0', range:'08.15–08.16', start:'2026-08-15', end:'2026-08-16', title:'기준선 확정', goal:'마감·증빙·작업량을 잠그고 월요일부터 바로 실행합니다.', tasks:[
      ['q3-01','메가스터디','P0','08.16','지원 공고·실제 마감 확인','지원자격·제출항목·접수경로를 한 장으로 정리','진행중'],
      ['q3-02','위시켓','P0','08.16','BidPilot 후보 10건 재점수화','종료 공고 제거, 적합도 75+만 제안 큐에 유지','진행중'],
      ['q3-03','Android','P0','08.16','Play 계정 유형·증빙 체크','인증·앱 등록 상태 미확인. 법인 계정 유형·필요 문서·D-U-N-S 증빙 확인','미확인'],
      ['q3-04','법인','P0','08.16','47일 운영 캘린더 잠금','세무·계약·현금흐름 점검일을 주간 캘린더에 등록','예정'],
      ['q3-05','메가스터디','P0','08.16','강사 지원서 1건 제출','실제 마감 08.16 · 내부 제출 목표 12:00. 지원서·시강 링크·포트폴리오를 최종 검수해 제출','미확인'] ]},
    { no:'W1', range:'08.17–08.23', start:'2026-08-17', end:'2026-08-23', title:'지원·제안 패키지 완성', goal:'첫 주 안에 커리어와 수주 파이프라인을 외부로 보냅니다.', tasks:[
      ['q3-06','메가스터디','P0','08.23','3분 시강 구성안 완성','도입 20초·핵심 풀이·학습효과·마무리 CTA','예정'],
      ['q3-07','위시켓','P0','08.23','맞춤 제안서 3건 제출','발주자 문제·유사 증빙·30/50/60일 납품계획 포함','예정'],
      ['q3-08','Android','P0','08.21','개발자 계정 등록·확인 시작','결제 프로필·이메일·전화·웹사이트 확인 착수','예정'],
      ['q3-09','법인','P1','08.23','주간 자금·증빙 점검 ①','입출금·세금계산서·계약 파일을 단일 폴더에 대사','예정'] ]},
    { no:'W2', range:'08.24–08.30', start:'2026-08-24', end:'2026-08-30', title:'보이는 증빙 만들기', goal:'말이 아니라 영상·샘플·등록상태로 역량을 증명합니다.', tasks:[
      ['q3-10','메가스터디','P0','08.27','시강 샘플 1편 녹화','모바일에서도 확인 가능한 비공개 링크와 썸네일 준비','예정'],
      ['q3-11','위시켓','P0','08.30','추가 제안 3건·미팅 1건','GIS·데이터 파이프라인·AI 자동화 순으로 집중','예정'],
      ['q3-12','콘텐츠','P1','08.28','첫 유료상품 범위 확정','고객 1명·문제 1개·결과 1개로 MVP 목차와 샘플 제작','예정'],
      ['q3-13','Android','P0','08.30','신원·기기 확인 및 패키지 등록','kr.co.stargateedu.app 소유·등록 상태를 Play Console에서 확인','예정'],
      ['q3-14','홈페이지','P1','08.30','전략 보드 주간 갱신 ①','진행률·링크·모바일 360px 표시 점검. 홈페이지 개선·운영의 검증 결과를 함께 반영','예정'],
      ['q3-home-https','홈페이지','P1','08.30','portal HTTPS·실제 배포 확인','portal.stargateedu.co.kr의 TLS 신뢰·최종 응답·배포 버전 확인. 과거 push/raw 기록만으로 완료 처리 금지','미확인'],
      ['q3-home-cta','홈페이지','P1','08.30','CTA 4개 목적지·라벨 점검','4/4 실제 도착 화면 검증 목표. smart-city-gis는 논문/특허 증거가 아니며 블로그는 보안제품 상세가 아님','미확인'] ]},
    { no:'W3', range:'08.31–09.06', start:'2026-08-31', end:'2026-09-06', title:'전환 구간', goal:'지원은 면접으로, 제안은 상담으로, 초안은 상품으로 전환합니다.', tasks:[
      ['q3-15','메가스터디','P0','09.03','면접·시강 대응팩 완성','예상질문 15개·3분/10분 시강·강의계획서 1식','예정'],
      ['q3-16','위시켓','P0','09.04','누적 제안 8건 달성','회신 없는 제안은 후속 1회 후 종료 사유 기록','예정'],
      ['q3-17','콘텐츠','P1','09.06','유료 MVP 본문 70%','교재·전자책·미니강의 중 선택한 1종의 판매 가능 초안','예정'],
      ['q3-18','Android','P0','09.06','AAB 빌드·내부 테스트','assetlinks 지문·서브페이지·오프라인 안내 확인','예정'],
      ['q3-19','자동화','P1','09.06','리드→후속조치 자동화 1개','신규 문의를 후속일·상태·담당 행동으로 자동 변환','예정'],
      ['q3-home-nav','홈페이지','P1','09.06','공통 네비 본사 URL 최신 확인','한글 파일 경로 인코딩을 포함해 소스와 실제 이동 경로 확인. 과거 검색 결과 0건은 정상 판정 근거가 아님','미확인'] ]},
    { no:'W4', range:'09.07–09.13', start:'2026-09-07', end:'2026-09-13', title:'첫 계약·첫 상품', goal:'외부 반응을 받는 두 개의 매출 경로를 동시에 열어둡니다.', tasks:[
      ['q3-20','메가스터디','P0','09.10','모의 시강 2회','촬영 후 말속도·판서·핵심 전달·마무리 피드백 반영','예정'],
      ['q3-21','위시켓','P0','09.13','계약 후보 1건 협상','범위·마일스톤·검수·지급조건을 문서로 확정','예정'],
      ['q3-22','콘텐츠','P1','09.13','유료상품·판매페이지 완성','가격·샘플·환불·전달 흐름까지 구매 가능 상태','예정'],
      ['q3-23','Android','P0','09.13','테스트 트랙 시작','개인 계정이면 12명×14일 요건, 법인 계정이면 출시 준비 검토','예정'],
      ['q3-24','법인','P0','09.13','8월 마감 증빙 정리','매출·비용·계약·세무자료 누락 0건 확인','예정'],
      ['q3-home-assets','홈페이지','P2','09.13','파비콘·OG 이미지 제작 및 메타 연결','실제 자산 2종 제작·배포 후 아이콘과 공유 미리보기의 이미지 응답 확인','미확인'],
      ['q3-home-seo','홈페이지','P2','09.13','robots·sitemap 정비','표준 도메인·색인 대상 URL·실제 응답 대조. 파일 생성만으로 정상 운영 판정 금지','미확인'] ]},
    { no:'W5', range:'09.14–09.20', start:'2026-09-14', end:'2026-09-20', title:'출시·운영 전환', goal:'만든 것을 공개하고 반복 가능한 운영 루프로 바꿉니다.', tasks:[
      ['q3-25','메가스터디','P1','09.16','지원 후속 1회','접수·검토 상태 확인 후 다음 행동 또는 대체 채널 결정','예정'],
      ['q3-26','위시켓','P0','09.20','첫 납품 마일스톤','계약 시 데모·설계·데이터 샘플 중 첫 검수물 제출','예정'],
      ['q3-27','콘텐츠','P1','09.20','유료 MVP 출시','홍보물 3개 배포·잠재고객 10명·첫 결제 경로 점검','예정'],
      ['q3-28','Android','P0','09.20','스토어 등록정보 100%','설명·아이콘·피처 그래픽·스크린샷·정책 설문 완료','예정'],
      ['q3-29','자동화','P1','09.20','주간 매출·파이프라인 리포트','제안→미팅→계약→매출을 자동 집계, 성공률 95% 확인','예정'] ]},
    { no:'W6', range:'09.21–09.27', start:'2026-09-21', end:'2026-09-27', title:'마감 전 집중', goal:'성과를 닫고 외부 기한에 필요한 것만 남깁니다.', tasks:[
      ['q3-30','메가스터디','P1','09.24','대체 강의채널 3곳 확보','결과 대기 시 지원자산을 학원·온라인·기업교육으로 재사용','예정'],
      ['q3-31','위시켓','P0','09.27','계약 1건·미팅 2건 판정','미달이면 상위 3개 리드와 Q4 첫 주 행동을 고정','예정'],
      ['q3-32','콘텐츠','P1','09.27','구매자 피드백 반영','반응·문의·환불·전환 데이터를 기준으로 1차 개정','예정'],
      ['q3-33','Android','P0','09.27','출시 준비 최종 점검','신원·패키지·서명·테스트·정책 상태를 증빙 캡처','예정'],
      ['q3-34','법인','P0','09.27','Q4 현금흐름·계약 백로그','고정비·예상매출·세금·외주 리스크를 10월 계획에 반영','예정'] ]},
    { no:'CLOSE', range:'09.28–09.30', start:'2026-09-28', end:'2026-09-30', title:'분기 마감', goal:'외부 기한을 지키고 Q3의 증빙과 Q4 첫 행동을 남깁니다.', tasks:[
      ['q3-35','Android','P0','09.30','개발자 확인·앱 등록 최종 확인','Play Console 홈에서 미등록 패키지·확인 경고 0건','예정'],
      ['q3-36','홈페이지','P1','09.30','Q3 최종 스냅숏·모바일 QA','KPI 실적·미완료 사유·증빙 링크·깨진 링크 0건','예정'],
      ['q3-37','자동화','P1','09.30','자동화 운영성 판정','2개 워크플로 성공률·오류·절감시간을 기록','예정'],
      ['q3-38','법인','P0','09.30','Q3 마감·Q4 백로그 확정','매출·비용·계약·세무·리스크와 10월 첫 5개 행동 고정','예정'] ]}
  ];

  const root = document.querySelector('[data-sprints]');
  const areaSelect = document.querySelector('[data-area-filter]');
  const priorityButtons = [...document.querySelectorAll('[data-priority]')];
  let priority = 'all';

  const readState = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { return {}; } };
  const state = readState();
  sprints.flatMap((s) => s.tasks).forEach((t) => { if (!state[t[0]]) state[t[0]] = t[6]; });
  const saveState = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {} };
  const esc = (value) => String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

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
    const focus = current ? `${current.querySelector('.sprint-no').childNodes[0].textContent.trim()} · ${current.querySelector('h3').textContent}` : (today < '2026-08-15' ? '8월 15일 실행 시작 전' : 'Q3 실행기간 종료 · 회고 필요');
    document.querySelector('[data-current-focus]').textContent = `현재 초점 · ${focus}`;
    const end = new Date('2026-09-30T23:59:59+09:00');
    document.querySelector('[data-days-left]').textContent = Math.max(0, Math.ceil((end - now) / 86400000));
  };

  document.querySelectorAll('[data-status]').forEach((select) => select.addEventListener('change', () => {
    const task = select.closest('[data-task]'); state[task.dataset.id] = select.value; select.dataset.value = select.value; task.classList.toggle('done', select.value === '완료'); saveState(); updateProgress();
  }));
  priorityButtons.forEach((button) => button.addEventListener('click', () => {
    priority = button.dataset.priority; priorityButtons.forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); }); applyFilter();
  }));
  areaSelect.addEventListener('change', applyFilter);
  // Evidence links must remain usable even when another area/priority is filtered.
  const revealLinkedTask = (hash) => {
    const target = [...document.querySelectorAll('[data-task]')].find((task) => `#${task.id}` === hash);
    if (!target) return;
    areaSelect.value = target.dataset.area;
    priority = 'all';
    priorityButtons.forEach((button) => {
      const active = button.dataset.priority === 'all';
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    applyFilter();
    target.scrollIntoView({ block: 'center' });
  };
  document.querySelectorAll('.homepage-ops a[href^="#q3-"]').forEach((link) => {
    link.addEventListener('click', () => revealLinkedTask(link.getAttribute('href')));
  });
  window.addEventListener('hashchange', () => revealLinkedTask(location.hash));
  document.querySelector('[data-reset]').addEventListener('click', () => {
    if (!window.confirm('이 브라우저에 저장된 모든 진행상태를 초기값으로 되돌릴까요?')) return;
    sprints.flatMap((s) => s.tasks).forEach((t) => { state[t[0]] = t[6]; }); saveState(); location.reload();
  });
  updateProgress(); applyFilter(); markCurrent(); revealLinkedTask(location.hash);
})();
