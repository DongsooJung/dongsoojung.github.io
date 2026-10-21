/* Restore both independent preferences before first paint. */
(() => {
  'use strict';
  const root = document.documentElement;
  const fontKey = 'stargate-font';
  const sizeKey = 'stargate-text-size';
  const fonts = ['original', 'pen', 'brush'];
  const sizes = ['small', 'normal', 'large'];
  const normalizeFont = value => fonts.includes(value) ? value : 'original';
  const normalizeSize = value => sizes.includes(value) ? value : 'normal';
  function applyFont(value) {
    const font = normalizeFont(value);
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
  function applySize(value) {
    const size = normalizeSize(value);
    root.dataset.textSize = size;
    const select = document.getElementById('text-size-select');
    if (select) select.value = size;
    return size;
  }
  function read(key) {try {return localStorage.getItem(key)} catch (_) {return null}}
  function save(key,value) {try {localStorage.setItem(key,value)} catch (_) {}}
  applyFont(read(fontKey));
  applySize(read(sizeKey));
  function bind() {
    const font = document.getElementById('font-select');
    const size = document.getElementById('text-size-select');
    if (font) {
      font.value = normalizeFont(root.dataset.font);
      font.addEventListener('change',()=>save(fontKey,applyFont(font.value)));
    }
    if (size) {
      size.value = normalizeSize(root.dataset.textSize);
      size.addEventListener('change',()=>save(sizeKey,applySize(size.value)));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
  addEventListener('storage',event=>{
    if (event.key === fontKey || event.key === null) applyFont(event.newValue);
    if (event.key === sizeKey || event.key === null) applySize(event.newValue);
  });
})();
