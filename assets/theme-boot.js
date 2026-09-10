(() => {
  const KEY = 'stargate-theme';
  const THEMES = ['dark', 'light', 'ocean', 'mono'];
  try {
    const saved = localStorage.getItem(KEY);
    const legacy = localStorage.getItem('reading-theme');
    const picked = THEMES.includes(saved)
      ? saved
      : (legacy === 'light' || legacy === 'dark' ? legacy : null);
    const theme = picked || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
})();

(() => {
  const mount = () => {
    if (!/^\/strategy\/?$/.test(location.pathname)) return;
    const actions = document.querySelector('.hero-actions');
    if (!actions || actions.querySelector('[data-expressway-bid-radar]')) return;
    const link = document.createElement('a');
    link.className = 'btn';
    link.href = '/strategy/expressway-restarea-bid/';
    link.dataset.expresswayBidRadar = 'true';
    link.textContent = '도로공사 휴게소 입찰 레이더';
    actions.appendChild(link);
    const projectCount = document.querySelector('.stats .stat strong');
    if (projectCount && /^\d+$/.test(projectCount.textContent.trim())) {
      projectCount.textContent = String(Number(projectCount.textContent.trim()) + 1);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
