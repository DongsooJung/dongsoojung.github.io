/* Try autoplay, then use the first user gesture if the browser blocks sound. */
(() => {
  const audio = document.getElementById('homepage-music');
  const hint = document.getElementById('homepage-music-hint');
  if (!audio) return;

  function hideHint() {
    if (hint) hint.hidden = true;
  }

  function tryPlay() {
    if (!audio.paused) return;
    let attempt;
    try {
      attempt = audio.play();
    } catch (error) {
      if (error.name === 'NotAllowedError' && hint) hint.hidden = false;
      return;
    }

    Promise.resolve(attempt).then(() => {
      hideHint();
    }, (error) => {
      if (audio.paused && error && error.name === 'NotAllowedError' && hint) hint.hidden = false;
    });
  }

  function removeGestureListeners() {
    document.removeEventListener('pointerdown', tryPlay, true);
    document.removeEventListener('touchstart', tryPlay, true);
    document.removeEventListener('keydown', tryPlay, true);
  }

  audio.addEventListener('playing', () => {
    hideHint();
    removeGestureListeners();
  }, { once: true });
  document.addEventListener('pointerdown', tryPlay, { capture: true, passive: true });
  document.addEventListener('touchstart', tryPlay, { capture: true, passive: true });
  document.addEventListener('keydown', tryPlay, true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tryPlay();
  });
  tryPlay();
})();
