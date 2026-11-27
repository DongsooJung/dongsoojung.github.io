/* 메인 세로 릴: 화면에 들어올 때만 내려받아 재생하고, 벗어나면 정지합니다.
   모션 줄이기 설정이거나 IntersectionObserver가 없으면 포스터만 표시합니다. */
(() => {
  const reels = document.querySelectorAll('video.hm-reel[data-src]');
  if (!reels.length || !('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const video = entry.target;
      if (entry.isIntersecting) {
        if (!video.getAttribute('src')) video.src = video.dataset.src;
        const playing = video.play();
        if (playing && playing.catch) playing.catch(() => {});
      } else {
        video.pause();
      }
    }
  }, { rootMargin: '200px 0px', threshold: 0.25 });
  reels.forEach((video) => io.observe(video));
})();
