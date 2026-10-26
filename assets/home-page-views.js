(() => {
  'use strict';

  const panel = document.getElementById('home-page-view-panel');
  const list = document.getElementById('home-page-view-list');
  const status = document.getElementById('home-page-view-status');
  const ROW_LIMIT = 8;
  const hiddenPrefixes = ['/admin/', '/api/', '/private-gateway/', '/sms/'];

  if (!panel || !list || !status) return;

  function normalizePath(value) {
    try {
      const url = new URL(String(value || '/'), window.location.origin);
      if (url.origin !== window.location.origin) return null;
      let path = url.pathname.replace(/index\.html$/i, '').replace(/\/{2,}/g, '/');
      if (path === '/') return '/';
      return path.replace(/\/+$/, '') + '/';
    } catch (_) {
      return null;
    }
  }

  function isVisiblePath(path) {
    return path && !hiddenPrefixes.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix));
  }

  function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function titleForPath(path) {
    if (path === '/') return '메인 페이지';
    const link = [...document.querySelectorAll('a[href]')].find((node) => {
      if (node.closest('#home-page-view-panel')) return false;
      try {
        const url = new URL(node.href, window.location.href);
        return url.origin === window.location.origin && normalizePath(url.pathname) === path;
      } catch (_) {
        return false;
      }
    });
    if (!link) return path;
    return compact(
      link.querySelector?.('h1,h2,h3,.ttl,.nm,.hub-kicker')?.textContent
      || link.dataset.analyticsLabel
      || link.getAttribute('aria-label')
      || link.textContent,
    ) || path;
  }

  function format(value) {
    return Number(value || 0).toLocaleString('ko-KR');
  }

  function render() {
    const analytics = window.StargateUsage;
    const state = analytics?.getLoadState?.().views || 'loading';
    list.replaceChildren();
    panel.dataset.state = state;

    if (state === 'loading') {
      status.textContent = '최근 30일 · 연결된 사이트 도메인 합산 · 집계 정보를 불러오는 중입니다.';
      return;
    }
    if (state === 'error') {
      status.textContent = '집계 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';
      return;
    }

    const rows = (analytics?.getPageViewRows?.(ROW_LIMIT * 3) || [])
      .map((row) => ({ ...row, page_path: normalizePath(row.page_path) }))
      .filter((row) => isVisiblePath(row.page_path))
      .slice(0, ROW_LIMIT);

    status.textContent = '최근 30일 · 연결된 사이트 도메인 합산';
    if (!rows.length) {
      status.textContent += ' · 조회 기록이 아직 없습니다.';
      return;
    }

    rows.forEach((row, index) => {
      const item = document.createElement('li');
      item.className = 'home-page-view-item';
      const rank = document.createElement('span');
      rank.className = 'home-page-view-rank';
      rank.textContent = String(index + 1);
      const link = document.createElement('a');
      link.href = row.page_path;
      link.className = 'home-page-view-link';
      link.textContent = titleForPath(row.page_path);
      link.title = row.page_path;
      const count = document.createElement('strong');
      count.className = 'home-page-view-count';
      count.textContent = `${format(row.page_views)}회`;
      count.setAttribute('aria-label', `${format(row.page_views)}회 조회`);
      item.append(rank, link, count);
      list.append(item);
    });
  }

  document.addEventListener('stargate-usage-updated', render);
  render();
})();
