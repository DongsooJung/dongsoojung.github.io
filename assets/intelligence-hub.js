(() => {
  const cardGroups = document.querySelector('.card-groups');
  if (cardGroups && !document.querySelector('#math-education')) {
    const group = document.createElement('details');
    group.className = 'card-group';
    group.dataset.cardGroup = '';
    group.id = 'math-education';
    group.open = true;
    group.innerHTML = `
      <summary class="card-group-summary">
        <span class="card-group-title"><strong>수학·교육 연구</strong><span>평가원·수능 문항을 조건 해석과 그래프로 분석하는 교육 연구</span></span>
        <span class="card-group-meta"><span data-group-count>1개</span><span class="chevron" aria-hidden="true"></span></span>
      </summary>
      <div class="grid">
        <a class="project" href="/research/math/2027-june-mock-15/" data-card data-category="tools ai">
          <div class="visual" style="--visual:radial-gradient(circle at 22% 18%,rgba(241,199,122,.52),transparent 52%),radial-gradient(circle at 82% 78%,rgba(79,127,255,.30),transparent 50%),linear-gradient(145deg,#0b1738,#243866)">∫</div>
          <div class="project-body">
            <div class="meta"><span class="pill accent">2027 · 6월 평가원</span><span class="pill">Math II · Q15</span></div>
            <h3>2027학년도 6월 평가원 수학 15번</h3>
            <p>절댓값 정적분을 함수의 부호 변화로 번역해 중근·단순근과 삼차함수를 역추론합니다. p·q 슬라이더로 조건을 직접 검증합니다.</p>
            <div class="project-footer"><span>정적분 · 부호 변화 · 인터랙티브</span><b>풀이 보기 →</b></div>
          </div>
        </a>
      </div>`;
    const toolsGroup = [...cardGroups.querySelectorAll('[data-card-group]')].find((item) =>
      item.querySelector('.card-group-title strong')?.textContent.includes('거시경제·관광')
    );
    if (toolsGroup) cardGroups.insertBefore(group, toolsGroup);
    else cardGroups.appendChild(group);

    const projectStat = [...document.querySelectorAll('.stats .stat')].find((item) =>
      item.textContent.includes('연구·데이터·도구 프로젝트')
    );
    const statNumber = projectStat?.querySelector('strong');
    if (statNumber && /^\d+$/.test(statNumber.textContent.trim())) {
      statNumber.textContent = String(Number(statNumber.textContent.trim()) + 1);
    }
  }

  const buttons = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('[data-card]')];
  const groups = [...document.querySelectorAll('[data-card-group]')];
  const input = document.querySelector('[data-search]');
  const count = document.querySelector('[data-result-count]');
  const empty = document.querySelector('[data-empty]');
  let active = 'all';

  const airbnbCard = document.querySelector('a.project[href="/airbnb/"]');
  if (airbnbCard) {
    const title = airbnbCard.querySelector('h3');
    const description = airbnbCard.querySelector('p');
    const pills = airbnbCard.querySelectorAll('.pill');
    const footerSource = airbnbCard.querySelector('.project-footer span');
    if (title) title.textContent = '부산 Airbnb · 공유숙박 소자본 분석';
    if (description) description.textContent = '영도·동구 저자본 후보 매물, 관광수요, 15·20·25박 월 손익과 합법 운영 체크포인트를 비교합니다.';
    if (pills[0]) pills[0].textContent = 'Daily';
    if (pills[1]) pills[1].textContent = 'Busan · Stay';
    if (footerSource) footerSource.textContent = '부산 · 매물 상태 자동점검';
  }

  const categoriesOf = (card) =>
    (card.dataset.category || '')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

  const apply = () => {
    const query = (input?.value || '').trim().toLowerCase();
    const filtering = active !== 'all' || !!query;
    let visible = 0;

    cards.forEach((card) => {
      const cats = categoriesOf(card);
      const categoryMatch = active === 'all' || cats.includes(active);
      const textMatch = !query || card.textContent.toLowerCase().includes(query);
      card.hidden = !(categoryMatch && textMatch);
      if (!card.hidden) visible += 1;
    });

    groups.forEach((group) => {
      const groupCards = [...group.querySelectorAll('[data-card]')];
      const groupVisible = groupCards.filter((card) => !card.hidden).length;
      group.hidden = groupVisible === 0;
      const badge = group.querySelector('[data-group-count]');
      if (badge) badge.textContent = `${groupVisible}개`;
      if (filtering && groupVisible > 0) group.open = true;
    });

    const visibleGroups = groups.filter((group) => !group.hidden);
    groups.forEach((group) => group.classList.remove('has-divider-after'));
    visibleGroups.slice(0, -1).forEach((group) => group.classList.add('has-divider-after'));

    if (count) count.textContent = `총 ${visible}개 콘텐츠`;
    if (empty) empty.classList.toggle('show', visible === 0);
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      active = button.dataset.filter;
      buttons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
      apply();
    });
  });
  input?.addEventListener('input', apply);
  apply();
})();