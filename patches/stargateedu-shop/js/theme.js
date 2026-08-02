(() => {
  const KEY = 'stargate-theme';
  const root = document.documentElement;

  const readSaved = () => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) {}
    return null;
  };

  const resolve = () =>
    readSaved() || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  const apply = (theme, { persist = false } = {}) => {
    const current = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = current;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = current === 'light' ? '#F7F9FC' : '#0B1220';

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const nextIsLight = current === 'dark';
      const icon = btn.querySelector('[data-theme-icon]');
      const label = btn.querySelector('[data-theme-label]');
      if (icon) icon.textContent = nextIsLight ? '☀️' : '🌙';
      if (label) label.textContent = nextIsLight ? (btn.dataset.lightLabel || '화이트') : (btn.dataset.darkLabel || '다크');
      btn.setAttribute('aria-pressed', String(current === 'light'));
      btn.setAttribute('aria-label', nextIsLight
        ? (btn.dataset.lightAria || '화이트 모드로 전환')
        : (btn.dataset.darkAria || '다크 모드로 전환'));
    });

    if (persist) {
      try { localStorage.setItem(KEY, current); } catch (_) {}
    }
  };

  apply(resolve());

  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      apply(root.dataset.theme === 'light' ? 'dark' : 'light', { persist: true });
    });
  });

  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', (event) => {
    if (!readSaved()) apply(event.matches ? 'light' : 'dark');
  });
})();
