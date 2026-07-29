(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('[data-card]')];
  const groups = [...document.querySelectorAll('[data-card-group]')];
  const input = document.querySelector('[data-search]');
  const count = document.querySelector('[data-result-count]');
  const empty = document.querySelector('[data-empty]');
  let active = 'all';

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
