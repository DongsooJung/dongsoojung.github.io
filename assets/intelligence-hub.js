(() => {
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
