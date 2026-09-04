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
        <span class="card-group-title"><strong>교육·수학 AI</strong><span>서술형 풀이 AI와 평가원·경시·사고력 문항 분석을 한곳에서 제공합니다</span></span>
        <span class="card-group-meta"><span data-group-count>5개</span><span class="chevron" aria-hidden="true"></span></span>
      </summary>
      <div class="grid">
        <a class="project" href="/research/math/archive/" data-card data-category="tools ai">
          <div class="visual" style="--visual:radial-gradient(circle at 22% 18%,rgba(241,199,122,.52),transparent 52%),radial-gradient(circle at 82% 78%,rgba(45,212,191,.28),transparent 50%),linear-gradient(145deg,#11172b,#31446d)">14</div>
          <div class="project-body">
            <div class="meta"><span class="pill accent">14 Problems</span><span class="pill">Math Archive</span></div>
            <h3>중등 수학 문제 14문제 아카이브</h3>
            <p>성대경시형 중1·중2·중3 각 3문제와 생각하는황소형 5문제를 데이터셋으로 관리합니다. 문제·답·핵심아이디어·풀이·블로그 발행상태를 한 화면에서 탐색합니다.</p>
            <div class="project-footer"><span>성대경시형 9 · 황소형 5 · 자동발행 소스</span><b>아카이브 →</b></div>
          </div>
        </a>
        <a class="project" href="/research/math/2027-june-mock-15/" data-card data-category="tools ai">
          <div class="visual" style="--visual:radial-gradient(circle at 22% 18%,rgba(241,199,122,.52),transparent 52%),radial-gradient(circle at 82% 78%,rgba(79,127,255,.30),transparent 50%),linear-gradient(145deg,#0b1738,#243866)">∫</div>
          <div class="project-body">
            <div class="meta"><span class="pill accent">2027 · 6월 평가원</span><span class="pill">Math II · Q15</span></div>
            <h3>2027학년도 6월 평가원 수학 15번</h3>
            <p>절댓값 정적분을 함수의 부호 변화로 번역해 중근·단순근과 삼차함수를 역추론합니다. p·q 슬라이더로 조건을 직접 검증합니다.</p>
            <div class="project-footer"><span>정적분 · 부호 변화 · 인터랙티브</span><b>풀이 보기 →</b></div>
          </div>
        </a>
        <a class="project" href="/research/math/skku-middle-factorial/" data-card data-category="tools">
          <div class="visual" style="--visual:radial-gradient(circle at 20% 18%,rgba(241,199,122,.50),transparent 52%),radial-gradient(circle at 82% 78%,rgba(129,140,248,.30),transparent 50%),linear-gradient(145deg,#17122a,#283e72)">!</div>
          <div class="project-body">
            <div class="meta"><span class="pill accent">성대경시 · 중2</span><span class="pill">Factorial</span></div>
            <h3>성대경시 중등부 팩토리얼 유형</h3>
            <p>2025 전기 중2 고난도 팩토리얼 유형을 재구성해 1000의 소인수 구조와 팩토리얼 나머지를 단계적으로 분석합니다.</p>
            <div class="project-footer"><span>팩토리얼 · 나머지 · 모듈러</span><b>풀이 보기 →</b></div>
          </div>
        </a>
        <a class="project" href="/research/math/thinking-bull-remainder/" data-card data-category="tools">
          <div class="visual" style="--visual:radial-gradient(circle at 20% 18%,rgba(217,164,65,.46),transparent 52%),radial-gradient(circle at 82% 78%,rgba(45,212,191,.28),transparent 50%),linear-gradient(145deg,#0b1738,#234f45)">≡</div>
          <div class="project-body">
            <div class="meta"><span class="pill accent">생각하는황소형</span><span class="pill">Remainder</span></div>
            <h3>황소형 배수·나머지 사고력 문제</h3>
            <p>여러 나머지 조건을 최소공배수 하나로 압축한 뒤 7의 배수 조건과 결합합니다. 후보 k를 움직여 답 119를 검증합니다.</p>
            <div class="project-footer"><span>배수 · 나머지 · 최소공배수</span><b>풀이 보기 →</b></div>
          </div>
        </a>
      </div>`;
    const mathAppCard = cardGroups.querySelector(
      'a.project[href="/math-grader/"]'
    );
    const mathGrid = group.querySelector('.grid');
    if (mathAppCard && mathGrid) {
      mathAppCard.classList.add('featured-learning-ai');
      const pills = mathAppCard.querySelectorAll('.pill');
      if (pills[0]) pills[0].textContent = 'Live · Learning AI';
      if (pills[1]) pills[1].textContent = 'Gemini · Education';
      const footerSource = mathAppCard.querySelector('.project-footer span');
      if (footerSource) footerSource.textContent = '단계별 풀이 · 검산 · 학습 기록';
      mathGrid.prepend(mathAppCard);
    }

    cardGroups.insertBefore(group, cardGroups.firstElementChild);

    const projectStat = [...document.querySelectorAll('.stats .stat')].find((item) =>
      item.textContent.includes('연구·데이터·도구 프로젝트')
    );
    const statNumber = projectStat?.querySelector('strong');
    if (statNumber && /^\d+$/.test(statNumber.textContent.trim())) {
      statNumber.textContent = String(Number(statNumber.textContent.trim()) + 4);
    }
  }

  const buttons = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('[data-card]')];
  const groups = [...document.querySelectorAll('[data-card-group]')];
  const input = document.querySelector('[data-search]');
  const count = document.querySelector('[data-result-count]');
  const empty = document.querySelector('[data-empty]');
  const sortKey = 'stargate-project-sort';
  const englishOrder = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const koreanOrder = new Intl.Collator('ko', { sensitivity: 'base', numeric: true });
  let active = 'all';
  let sortMode = 'alpha';

  try {
    if (localStorage.getItem(sortKey) === 'usage') sortMode = 'usage';
  } catch (_) {}

  const titleGroup = (title) => /^[A-Za-z]/.test(title) ? 0
    : /^\p{Script=Hangul}/u.test(title) ? 1
    : /^\p{N}/u.test(title) ? 2 : 3;

  const titledCard = (card) => {
    const title = (card.querySelector('h3')?.textContent || '')
      .normalize('NFKC').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    return { card, title, group: titleGroup(title) };
  };

  const compareAlpha = (a, b) => a.group - b.group
    || (a.group === 0 ? englishOrder : koreanOrder).compare(a.title, b.title);

  const usageScore = (card) => {
    const api = window.StargateUsage;
    if (api?.usageFor) return Number(api.usageFor(card)) || 0;
    const badge = card.querySelector(':scope > .stargate-click-count');
    return Number(String(badge?.textContent || '').replace(/[^\d]/g, '')) || 0;
  };

  const toolbar = document.querySelector('.toolbar');
  if (toolbar && !toolbar.querySelector('[data-sort]')) {
    const sortGroup = document.createElement('div');
    sortGroup.className = 'hub-sort-group';
    sortGroup.setAttribute('role', 'group');
    sortGroup.setAttribute('aria-label', '프로젝트 정렬');
    sortGroup.innerHTML = `
      <button class="hub-sort" type="button" data-sort="alpha" aria-pressed="${sortMode === 'alpha'}" data-analytics-ignore>가나다순</button>
      <button class="hub-sort" type="button" data-sort="usage" aria-pressed="${sortMode === 'usage'}" data-analytics-ignore>사용빈도순</button>
    `;
    const search = toolbar.querySelector('.search');
    if (search) toolbar.insertBefore(sortGroup, search);
    else toolbar.append(sortGroup);
  }
  const sortButtons = [...document.querySelectorAll('[data-sort]')];

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
      const grid = group.querySelector('.grid') || group;
      const groupCards = [...group.querySelectorAll('[data-card]')].map(titledCard);
      groupCards.sort((a, b) => sortMode === 'usage'
        ? usageScore(b.card) - usageScore(a.card) || compareAlpha(a, b)
        : compareAlpha(a, b));
      groupCards.forEach(({ card }) => grid.appendChild(card));

      const groupVisible = groupCards.filter(({ card }) => !card.hidden).length;
      group.hidden = groupVisible === 0;
      const badge = group.querySelector('[data-group-count]');
      if (badge) badge.textContent = `${groupVisible}개`;
      if (filtering && groupVisible > 0) group.open = true;
      group.dataset.usagePeak = String(Math.max(0, ...groupCards.map(({ card }) => usageScore(card))));
    });

    const parent = groups[0]?.parentElement;
    if (parent) {
      const orderedGroups = groups.slice().sort((a, b) => {
        if (sortMode !== 'usage') return groups.indexOf(a) - groups.indexOf(b);
        return (Number(b.dataset.usagePeak) || 0) - (Number(a.dataset.usagePeak) || 0)
          || groups.indexOf(a) - groups.indexOf(b);
      });
      orderedGroups.forEach((group) => parent.appendChild(group));
    }

    groups.forEach((group) => group.classList.remove('has-divider-after'));
    const orderedVisible = [...(groups[0]?.parentElement?.querySelectorAll('[data-card-group]') || [])]
      .filter((group) => !group.hidden);
    orderedVisible.slice(0, -1).forEach((group) => group.classList.add('has-divider-after'));

    if (count) {
      count.textContent = sortMode === 'usage'
        ? `총 ${visible}개 콘텐츠 · 사용빈도순`
        : `총 ${visible}개 콘텐츠 · 가나다순`;
    }
    if (empty) empty.classList.toggle('show', visible === 0);
  };

  const setSort = (mode) => {
    sortMode = mode === 'usage' ? 'usage' : 'alpha';
    try { localStorage.setItem(sortKey, sortMode); } catch (_) {}
    sortButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.sort === sortMode));
    });
    apply();
  };

  sortButtons.forEach((button) => {
    button.addEventListener('click', () => setSort(button.dataset.sort));
  });

  const bindUsage = () => {
    if (sortMode !== 'usage') return;
    apply();
  };
  if (window.StargateUsage?.subscribe) window.StargateUsage.subscribe(bindUsage);
  else document.addEventListener('stargate-usage-updated', bindUsage);

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
