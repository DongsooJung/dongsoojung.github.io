// STARGATE 하위 페이지(연구·전략) 모바일·폴드 모드.
// 홈에서 고른 화면 모드(localStorage stargateViewMode)를 그대로 이어받습니다.
// html.is-app / html.is-fold 클래스는 <head>의 감지 스크립트가 먼저 붙이며, 스타일은 app-shell.css를 함께 씁니다.
(() => {
  const root = document.documentElement;
  const MODE_KEY = 'stargateViewMode';
  const saveMode = (mode) => { try { localStorage.setItem(MODE_KEY, mode); } catch (_) {} };
  const path = location.pathname;
  const page = path.startsWith('/strategy') ? 'strategy' : path.startsWith('/research') ? 'research' : '';
  const TITLE = { research: '연구 대시보드', strategy: '전략 인사이트' }[page] || 'STARGATE';

  const SVG = (paths, cls = 'ti') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    strategy: '<path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    research: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>',
    fold: '<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M12 4v16"/>',
    monitor: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  };

  const TABS = [
    { key: 'home', href: '/', label: '홈', icon: ICON.home },
    { key: 'strategy', href: '/strategy/', label: '전략', icon: ICON.strategy },
    { key: 'search', href: '#', label: '검색', icon: ICON.search },
    { key: 'consult', href: '/#customer-care', label: '상담', icon: ICON.chat },
    { key: 'research', href: '/research/', label: '연구', icon: ICON.research },
  ];

  const modeButton = (mode, icon, label, extra = '') =>
    `<button class="sg-mode ${extra}" type="button" data-view-mode="${mode}" aria-label="${label} 화면으로 보기" data-analytics-label="${label} 화면 전환">${SVG(icon, '')}<span>${label}</span></button>`;

  // 웹 화면: 내비 맨 앞에 [모바일] [폴드] 버튼
  function buildWebToggle() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('.sg-mode')) return;
    const box = document.createElement('div');
    box.className = 'sg-mode-group';
    box.innerHTML = modeButton('mobile', ICON.phone, '모바일', 'sg-mode-web') + modeButton('fold', ICON.fold, '폴드', 'sg-mode-web');
    nav.prepend(box);
  }

  function buildTop() {
    if (document.querySelector('.sg-top')) return;
    const top = document.createElement('header');
    top.className = 'sg-top sg-sub-top';
    top.innerHTML = `
      ${modeButton('web', ICON.monitor, '웹')}
      <a class="sg-back" href="/" aria-label="홈으로">${SVG(ICON.back, '')}</a>
      <strong class="sg-page-title">${TITLE}</strong>
      <label class="sg-search">
        ${SVG(ICON.search, '')}
        <input id="sg-search" type="search" enterkeyhint="search" placeholder="검색" aria-label="${TITLE} 검색" autocomplete="off">
      </label>
      ${modeButton('fold', ICON.fold, '폴드', 'sg-mode-alt')}
      ${modeButton('mobile', ICON.phone, '모바일', 'sg-mode-alt')}`;
    document.body.prepend(top);
    addEventListener('scroll', () => top.classList.toggle('is-scrolled', scrollY > 4), { passive: true });

    // 상단 검색어를 페이지의 기존 검색창(data-search)에 그대로 전달해 카드 필터링을 재사용
    const mine = top.querySelector('#sg-search');
    const theirs = document.querySelector('[data-search]');
    if (theirs) {
      mine.placeholder = theirs.placeholder || '검색';
      mine.addEventListener('input', () => {
        theirs.value = mine.value;
        theirs.dispatchEvent(new Event('input', { bubbles: true }));
        if (mine.value.trim()) theirs.closest('.section, section')?.scrollIntoView({ block: 'start' });
      });
    }
  }

  function buildTabbar() {
    if (document.querySelector('.app-tabbar')) return;
    const bar = document.createElement('nav');
    bar.className = 'app-tabbar';
    bar.setAttribute('aria-label', '앱 메뉴');
    bar.innerHTML = TABS.map((t) => `<a href="${t.href}" data-tab="${t.key}"${t.key === page ? ' aria-current="page"' : ''} data-analytics-label="앱 탭 ${t.label}">${SVG(t.icon)}${t.label}</a>`).join('');
    document.body.append(bar);
    bar.querySelector('[data-tab="search"]').addEventListener('click', (event) => {
      event.preventDefault();
      scrollTo({ top: 0, behavior: 'smooth' });
      document.getElementById('sg-search')?.focus();
    });
  }

  function buildFoot() {
    const wrap = document.querySelector('.wrap');
    if (!wrap || wrap.querySelector('.sg-foot')) return;
    const foot = document.createElement('a');
    foot.className = 'sg-foot';
    foot.href = '/work-log/';
    foot.dataset.analyticsLabel = '앱 버전 개발자 로그';
    foot.innerHTML = '<span>STARGATE</span><b>v0.0.3</b><span>개발자 로그 ›</span>';
    wrap.append(foot);
  }

  function init() {
    buildWebToggle();
    if (root.classList.contains('is-app')) {
      buildTop();
      buildTabbar();
      buildFoot();
    }
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-view-mode]');
      if (!btn) return;
      event.preventDefault();
      // 하위 페이지는 테마·레이아웃 스크립트가 많아 새로고침으로 깔끔하게 전환
      saveMode(btn.dataset.viewMode);
      const url = new URL(location.href);
      url.searchParams.delete('view'); // 주소의 ?view= 가 새 선택을 덮어쓰지 않도록 제거
      location.replace(url.toString());
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
