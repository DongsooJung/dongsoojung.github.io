/* Play the supplied recording when the homepage opens or after the first gesture. */
(() => {
  const audio = document.getElementById('homepage-music');
  if (!audio) return;

  function tryPlay() {
    if (!audio.paused) return;
    const attempt = audio.play();
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
  }

  function removeGestureListeners() {
    document.removeEventListener('pointerdown', tryPlay, true);
    document.removeEventListener('touchstart', tryPlay, true);
    document.removeEventListener('keydown', tryPlay, true);
  }

  audio.addEventListener('playing', removeGestureListeners, { once: true });
  document.addEventListener('pointerdown', tryPlay, { capture: true, passive: true });
  document.addEventListener('touchstart', tryPlay, { capture: true, passive: true });
  document.addEventListener('keydown', tryPlay, true);
  tryPlay();
})();
