/* Restore before first paint; keep the preference local to this browser. */
(() => {
  'use strict';
  const key = 'stargate-font';
  const root = document.documentElement;
  const fonts = ['original', 'pen', 'brush'];
  const normalize = value => fonts.includes(value) ? value : 'original';
  function apply(value) {
    const font = normalize(value);
    root.dataset.font = font;
    if (font !== 'original' && !document.getElementById('stargate-handwriting-fonts')) {
      const link = document.createElement('link');
      link.id = 'stargate-handwriting-fonts';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Nanum+Brush+Script&family=Nanum+Pen+Script&display=swap';
      document.head.append(link);
    }
    const select = document.getElementById('font-select');
    if (select) select.value = font;
    return font;
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch (_) {}
  apply(saved);
  function bind() {
    const select = document.getElementById('font-select');
    if (!select) return;
    select.value = normalize(root.dataset.font);
    select.addEventListener('change', () => {
      const font = apply(select.value);
      try { localStorage.setItem(key, font); } catch (_) {}
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
  addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
