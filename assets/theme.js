(() => {
  const KEY = 'stargate-theme';
  const root = document.documentElement;

  const readSaved = () => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
      const legacy = localStorage.getItem('reading-theme');
      if (legacy === 'light' || legacy === 'dark') return legacy;
    } catch (_) {}
    return null;
  };

  const resolve = () =>
    readSaved() || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  const apply = (theme, { persist = false } = {}) => {
    const current = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = current;
    if (document.body) document.body.dataset.theme = current;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const light = meta.dataset.lightColor || '#f6f8fc';
      const dark = meta.dataset.darkColor || '#0b1020';
      meta.content = current === 'light' ? light : dark;
    }

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const nextIsLight = current === 'dark';
      const icon = btn.querySelector('[data-theme-icon]');
      const label = btn.querySelector('[data-theme-label]');
      if (icon) icon.textContent = nextIsLight ? '☀️' : '🌙';
      if (label) label.textContent = nextIsLight ? '화이트' : '다크';
      if (!label && !icon) btn.textContent = nextIsLight ? '☀️' : '🌙';
      btn.setAttribute('aria-pressed', String(current === 'light'));
      btn.setAttribute('aria-label', `${nextIsLight ? '화이트' : '다크'} 모드로 전환`);
      btn.title = `${nextIsLight ? '화이트' : '다크'} 모드로 전환`;
    });

    if (persist) {
      try {
        localStorage.setItem(KEY, current);
        localStorage.removeItem('reading-theme');
      } catch (_) {}
    }

    root.dispatchEvent(new CustomEvent('stargate:theme', { detail: { theme: current } }));
  };

  if (!root.dataset.theme) apply(resolve());
  else apply(root.dataset.theme);

  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      apply(root.dataset.theme === 'light' ? 'dark' : 'light', { persist: true });
    });
  });

  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', (event) => {
    if (!readSaved()) apply(event.matches ? 'light' : 'dark');
  });

  window.StargateTheme = { apply, resolve, KEY };
})();
