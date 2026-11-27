/* 메인 세로 릴: 화면에 들어올 때만 내려받아 재생하고, 벗어나면 정지합니다.
   각 릴에 일시정지/재생 버튼을 두며, 사용자가 멈춘 릴은 다시 자동 재생하지 않습니다.
   모션 줄이기 설정이거나 IntersectionObserver가 없으면 포스터만 표시합니다. */
(() => {
  const reels = document.querySelectorAll('video.hm-reel[data-src]');
  if (!reels.length || !('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const play = (video) => {
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    const result = video.play();
    if (result && result.catch) result.catch(() => {});
  };
  const sync = (video, button) => {
    const paused = video.dataset.userPaused === '1';
    button.textContent = paused ? '재생' : '일시정지';
    button.setAttribute('aria-pressed', paused ? 'true' : 'false');
    button.setAttribute('aria-label', (paused ? '영상 재생: ' : '영상 일시정지: ') + (video.getAttribute('aria-label') || ''));
  };

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const video = entry.target;
      if (entry.isIntersecting && video.dataset.userPaused !== '1') play(video);
      else if (!entry.isIntersecting) video.pause();
    }
  }, { rootMargin: '200px 0px', threshold: 0.25 });

  reels.forEach((video) => {
    const button = video.parentElement && video.parentElement.querySelector('.hm-reel-toggle');
    if (button) {
      button.hidden = false;
      sync(video, button);
      button.addEventListener('click', () => {
        if (video.dataset.userPaused === '1') { delete video.dataset.userPaused; play(video); }
        else { video.dataset.userPaused = '1'; video.pause(); }
        sync(video, button);
      });
    }
    io.observe(video);
  });
})();
