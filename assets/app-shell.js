// STARGATE 앱(TWA·설치형 PWA) 전용 홈 화면 구성.
// html.is-app 클래스는 <head>의 감지 스크립트가 먼저 붙입니다. 웹 화면에서는 아무것도 하지 않습니다.
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('is-app')) return;

  const TABS = [
    { href: '/', icon: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', label: '홈', match: (p) => p === '/' || p === '/index.html' },
    { href: '/strategy/', icon: '<path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/>', label: '전략', match: (p) => p.startsWith('/strategy') },
    { href: '/board/', icon: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>', label: '게시판', match: (p) => p.startsWith('/board') },
    { href: '/#customer-care', icon: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', label: '상담', match: () => false },
    { href: '/research/', icon: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>', label: '연구', match: (p) => p.startsWith('/research') },
  ];

  const SHORTCUTS = [
    { href: '/koi-coach/', icon: '🧠', label: 'KOI 코치' },
    { href: '#customer-care', icon: '💬', label: '1:1 상담' },
    { href: '/gh-sale-info/', icon: '🏠', label: 'GH 청약' },
    { href: '/election/', icon: '🗳️', label: '선거구' },
    { href: 'https://shop.stargateedu.co.kr/', icon: '🛍️', label: '쇼핑몰' },
    { href: 'https://blog.stargateedu.co.kr/', icon: '✍️', label: '블로그' },
    { href: '/global/', icon: '🌐', label: 'GLOBAL' },
    { href: '/aphorisms.html', icon: '📜', label: '오늘의 격언' },
  ];

  const el = (tag, attrs = {}, html = '') => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (html) node.innerHTML = html;
    return node;
  };

  function buildHome() {
    const anchor = document.querySelector('.portal-view-switcher') || document.querySelector('.nav');
    if (!anchor || document.querySelector('.app-home')) return;

    const home = el('section', { class: 'app-home', 'aria-label': '앱 홈' });
    home.innerHTML = `
      <div class="app-greet">
        <div class="k">STARGATE</div>
        <h2>AI·공간데이터·KOI 교육 포털</h2>
        <p>연구 대시보드, 공공데이터 서비스, 상담을 한 곳에서 이용하세요.</p>
      </div>
      <div class="app-stats">
        <a class="app-stat" href="/admin/visitors/" rel="nofollow" data-analytics-label="앱 오늘 방문"><span>오늘 방문</span><strong data-app-mirror="visitor-today-count">-</strong></a>
        <a class="app-stat" href="/admin/visitors/" rel="nofollow" data-analytics-label="앱 누적 방문"><span>누적 방문</span><strong data-app-mirror="visitor-total-count">-</strong></a>
        <a class="app-stat" href="#projects" data-analytics-label="앱 게시된 프로젝트"><span>게시된 프로젝트</span><strong data-app-mirror="ops-live-count">-</strong></a>
        <a class="app-stat" href="#projects" data-analytics-label="앱 30일 조회"><span>최근 30일 조회</span><strong data-app-mirror="ops-view-count">-</strong></a>
      </div>
      <h2 class="app-section-title">바로가기</h2>
      <nav class="app-grid" aria-label="바로가기">
        ${SHORTCUTS.map((s) => `<a href="${s.href}"${s.href.startsWith('http') ? ' rel="noopener"' : ''} data-analytics-label="앱 바로가기 ${s.label}"><span class="ico" aria-hidden="true">${s.icon}</span>${s.label}</a>`).join('')}
      </nav>`;
    anchor.after(home);
  }

  // 기존 웹 카운터 값이 갱신되면 앱 카드에도 그대로 반영합니다.
  function mirrorCounters() {
    document.querySelectorAll('[data-app-mirror]').forEach((target) => {
      const source = document.getElementById(target.dataset.appMirror);
      if (!source) return;
      const sync = () => { target.textContent = (source.textContent || '-').trim() || '-'; };
      sync();
      new MutationObserver(sync).observe(source, { childList: true, characterData: true, subtree: true });
    });
  }

  function buildTabbar() {
    if (document.querySelector('.app-tabbar')) return;
    const path = location.pathname;
    const bar = el('nav', { class: 'app-tabbar', 'aria-label': '앱 메뉴' });
    bar.innerHTML = TABS.map((t) => `<a href="${t.href}"${t.match(path) ? ' aria-current="page"' : ''} data-analytics-label="앱 탭 ${t.label}"><svg class="ti" viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg>${t.label}</a>`).join('');
    document.body.append(bar);
  }

  function init() {
    buildHome();
    buildTabbar();
    mirrorCounters();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
