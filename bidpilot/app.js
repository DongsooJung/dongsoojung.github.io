(() => {
  const cards = [...document.querySelectorAll('.opportunity-card')];
  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const backdrop = document.querySelector('.drawer-backdrop');
  const drawer = document.querySelector('.strategy-drawer');
  const closeButton = document.querySelector('.close');
  let lastTrigger = null;
  const awardState = { mode: 'bids', kind: 'servc', days: 7, pageNo: 1, pageSize: 30, totalCount: 0 };
  let awardRequest = 0;
  const won = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
  const fullWon = new Intl.NumberFormat('ko-KR');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  function renderAwardMetrics(items) {
    const amounts = items.map((item) => item.amount).filter((value) => value > 0);
    const rates = items.map((item) => item.rate).filter((value) => value > 0);
    const participants = items.map((item) => item.participants).filter((value) => value > 0);
    document.querySelector('#award-count').textContent = `${items.length}건`;
    document.querySelector('#award-amount').textContent = amounts.length ? `${won.format(mean(amounts))}원` : '—';
    document.querySelector('#award-rate').textContent = rates.length ? `${mean(rates).toFixed(2)}%` : '—';
    document.querySelector('#award-competition').textContent = participants.length ? `${mean(participants).toFixed(1)}개사` : '—';
    document.querySelector('#metric-label-count').textContent = '낙찰 스냅샷';
    document.querySelector('#metric-label-amount').textContent = '평균 낙찰금액';
    document.querySelector('#metric-label-rate').textContent = '평균 낙찰률';
    document.querySelector('#metric-label-competition').textContent = '평균 경쟁업체';
    document.querySelector('#metric-note-amount').textContent = '선택기간 공개 금액';
    document.querySelector('#metric-note-rate').textContent = '선택기간 유효값';
    document.querySelector('#metric-note-competition').textContent = '선택기간 참가업체 수';
  }

  function parseDate(value) { const parsed = Date.parse(String(value || '').replace(' ', 'T')); return Number.isFinite(parsed) ? parsed : 0; }

  function renderBidMetrics(items) {
    const prices = items.map((item) => item.estimatedPrice || item.budget).filter((value) => value > 0);
    const remaining = items.map((item) => Math.ceil((parseDate(item.closeAt) - Date.now()) / 86400000)).filter((value) => Number.isFinite(value) && value >= 0);
    document.querySelector('#award-count').textContent = `${items.length}건`;
    document.querySelector('#award-amount').textContent = prices.length ? `${won.format(mean(prices))}원` : '—';
    document.querySelector('#award-rate').textContent = `${remaining.filter((value) => value <= 7).length}건`;
    document.querySelector('#award-competition').textContent = remaining.length ? `${mean(remaining).toFixed(1)}일` : '—';
    document.querySelector('#metric-label-count').textContent = '공고 스냅샷';
    document.querySelector('#metric-label-amount').textContent = '평균 추정가격';
    document.querySelector('#metric-label-rate').textContent = '마감 임박';
    document.querySelector('#metric-label-competition').textContent = '평균 남은 기간';
    document.querySelector('#metric-note-amount').textContent = '선택기간 공개 금액';
    document.querySelector('#metric-note-rate').textContent = '7일 이내 마감';
    document.querySelector('#metric-note-competition').textContent = '마감일 공개 건';
  }

  function renderAwards(items) {
    const list = document.querySelector('#award-list');
    if (!items.length) { list.innerHTML = '<div class="award-empty">선택한 기간에 공개된 최종 낙찰 결과가 없습니다.</div>'; return; }
    list.innerHTML = items.map((item, index) => `
      <article class="award-row">
        <div class="award-rank">${String((awardState.pageNo - 1) * awardState.pageSize + index + 1).padStart(2, '0')}</div>
        <div class="award-main"><div><span>${escapeHtml(item.agency || '기관 미표시')}</span><time>${escapeHtml(item.awardedAt || item.openedAt || '')}</time></div><h3>${escapeHtml(item.title)}</h3><small>${escapeHtml(item.noticeNo)} · 낙찰 ${escapeHtml(item.winner || '업체 미표시')}</small></div>
        <div class="award-data"><div><span>낙찰금액</span><strong>${item.amount ? `${fullWon.format(item.amount)}원` : '비공개'}</strong></div><div><span>낙찰률</span><strong>${item.rate ? `${item.rate.toFixed(3)}%` : '—'}</strong></div><div><span>경쟁</span><strong>${item.participants ? `${item.participants}개사` : '—'}</strong></div></div>
      </article>`).join('');
  }

  function renderBids(items) {
    const list = document.querySelector('#award-list');
    if (!items.length) { list.innerHTML = '<div class="award-empty">선택한 기간에 등록된 입찰공고가 없습니다.</div>'; return; }
    list.innerHTML = items.map((item, index) => {
      const closeTime = parseDate(item.closeAt); const remaining = closeTime ? Math.ceil((closeTime - Date.now()) / 86400000) : NaN; const deadline = Number.isFinite(remaining) ? (remaining >= 0 ? `D-${remaining}` : '마감') : '—';
      const link = item.detailUrl ? `<a class="notice-link" href="${escapeHtml(item.detailUrl)}" target="_blank" rel="noopener">공고 원문 ↗</a>` : '';
      return `<article class="award-row"><div class="award-rank">${String((awardState.pageNo - 1) * awardState.pageSize + index + 1).padStart(2, '0')}</div><div class="award-main"><div><span>${escapeHtml(item.agency || item.demandAgency || '기관 미표시')}</span><time>${escapeHtml(item.noticeAt || '')}</time></div><h3>${escapeHtml(item.title)}</h3><small>${escapeHtml(item.noticeNo)} · ${escapeHtml(item.method || item.contractMethod || '계약방식 미표시')} ${link}</small></div><div class="award-data"><div><span>추정가격</span><strong>${item.estimatedPrice || item.budget ? `${fullWon.format(item.estimatedPrice || item.budget)}원` : '비공개'}</strong></div><div><span>입찰마감</span><strong>${escapeHtml(item.closeAt || '—')}</strong></div><div><span>남은 기간</span><strong>${deadline}</strong></div></div></article>`;
    }).join('');
  }

  async function loadAwards() {
    const requestId = ++awardRequest;
    const status = document.querySelector('#award-status'); const refresh = document.querySelector('#refresh-awards');
    const isBid = awardState.mode === 'bids';
    status.hidden = false; status.classList.remove('error'); status.textContent = `조달청 공식 ${isBid ? '입찰공고' : '낙찰정보'}를 불러오는 중입니다.`; refresh.disabled = true;
    try {
      const dataset = isBid ? 'bidpublic' : 'scsbid';
      const response = await fetch(`/data/${dataset}/${awardState.kind}.json?v=${Date.now()}`); const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || `${isBid ? '입찰공고' : '낙찰정보'}를 불러오지 못했습니다.`);
      if (requestId !== awardRequest) return;
      const cutoff = Date.now() - awardState.days * 86400000;
      const filtered = data.items.filter((item) => { const value = parseDate(isBid ? item.noticeAt : item.awardedAt || item.openedAt); return !value || value >= cutoff; });
      awardState.totalCount = filtered.length;
      const start = (awardState.pageNo - 1) * awardState.pageSize; const items = filtered.slice(start, start + awardState.pageSize);
      if (isBid) { renderBidMetrics(filtered); renderBids(items); } else { renderAwardMetrics(filtered); renderAwards(items); }
      const pages = Math.max(1, Math.ceil(awardState.totalCount / awardState.pageSize));
      document.querySelector('#award-page').textContent = `${awardState.pageNo} / ${pages}`;
      document.querySelector('#award-prev').disabled = awardState.pageNo <= 1; document.querySelector('#award-next').disabled = awardState.pageNo >= pages;
      document.querySelector('#award-updated').textContent = `조달청 나라장터 ${isBid ? '입찰공고' : '낙찰결과'} 최신 ${data.rowCount}건 스냅샷 · ${new Date(data.updatedAt).toLocaleString('ko-KR')} 갱신`; status.hidden = true;
    } catch (error) {
      if (requestId !== awardRequest) return;
      status.hidden = false; status.classList.add('error'); status.textContent = error.message; document.querySelector('#award-list').innerHTML = '';
      if (isBid) renderBidMetrics([]); else renderAwardMetrics([]); awardState.totalCount = 0; document.querySelector('#award-page').textContent = '1 / —'; document.querySelector('#award-updated').textContent = '스냅샷을 불러오지 못했습니다.'; document.querySelector('#award-prev').disabled = true; document.querySelector('#award-next').disabled = true;
    }
    finally { if (requestId === awardRequest) refresh.disabled = false; }
  }

  document.querySelectorAll('[data-award-kind]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-award-kind]').forEach((item) => item.classList.toggle('active', item === button)); awardState.kind = button.dataset.awardKind; awardState.pageNo = 1; loadAwards(); }));
  document.querySelectorAll('[data-procurement-mode]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-procurement-mode]').forEach((item) => item.classList.toggle('active', item === button)); awardState.mode = button.dataset.procurementMode; awardState.pageNo = 1; loadAwards(); }));
  document.querySelector('#award-days')?.addEventListener('change', (event) => { awardState.days = Number(event.target.value); awardState.pageNo = 1; loadAwards(); });
  document.querySelector('#refresh-awards')?.addEventListener('click', loadAwards);
  document.querySelector('#award-prev')?.addEventListener('click', () => { if (awardState.pageNo > 1) { awardState.pageNo -= 1; loadAwards(); } });
  document.querySelector('#award-next')?.addEventListener('click', () => { awardState.pageNo += 1; loadAwards(); });

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      filterButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      const filter = button.dataset.filter;
      cards.forEach((card) => { card.hidden = filter !== '전체' && card.dataset.type !== filter; });
    });
  });

  function openDrawer(card, trigger) {
    if (!card) return;
    lastTrigger = trigger || null;
    drawer.querySelector('.drawer-kicker').textContent = `PROPOSAL PLAYBOOK · #${card.dataset.id}`;
    drawer.querySelector('#drawer-title').textContent = card.dataset.title;
    drawer.querySelector('.drawer-score strong').textContent = card.dataset.score;
    drawer.querySelector('.drawer-score p').textContent = card.dataset.fit;
    drawer.querySelector('[data-strategy]').textContent = card.dataset.strategy;
    drawer.querySelector('[data-gap]').textContent = card.dataset.gap;
    drawer.querySelector('ul').innerHTML = card.dataset.evidence.split('|').map((item) => `<li>${item}</li>`).join('');
    drawer.querySelector('[data-wishket]').href = `https://www.wishket.com/project/${card.dataset.id}/`;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    closeButton.focus();
  }

  function closeDrawer() {
    backdrop.hidden = true;
    document.body.style.overflow = '';
    if (lastTrigger) lastTrigger.focus();
  }

  document.querySelectorAll('.strategy-open').forEach((button) => button.addEventListener('click', () => openDrawer(button.closest('.opportunity-card'), button)));
  document.querySelector('.open-top')?.addEventListener('click', (event) => openDrawer(cards[0], event.currentTarget));
  closeButton.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeDrawer(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !backdrop.hidden) closeDrawer(); });
  loadAwards();
})();
