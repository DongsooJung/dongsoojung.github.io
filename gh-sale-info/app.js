(() => {
  const REMOTE_PROXY_URL = 'https://portfolio-stargate2.vercel.app/api/gh-sale-info';
  const SAME_ORIGIN_PROXY_URL = '/api/gh-sale-info';
  const IS_STATIC_HOST = /(^|\.)github\.io$/i.test(location.hostname) ||
    /(^|\.)stargateedu\.co\.kr$/i.test(location.hostname);
  const API = IS_STATIC_HOST ? REMOTE_PROXY_URL : SAME_ORIGIN_PROXY_URL;

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));

  function render(rows = []) {
    const list = $('#list');
    if (!rows.length) {
      list.innerHTML = '<div class="empty">저장된 GH 청약공고가 없습니다.</div>';
      return;
    }
    list.innerHTML = rows.map((r) => `
      <a class="row" href="${esc(r.detail_url || r.source_url)}" target="_blank" rel="noopener">
        <div class="top"><span class="type">${esc(r.source_label || r.notice_type)}</span><span class="status">${esc(r.status || '공고')}</span></div>
        <h3>${esc(r.title)}</h3>
        <div class="meta"><span>${esc(r.region || '경기도')}</span><span>${esc(r.posted_at || '-')}</span><span>조회 ${Number(r.views || 0).toLocaleString('ko-KR')}</span></div>
      </a>
    `).join('');
  }

  async function load() {
    $('#state').textContent = 'Supabase 조회 중';
    const res = await fetch(API + '?limit=90', { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || '조회 실패');
    render(data.saved || []);
    const last = data.logs?.[0];
    $('#state').textContent = last
      ? `최근 수집 ${new Date(last.fetched_at).toLocaleString('ko-KR')} · ${last.row_count || 0}건`
      : '아직 수집 로그 없음';
  }

  async function collect() {
    const btn = $('#collect');
    btn.disabled = true;
    btn.textContent = '수집 중…';
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '수집 실패');
      $('#state').textContent = `${data.saved}건 Supabase 저장 완료`;
      await load();
    } catch (e) {
      $('#state').textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '지금 수집';
    }
  }

  $('#collect').addEventListener('click', collect);
  load().catch((e) => { $('#state').textContent = e.message; });
})();
