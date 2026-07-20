(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('[data-card]')];
  const input = document.querySelector('[data-search]');
  const count = document.querySelector('[data-result-count]');
  const empty = document.querySelector('[data-empty]');
  let active = 'all';

  const apply = () => {
    const query = (input?.value || '').trim().toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const categoryMatch = active === 'all' || card.dataset.category === active;
      const textMatch = !query || card.textContent.toLowerCase().includes(query);
      card.hidden = !(categoryMatch && textMatch);
      if (!card.hidden) visible += 1;
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
