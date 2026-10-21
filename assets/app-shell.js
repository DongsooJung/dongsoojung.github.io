// STARGATE "모바일(심플) 모드" 홈 화면.
// 기본은 기존 웹 홈페이지이며, 왼쪽 위 [모바일] 버튼을 누르면 html.is-app 클래스가 붙어 심플 모드로 전환됩니다.
// 선택은 localStorage(stargateViewMode)에 저장되어 다음 방문에도 유지되고, [웹] 버튼으로 되돌릴 수 있습니다.
(() => {
  const root = document.documentElement;
  const MODE_KEY = 'stargateViewMode';
  const saveMode = (mode) => { try { localStorage.setItem(MODE_KEY, mode); } catch (_) {} };

  const SVG = (paths) => `<svg class="ti" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    chart: '<path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>',
    monitor: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  };

  const TABS = [
    { key: 'home', href: '/', label: '홈', icon: ICON.home },
    { key: 'all', href: '#sg-projects', label: '전체메뉴', icon: ICON.menu },
    { key: 'search', href: '#sg-search', label: '검색', icon: ICON.search },
    { key: 'consult', href: '#customer-care', label: '상담', icon: ICON.chat },
    { key: 'research', href: '/research/', label: '연구', icon: ICON.chart },
  ];

  const B = '/assets/app-banners/';
  const BANNERS = [
    { href: '/koi-coach/', img: '01-koi', kicker: 'KOI · ALGORITHM', title: 'KOI 알고리즘 코치', sub: '정보올림피아드 대비 문제 풀이' },
    { href: '/research/', img: '02-research', kicker: 'RESEARCH', title: '연구 대시보드', sub: '도시·경제·공공데이터 관측' },
    { href: '/gh-sale-info/', img: '03-gh-cheongyak', kicker: 'LIVE DATA', title: 'GH 청약 공고', sub: '경기 공공주택 공고를 매일 수집' },
    { href: 'https://shop.stargateedu.co.kr/', img: '04-shop', kicker: 'SHOP', title: '스타게이트 쇼핑몰', sub: '교재·디지털 상품' },
    { href: '/strategy/', img: '05-strategy', kicker: 'STRATEGY', title: '전략 인사이트', sub: '플랫폼 기업·산업 분석 리서치' },
    { href: '/board/', img: '06-board', kicker: 'BOARD', title: '게시판', sub: '공지와 이야기를 나누는 공간', dark: true },
    { href: '#customer-care', img: '07-consult', kicker: 'CONSULT', title: '1:1 상담', sub: '교육·AI·연구 협업 상담 신청', dark: true },
    { href: '/election/', img: '08-election', kicker: 'ELECTION', title: '선거구 대시보드', sub: '수원·성남·화성·평택 16개 구', dark: true },
    { href: 'https://blog.stargateedu.co.kr/', img: '09-blog', kicker: 'BLOG', title: '스타게이트 블로그', sub: '교육·AI·연구 이야기', dark: true },
    { href: '/global/', img: '10-global', kicker: 'GLOBAL', title: 'GLOBAL STARGATE', sub: 'Korea Intelligence로 세계와 연결' },
  ];

  const CATS = [
    { href: '/koi-coach/', icon: '🧠', label: 'KOI' , keys: '정보올림피아드 알고리즘 코딩 코치' },
    { href: '/strategy/', icon: '📊', label: '전략' },
    { href: '/research/', icon: '🔬', label: '연구' },
    { href: '/board/', icon: '📝', label: '게시판' },
    { href: '#customer-care', icon: '💬', label: '상담' },
    { href: '/gh-sale-info/', icon: '🏠', label: '청약' , keys: 'GH 공공주택 분양 부동산' },
    { href: '/election/', icon: '🗳️', label: '선거구' , keys: '선거 수원 성남 화성 평택' },
    { href: 'https://shop.stargateedu.co.kr/', icon: '🛍️', label: '쇼핑' , keys: '쇼핑몰 교재 상품' },
    { href: 'https://blog.stargateedu.co.kr/', icon: '✍️', label: '블로그' },
    { href: '/global/', icon: '🌐', label: 'GLOBAL' },
  ];

  const ext = (href) => (href.startsWith('http') ? ' rel="noopener"' : '');

  function buildTop() {
    if (document.querySelector('.sg-top')) return;
    const top = document.createElement('header');
    top.className = 'sg-top';
    top.innerHTML = `
      <button class="sg-mode" type="button" data-view-mode="web" aria-label="웹 화면으로 보기" data-analytics-label="웹 화면 전환">${SVG(ICON.monitor).replace('class="ti"', '')}<span>웹</span></button>
      <a class="sg-logo" href="/" aria-label="스타게이트 홈">STAR<b>GATE</b></a>
      <label class="sg-search">
        ${SVG(ICON.search).replace('class="ti"', '')}
        <input id="sg-search" type="search" enterkeyhint="search" placeholder="검색" aria-label="서비스 검색" autocomplete="off">
      </label>`;
    document.body.prepend(top);
    addEventListener('scroll', () => top.classList.toggle('is-scrolled', scrollY > 4), { passive: true });
  }

  function buildHome() {
    const wrap = document.querySelector('.wrap');
    if (!wrap || document.querySelector('.sg-home')) return;
    const home = document.createElement('section');
    home.className = 'sg-home';
    home.setAttribute('aria-label', '앱 홈');
    home.innerHTML = `
      <div class="sg-banner sg-hide-on-search">
        <div class="sg-banner-track">
          ${BANNERS.map((b, i) => `<a class="sg-slide${b.dark ? ' is-dark-text' : ''}" href="${b.href}"${ext(b.href)} style="background-image:url('${B}${b.img}.webp')" data-analytics-label="앱 배너 ${b.title}"${i ? '' : ' data-first'}><small>${b.kicker}</small><strong>${b.title}</strong><span>${b.sub}</span></a>`).join('')}
        </div>
        <div class="sg-dots" aria-hidden="true">1 / ${BANNERS.length}</div>
      </div>
      <nav class="sg-cats" aria-label="메뉴">
        ${CATS.map((c) => `<a href="${c.href}"${ext(c.href)} data-sg-key="${c.label} ${c.keys || ''}" data-analytics-label="앱 메뉴 ${c.label}"><span class="ico" aria-hidden="true">${c.icon}</span>${c.label}</a>`).join('')}
      </nav>
      <div class="sg-gap"></div>
      <div class="sg-head" id="sg-projects"><h2 data-sg-title>추천 서비스</h2><a href="#" data-sg-all data-analytics-ignore>전체보기 ›</a></div>`;
    wrap.prepend(home);

    const empty = document.createElement('p');
    empty.className = 'sg-empty';
    empty.textContent = '검색 결과가 없습니다.';
    document.getElementById('projects-grid')?.after(empty);

    // 배너 자동 넘김 + 순서 표시
    const track = home.querySelector('.sg-banner-track');
    const dots = home.querySelector('.sg-dots');
    let index = 0;
    track.addEventListener('scroll', () => {
      index = Math.round(track.scrollLeft / track.clientWidth);
      dots.textContent = `${index + 1} / ${BANNERS.length}`;
    }, { passive: true });
    setInterval(() => {
      if (document.hidden || root.classList.contains('sg-searching')) return;
      const next = (index + 1) % BANNERS.length;
      track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
    }, 4500);

    // 전체보기: 홈에서 숨겨 둔 나머지 프로젝트까지 펼치기
    home.querySelector('[data-sg-all]').addEventListener('click', (event) => {
      event.preventDefault();
      const on = root.classList.toggle('sg-all');
      event.currentTarget.textContent = on ? '접기 ‹' : '전체보기 ›';
    });
  }

  function bindSearch() {
    const input = document.getElementById('sg-search');
    const cards = [...document.querySelectorAll('#projects-grid > .proj')];
    const empty = document.querySelector('.sg-empty');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      root.classList.toggle('sg-searching', !!q);
      let hits = 0;
      cards.forEach((card) => {
        const miss = !!q && (card.hidden || !card.textContent.toLowerCase().includes(q));
        card.classList.toggle('sg-miss', miss);
        if (q && !miss) hits += 1;
      });
      let menuHits = 0;
      document.querySelectorAll('.sg-cats a').forEach((a) => {
        const miss = !!q && !a.dataset.sgKey.toLowerCase().includes(q);
        a.hidden = miss;
        if (q && !miss) menuHits += 1;
      });
      const title = document.querySelector('[data-sg-title]');
      if (title) title.textContent = q ? `프로젝트 검색 결과 ${hits}건` : '추천 서비스';
      root.classList.toggle('sg-no-project-hit', !!q && hits === 0 && menuHits > 0);
      empty?.classList.toggle('is-on', !!q && hits === 0 && menuHits === 0);
      if (q && menuHits === 0) document.getElementById('sg-projects')?.scrollIntoView({ block: 'start' });
    });
  }

  function buildTabbar() {
    if (document.querySelector('.app-tabbar')) return;
    const path = location.pathname;
    const current = path === '/' || path === '/index.html' ? 'home' : path.startsWith('/research') ? 'research' : '';
    const bar = document.createElement('nav');
    bar.className = 'app-tabbar';
    bar.setAttribute('aria-label', '앱 메뉴');
    bar.innerHTML = TABS.map((t) => `<a href="${t.href}" data-tab="${t.key}"${t.key === current ? ' aria-current="page"' : ''} data-analytics-label="앱 탭 ${t.label}">${SVG(t.icon)}${t.label}</a>`).join('');
    document.body.append(bar);

    bar.querySelector('[data-tab="search"]').addEventListener('click', (event) => {
      event.preventDefault();
      scrollTo({ top: 0, behavior: 'smooth' });
      document.getElementById('sg-search')?.focus();
    });
    bar.querySelector('[data-tab="all"]').addEventListener('click', (event) => {
      event.preventDefault();
      root.classList.add('sg-all');
      const more = document.querySelector('[data-sg-all]');
      if (more) more.textContent = '접기 ‹';
      document.getElementById('sg-projects')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    bar.querySelector('[data-tab="home"]').addEventListener('click', (event) => {
      if (current !== 'home') return;
      event.preventDefault();
      scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  let built = false;
  function buildMobile() {
    if (built) return;
    built = true;
    buildTop();
    buildHome();
    bindSearch();
    buildTabbar();
  }

  // 웹 화면 왼쪽 위(로고 앞)에 [모바일] 버튼 추가
  function buildWebToggle() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('.sg-mode')) return;
    const brand = nav.querySelector('.brand');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sg-mode sg-mode-web';
    btn.dataset.viewMode = 'mobile';
    btn.setAttribute('aria-label', '모바일 화면으로 보기');
    btn.dataset.analyticsLabel = '모바일 화면 전환';
    btn.innerHTML = `${SVG(ICON.phone).replace('class="ti"', '')}<span>모바일</span>`;
    (brand || nav).prepend(btn); // 로고 바로 앞(같은 줄)에 배치
  }

  function setMode(mode) {
    const mobile = mode === 'mobile';
    if (mobile) buildMobile();
    root.classList.toggle('is-app', mobile);
    saveMode(mobile ? 'mobile' : 'web');
    scrollTo({ top: 0 });
  }

  function init() {
    buildWebToggle();
    if (root.classList.contains('is-app')) buildMobile();
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-view-mode]');
      if (!btn) return;
      event.preventDefault();
      setMode(btn.dataset.viewMode);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
