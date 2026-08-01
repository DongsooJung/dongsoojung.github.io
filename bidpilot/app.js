(() => {
  const cards = [...document.querySelectorAll('.opportunity-card')];
  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const backdrop = document.querySelector('.drawer-backdrop');
  const drawer = document.querySelector('.strategy-drawer');
  const closeButton = document.querySelector('.close');
  let lastTrigger = null;

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      filterButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      const filter = button.dataset.filter;
      cards.forEach((card) => { card.hidden = filter !== '전체' && card.dataset.type !== filter; });
    });
  });

  function openDrawer(card, trigger) {
    if (!card) return;
    lastTrigger = trigger || null;
    drawer.querySelector('.drawer-kicker').textContent = `PROPOSAL PLAYBOOK · #${card.dataset.id}`;
    drawer.querySelector('#drawer-title').textContent = card.dataset.title;
    drawer.querySelector('.drawer-score strong').textContent = card.dataset.score;
    drawer.querySelector('.drawer-score p').textContent = card.dataset.fit;
    drawer.querySelector('[data-strategy]').textContent = card.dataset.strategy;
    drawer.querySelector('[data-gap]').textContent = card.dataset.gap;
    drawer.querySelector('ul').innerHTML = card.dataset.evidence.split('|').map((item) => `<li>${item}</li>`).join('');
    drawer.querySelector('[data-wishket]').href = `https://www.wishket.com/project/${card.dataset.id}/`;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    closeButton.focus();
  }

  function closeDrawer() {
    backdrop.hidden = true;
    document.body.style.overflow = '';
    if (lastTrigger) lastTrigger.focus();
  }

  document.querySelectorAll('.strategy-open').forEach((button) => button.addEventListener('click', () => openDrawer(button.closest('.opportunity-card'), button)));
  document.querySelector('.open-top')?.addEventListener('click', (event) => openDrawer(cards[0], event.currentTarget));
  closeButton.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeDrawer(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !backdrop.hidden) closeDrawer(); });
})();
