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
