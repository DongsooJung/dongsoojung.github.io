(() => {
  const KEY = 'stargate-theme';
  try {
    const saved = localStorage.getItem(KEY);
    const legacy = localStorage.getItem('reading-theme');
    const picked = saved === 'light' || saved === 'dark'
      ? saved
      : (legacy === 'light' || legacy === 'dark' ? legacy : null);
    const theme = picked || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
