(() => {
  const KEY = 'stargate-theme';
  const THEMES = ['dark', 'light', 'ocean', 'mono'];
  const META = {
    dark: { label: '다크', icon: '🌙', color: '#0b1020', next: 'light' },
    light: { label: '화이트', icon: '☀️', color: '#f6f8fc', next: 'ocean' },
    ocean: { label: '오션', icon: '🌊', color: '#071a1f', next: 'mono' },
    mono: { label: '모노', icon: '◼', color: '#f3f2ef', next: 'dark' },
  };
  const root = document.documentElement;

  const normalize = (theme) => (THEMES.includes(theme) ? theme : 'dark');

  const readSaved = () => {
    try {
      const saved = localStorage.getItem(KEY);
      if (THEMES.includes(saved)) return saved;
      const legacy = localStorage.getItem('reading-theme');
      if (legacy === 'light' || legacy === 'dark') return legacy;
    } catch (_) {}
    return null;
  };

  const resolve = () =>
    readSaved() || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  const apply = (theme, { persist = false } = {}) => {
    const current = normalize(theme);
    const metaInfo = META[current];
    root.dataset.theme = current;
    if (document.body) document.body.dataset.theme = current;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const custom = meta.dataset[`${current}Color`];
      meta.content = custom || metaInfo.color;
    }

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const next = META[metaInfo.next];
      const icon = btn.querySelector('[data-theme-icon]');
      const label = btn.querySelector('[data-theme-label]');
      if (icon) icon.textContent = next.icon;
      if (label) label.textContent = next.label;
      if (!label && !icon) btn.textContent = next.icon;
      btn.setAttribute('aria-pressed', String(current === 'light' || current === 'mono'));
      btn.setAttribute('aria-label', `${next.label} 디자인으로 전환 (현재 ${metaInfo.label})`);
      btn.title = `현재 ${metaInfo.label} · 다음 ${next.label}`;
      btn.dataset.themeCurrent = current;
    });

    document.querySelectorAll('[data-theme-select]').forEach((select) => {
      if (select.value !== current) select.value = current;
      select.setAttribute('aria-label', `디자인 테마 선택 (현재 ${metaInfo.label})`);
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
      const current = normalize(root.dataset.theme);
      apply(META[current].next, { persist: true });
    });
  });

  document.querySelectorAll('[data-theme-select]').forEach((select) => {
    select.addEventListener('change', () => {
      apply(select.value, { persist: true });
    });
  });

  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', (event) => {
    if (!readSaved()) apply(event.matches ? 'light' : 'dark');
  });

  window.StargateTheme = { apply, resolve, KEY, THEMES, META };
})();
