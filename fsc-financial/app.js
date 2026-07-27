(() => {
  const ENDPOINT =
    'https://apis.data.go.kr/1160100/service/GetFinaStatInfoService_V2/getSummFinaStat_V2';
  const KEY_STORAGE = 'stargate-data-go-kr-key';
  // 기본 공공데이터포털 키 — 입력 없이도 바로 조회
  const DEFAULT_SERVICE_KEY =
    'fcc95a3d84cbb220391765c9ba129573f32b5e86bfc746483e0e96a806b35c9c';
  const PAGE_SIZE = 100;
  const OK_CODES = new Set(['00', '0', '000', 'NORMAL_SERVICE', 'NORMAL SERVICE.']);
  const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;

  const els = {
    key: document.getElementById('apiKey'),
    year: document.getElementById('bizYear'),
    crno: document.getElementById('crno'),
    pageLabel: document.getElementById('pageLabel'),
    totalLabel: document.getElementById('totalLabel'),
    status: document.getElementById('status'),
    notice: document.getElementById('notice'),
    loadBtn: document.getElementById('loadBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    seedBtn: document.getElementById('seedBtn'),
    csvBtn: document.getElementById('csvBtn'),
    tbody: document.getElementById('tbody'),
    empty: document.getElementById('empty'),
    kpiCount: document.getElementById('kpiCount'),
    kpiSales: document.getElementById('kpiSales'),
    kpiProfit: document.getElementById('kpiProfit'),
    kpiDebt: document.getElementById('kpiDebt'),
    sourceMode: document.getElementById('sourceMode'),
  };

  const state = {
    pageNo: 1,
    totalCount: 0,
    items: [],
    sortKey: 'enpSaleAmt',
    sortDir: -1,
    charts: { sales: null, debt: null, scatter: null },
  };

  function decodeServiceKey(raw) {
    let key = String(raw || '').trim();
    if (!key) return '';
    // 포털에서 복사한 인코딩 키를 한 번만 디코딩 (이중 인코딩 방지)
    try {
      if (PCT_ENCODED.test(key)) key = decodeURIComponent(key);
    } catch (_) {
      /* keep original */
    }
    return key;
  }

  function num(v) {
    const n = Number(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function fmtWon(v) {
    const n = num(v);
    const abs = Math.abs(n);
    if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}조`;
    if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
    if (abs >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
    return n.toLocaleString('ko-KR');
  }

  function fmtRatio(v) {
    const n = num(v);
    return `${n.toFixed(1)}%`;
  }

  function setStatus(msg, kind = '') {
    els.status.textContent = msg || '';
    els.status.dataset.kind = kind;
  }

  function setNotice(msg, kind = '') {
    els.notice.textContent = msg || '';
    els.notice.dataset.kind = kind;
  }

  function resolveServiceKey() {
    const typed = decodeServiceKey(els.key?.value);
    if (typed) return typed;
    const saved = decodeServiceKey(localStorage.getItem(KEY_STORAGE) || '');
    if (saved) return saved;
    return DEFAULT_SERVICE_KEY;
  }

  function saveKey() {
    const key = decodeServiceKey(els.key.value);
    if (key && key !== DEFAULT_SERVICE_KEY) {
      localStorage.setItem(KEY_STORAGE, key);
    }
  }

  function loadKey() {
    const saved = localStorage.getItem(KEY_STORAGE) || '';
    // 입력란은 비워 두고, 조회 시 DEFAULT_SERVICE_KEY를 자동 사용
    els.key.value = saved && saved !== DEFAULT_SERVICE_KEY ? saved : '';
    els.key.placeholder = '기본 키 사용 중 (변경 시에만 입력)';
  }

  function updatePager() {
    const totalPages = Math.max(1, Math.ceil(state.totalCount / PAGE_SIZE) || 1);
    els.pageLabel.textContent = `${state.pageNo} / ${totalPages.toLocaleString('ko-KR')}`;
    els.totalLabel.textContent = state.totalCount
      ? `전체 ${state.totalCount.toLocaleString('ko-KR')}건 · ${PAGE_SIZE}건씩`
      : `페이지당 ${PAGE_SIZE}건`;
    els.prevBtn.disabled = state.pageNo <= 1;
    els.nextBtn.disabled = state.pageNo >= totalPages || !state.totalCount;
  }

  function sortedItems() {
    const key = state.sortKey;
    const dir = state.sortDir;
    return [...state.items].sort((a, b) => {
      const av = num(a[key]);
      const bv = num(b[key]);
      if (av === bv) return String(a.crno || '').localeCompare(String(b.crno || ''));
      return (av - bv) * dir;
    });
  }

  function renderKpis(items) {
    const sales = items.map((d) => num(d.enpSaleAmt)).filter((n) => n !== 0);
    const profits = items.map((d) => num(d.enpCrtmNpf));
    const debts = items.map((d) => num(d.fnclDebtRto)).filter((n) => n > 0 && n < 500);
    els.kpiCount.textContent = items.length.toLocaleString('ko-KR');
    els.kpiSales.textContent = sales.length ? fmtWon(median(sales)) : '—';
    els.kpiProfit.textContent = profits.length ? fmtWon(median(profits)) : '—';
    els.kpiDebt.textContent = debts.length ? fmtRatio(median(debts)) : '—';
  }

  function chartDefaults() {
    Chart.defaults.color = '#9aa7b8';
    Chart.defaults.borderColor = '#1f2a44';
    Chart.defaults.font.family = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  }

  function destroyCharts() {
    Object.keys(state.charts).forEach((k) => {
      if (state.charts[k]) {
        state.charts[k].destroy();
        state.charts[k] = null;
      }
    });
  }

  function renderCharts(items) {
    chartDefaults();
    destroyCharts();

    const top = [...items]
      .sort((a, b) => num(b.enpSaleAmt) - num(a.enpSaleAmt))
      .slice(0, 15);
    const labels = top.map((d) => String(d.crno).slice(-6));
    const sales = top.map((d) => num(d.enpSaleAmt) / 1e8);
    const profits = top.map((d) => num(d.enpCrtmNpf) / 1e8);

    state.charts.sales = new Chart(document.getElementById('chartSales'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '매출액(억)',
            data: sales,
            backgroundColor: 'rgba(47,185,154,.72)',
            borderRadius: 4,
            maxBarThickness: 22,
          },
          {
            label: '당기순이익(억)',
            data: profits,
            backgroundColor: 'rgba(122,162,255,.55)',
            borderRadius: 4,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700 },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: {
            callbacks: {
              title: (ctx) => {
                const i = ctx[0].dataIndex;
                return `법인등록번호 ${top[i].crno}`;
              },
              label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
          y: {
            grid: { color: '#1c2740' },
            ticks: {
              callback: (v) => `${v}`,
            },
            title: { display: true, text: '억원', color: '#6b7a90' },
          },
        },
      },
    });

    const buckets = [
      { label: '0–50', min: 0, max: 50 },
      { label: '50–100', min: 50, max: 100 },
      { label: '100–150', min: 100, max: 150 },
      { label: '150–200', min: 150, max: 200 },
      { label: '200+', min: 200, max: Infinity },
    ];
    const debtCounts = buckets.map(
      (b) => items.filter((d) => {
        const r = num(d.fnclDebtRto);
        return r >= b.min && r < b.max;
      }).length,
    );

    state.charts.debt = new Chart(document.getElementById('chartDebt'), {
      type: 'doughnut',
      data: {
        labels: buckets.map((b) => b.label),
        datasets: [
          {
            data: debtCounts,
            backgroundColor: [
              'rgba(34,163,133,.85)',
              'rgba(92,136,236,.85)',
              'rgba(212,168,67,.85)',
              'rgba(207,124,41,.85)',
              'rgba(183,74,82,.85)',
            ],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700 },
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12 } },
          title: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}%: ${ctx.raw}건`,
            },
          },
        },
        cutout: '58%',
      },
    });

    const pts = items
      .map((d) => ({
        x: num(d.enpTastAmt) / 1e8,
        y: num(d.enpCrtmNpf) / 1e8,
        crno: d.crno,
        debt: num(d.fnclDebtRto),
      }))
      .filter((p) => p.x > 0);

    state.charts.scatter = new Chart(document.getElementById('chartScatter'), {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: '기업',
            data: pts,
            backgroundColor: pts.map((p) =>
              (p.y >= 0 ? 'rgba(47,185,154,.55)' : 'rgba(183,74,82,.55)')),
            pointRadius: 5,
            pointHoverRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const p = ctx.raw;
                return `법인 ${p.crno} · 자산 ${p.x.toFixed(1)}억 · 순이익 ${p.y.toFixed(1)}억 · 부채비율 ${p.debt.toFixed(1)}%`;
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: '총자산(억)', color: '#6b7a90' },
            grid: { color: '#1c2740' },
          },
          y: {
            title: { display: true, text: '당기순이익(억)', color: '#6b7a90' },
            grid: { color: '#1c2740' },
          },
        },
      },
    });
  }

  function renderTable() {
    const rows = sortedItems();
    els.tbody.innerHTML = '';
    if (!rows.length) {
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
    const frag = document.createDocumentFragment();
    rows.forEach((d, i) => {
      const tr = document.createElement('tr');
      const profit = num(d.enpCrtmNpf);
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td><code>${d.crno || '—'}</code></td>
        <td>${d.bizYear || '—'}</td>
        <td>${d.fnclDcdNm || d.fnclDcd || '—'}</td>
        <td class="num">${fmtWon(d.enpSaleAmt)}</td>
        <td class="num ${profit >= 0 ? 'pos' : 'neg'}">${fmtWon(d.enpCrtmNpf)}</td>
        <td class="num">${fmtWon(d.enpBzopPft)}</td>
        <td class="num">${fmtWon(d.enpTastAmt)}</td>
        <td class="num">${fmtWon(d.enpTdbtAmt)}</td>
        <td class="num">${fmtWon(d.enpTcptAmt)}</td>
        <td class="num">${fmtRatio(d.fnclDebtRto)}</td>
        <td>${d.basDt || '—'}</td>
      `;
      frag.appendChild(tr);
    });
    els.tbody.appendChild(frag);

    document.querySelectorAll('th[data-sort]').forEach((th) => {
      th.classList.toggle('active', th.dataset.sort === state.sortKey);
      th.dataset.dir = th.dataset.sort === state.sortKey ? (state.sortDir > 0 ? 'asc' : 'desc') : '';
    });
  }

  function applyItems(items, meta = {}) {
    state.items = items;
    if (meta.totalCount != null) state.totalCount = meta.totalCount;
    if (meta.pageNo != null) state.pageNo = meta.pageNo;
    renderKpis(items);
    renderCharts(items);
    renderTable();
    updatePager();
    document.getElementById('viz').classList.add('ready');
  }

  async function loadSeed() {
    setStatus('샘플 데이터 로딩…');
    els.sourceMode.textContent = '샘플(캐시)';
    const res = await fetch('./data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`data.json ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    applyItems(items, {
      totalCount: data.totalCount || items.length,
      pageNo: data.pageNo || 1,
    });
    if (data.bizYear) els.year.value = String(data.bizYear);
    setStatus(`샘플 ${items.length}건 표시 (2023 요약재무제표)`);
    setNotice('오프라인 샘플입니다. 실시간 조회는 「100건 불러오기」를 누르세요.', 'info');
  }

  async function fetchPage(pageNo) {
    const key = resolveServiceKey();
    if (!key) {
      setNotice('서비스 키를 확인할 수 없습니다.', 'warn');
      return;
    }
    saveKey();

    const year = String(els.year.value || '').trim();
    const crno = String(els.crno.value || '').trim();
    const params = new URLSearchParams({
      serviceKey: key,
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
      resultType: 'json',
    });
    if (year) params.set('bizYear', year);
    if (crno) params.set('crno', crno);

    els.loadBtn.disabled = true;
    els.prevBtn.disabled = true;
    els.nextBtn.disabled = true;
    setStatus(`${pageNo}페이지 조회 중…`);
    setNotice('');

    try {
      const url = `${ENDPOINT}?${params.toString()}`;
      const res = await fetch(url);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`JSON이 아닌 응답입니다. (${res.status}) ${text.slice(0, 120)}`);
      }

      const header = data?.response?.header || {};
      const resultCode = String(header.resultCode ?? '');
      const resultMsg = header.resultMsg || '';
      if (resultCode && !OK_CODES.has(resultCode)) {
        throw new Error(`API 오류 [${resultCode}] ${resultMsg}`);
      }

      const body = data?.response?.body || {};
      let items = body?.items?.item ?? body?.items ?? [];
      if (!items) items = [];
      if (!Array.isArray(items)) items = [items];

      const total = Number(body.totalCount || items.length || 0);
      applyItems(items, { totalCount: total, pageNo });
      els.sourceMode.textContent = '실시간 API';
      setStatus(`${items.length}건 로드 · 전체 ${total.toLocaleString('ko-KR')}건`);
      setNotice(
        year
          ? `${year}년 사업연도 · 페이지 ${pageNo} (최대 ${PAGE_SIZE}건)`
          : `전체 연도 · 페이지 ${pageNo}`,
        'ok',
      );
    } catch (err) {
      setStatus('조회 실패');
      setNotice(err.message || String(err), 'err');
      updatePager();
    } finally {
      els.loadBtn.disabled = false;
    }
  }

  function downloadCsv() {
    const rows = sortedItems();
    if (!rows.length) return;
    const cols = [
      'crno', 'bizYear', 'fnclDcdNm', 'enpSaleAmt', 'enpCrtmNpf', 'enpBzopPft',
      'enpTastAmt', 'enpTdbtAmt', 'enpTcptAmt', 'enpCptlAmt', 'fnclDebtRto',
      'iclsPalClcAmt', 'curCd', 'basDt',
    ];
    const lines = [cols.join(',')];
    rows.forEach((d) => {
      lines.push(cols.map((c) => {
        const v = d[c] ?? '';
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      }).join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fsc_fina_${els.year.value || 'all'}_p${state.pageNo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function bind() {
    loadKey();
    els.loadBtn.addEventListener('click', () => fetchPage(1));
    els.prevBtn.addEventListener('click', () => {
      if (state.pageNo > 1) fetchPage(state.pageNo - 1);
    });
    els.nextBtn.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(state.totalCount / PAGE_SIZE));
      if (state.pageNo < totalPages) fetchPage(state.pageNo + 1);
    });
    els.seedBtn.addEventListener('click', () => loadSeed().catch((e) => setNotice(e.message, 'err')));
    els.csvBtn.addEventListener('click', downloadCsv);
    els.key.addEventListener('change', saveKey);

    document.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) state.sortDir *= -1;
        else {
          state.sortKey = key;
          state.sortDir = -1;
        }
        renderTable();
      });
    });

    document.getElementById('toggleKey').addEventListener('click', () => {
      els.key.type = els.key.type === 'password' ? 'text' : 'password';
    });
  }

  bind();
  // 기본 키로 첫 페이지를 자동 조회. 실패 시에만 샘플로 폴백
  fetchPage(1).then(() => {
    if (!state.items.length) {
      return loadSeed().catch((e) => {
        setNotice(`샘플 로드 실패: ${e.message}`, 'warn');
      });
    }
  });
})();
