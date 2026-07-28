/**
 * 나라장터 공사 입찰공고 대시보드
 * - getBidPblancListInfoCnstwk 100건씩 조회
 * - Supabase upsert + Chart.js 인터랙티브 시각화
 */
(function () {
  const API_URL =
    'https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk';
  // GitHub Pages는 정적 호스팅이라 /api/* 로 POST 하면 405가 납니다.
  // 같은 오리진에 프록시가 있으면 그걸 쓰고, 없으면 Vercel(icn1) 절대 URL로 넘어갑니다.
  const REMOTE_PROXY_URL = 'https://stargate-bid-api.vercel.app/api/bid-pblanc-cnstwk';
  const SAME_ORIGIN_PROXY_URL = '/api/bid-pblanc-cnstwk';
  const IS_STATIC_HOST = /(^|\.)github\.io$/i.test(location.hostname) ||
    /(^|\.)stargateedu\.co\.kr$/i.test(location.hostname);
  const PROXY_URL = IS_STATIC_HOST ? REMOTE_PROXY_URL : SAME_ORIGIN_PROXY_URL;
  const SUPABASE_URL = 'https://inftexpcnfinglwlrvsj.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZnRleHBjbmZpbmdsd2xydnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTMyMzgsImV4cCI6MjA4ODQ4OTIzOH0.HONuULp0L3B5T0gTiwJMnowjJonJzzNHhUV_LtpDQoI';
  const TABLE = 'bid_pblanc_cnstwk';
  const LOG_TABLE = 'bid_pblanc_cnstwk_fetch_logs';
  const KEY_STORAGE = 'stargate-data-go-kr-key';
  const PAGE_SIZE = 100;
  const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;
  const SEED_KEY = 'fcc95a3d84cbb220391765c9ba129573f32b5e86bfc746483e0e96a806b35c9c';

  const els = {
    key: document.getElementById('apiKey'),
    toggleKey: document.getElementById('toggleKey'),
    inqryDiv: document.getElementById('inqryDiv'),
    inqryBgnDt: document.getElementById('inqryBgnDt'),
    inqryEndDt: document.getElementById('inqryEndDt'),
    bidNtceNo: document.getElementById('bidNtceNo'),
    keyword: document.getElementById('keyword'),
    loadBtn: document.getElementById('loadBtn'),
    saveBtn: document.getElementById('saveBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    csvBtn: document.getElementById('csvBtn'),
    pageLabel: document.getElementById('pageLabel'),
    totalLabel: document.getElementById('totalLabel'),
    liveStatus: document.getElementById('liveStatus'),
    notice: document.getElementById('notice'),
    tbody: document.getElementById('tbody'),
    empty: document.getElementById('empty'),
    kpiCount: document.getElementById('kpiCount'),
    kpiTotal: document.getElementById('kpiTotal'),
    kpiPrice: document.getElementById('kpiPrice'),
    kpiSaved: document.getElementById('kpiSaved'),
    sourceMode: document.getElementById('sourceMode'),
    logList: document.getElementById('logList'),
    viz: document.getElementById('viz'),
  };

  const state = {
    pageNo: 1,
    totalCount: 0,
    items: [],
    lastSaved: 0,
    loading: false,
    filterInstt: '',
    filterMethod: '',
    charts: { instt: null, method: null, price: null, daily: null },
  };

  function decodeServiceKey(raw) {
    let key = String(raw || '').trim();
    if (!key) return '';
    try {
      if (PCT_ENCODED.test(key)) key = decodeURIComponent(key);
    } catch (_) {
      /* keep */
    }
    return key;
  }

  function encodeServiceKey(apiKey) {
    return PCT_ENCODED.test(apiKey) ? apiKey : encodeURIComponent(apiKey);
  }

  function formatYmdHm(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    const hour = map.hour === '24' ? '00' : map.hour;
    return `${map.year}${map.month}${map.day}${hour}${map.minute}`;
  }

  function daysAgoYmdHm(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return formatYmdHm(d);
  }

  function setStatus(msg, kind = '') {
    els.liveStatus.textContent = msg || '';
    els.liveStatus.dataset.kind = kind;
  }

  function setNotice(msg, kind = '') {
    els.notice.textContent = msg || '';
    els.notice.dataset.kind = kind;
  }

  function saveKey() {
    const key = decodeServiceKey(els.key.value);
    if (key) localStorage.setItem(KEY_STORAGE, key);
  }

  function loadKey() {
    const saved = localStorage.getItem(KEY_STORAGE) || '';
    els.key.value = saved || SEED_KEY;
    if (!saved && SEED_KEY) localStorage.setItem(KEY_STORAGE, SEED_KEY);
  }

  function asNumber(value) {
    if (value == null || value === '') return null;
    const n = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  }

  function asInt(value, fallback = 0) {
    const n = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function pick(row, ...keys) {
    for (const key of keys) {
      if (row?.[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim();
    }
    return '';
  }

  function normalizeItem(row, pageNo) {
    if (!row || typeof row !== 'object') return null;
    const bidNtceNo = pick(row, 'bid_ntce_no', 'bidNtceNo', 'BID_NTCE_NO');
    const bidNtceNm = pick(row, 'bid_ntce_nm', 'bidNtceNm', 'BID_NTCE_NM');
    if (!bidNtceNo && !bidNtceNm) return null;
    const bidNtceOrd = pick(row, 'bid_ntce_ord', 'bidNtceOrd', 'BID_NTCE_ORD') || '00';
    return {
      bid_ntce_no: bidNtceNo || `name:${bidNtceNm}`,
      bid_ntce_ord: bidNtceOrd,
      bid_ntce_nm: bidNtceNm,
      ntce_instt_nm: pick(row, 'ntce_instt_nm', 'ntceInsttNm', 'NTCE_INSTT_NM'),
      dminstt_nm: pick(row, 'dminstt_nm', 'dminsttNm', 'DMINSTT_NM'),
      bid_methd_nm: pick(row, 'bid_methd_nm', 'bidMethdNm', 'BID_METHD_NM'),
      cntrct_cncls_mthd_nm: pick(
        row,
        'cntrct_cncls_mthd_nm',
        'cntrctCnclsMthdNm',
        'CNTRCT_CNCLS_MTHD_NM',
      ),
      ntce_dt: pick(row, 'ntce_dt', 'ntceDt', 'bidNtceDt', 'bid_ntce_dt', 'NTCE_DT'),
      bid_clse_dt: pick(row, 'bid_clse_dt', 'bidClseDt', 'BID_CLSE_DT'),
      openg_dt: pick(row, 'openg_dt', 'opengDt', 'OPENG_DT'),
      presmpt_prce: asNumber(
        row.presmpt_prce ?? pick(row, 'presmptPrce', 'PRESMPT_PRCE'),
      ),
      bdgt_amt: asNumber(row.bdgt_amt ?? pick(row, 'bdgtAmt', 'BDGT_AMT')),
      bsns_div_nm: pick(row, 'bsns_div_nm', 'bsnsDivNm', 'BSNS_DIV_NM'),
      re_ntce_yn: pick(row, 're_ntce_yn', 'reNtceYn', 'RE_NTCE_YN'),
      bid_ntce_dtl_url: pick(row, 'bid_ntce_dtl_url', 'bidNtceDtlUrl', 'BID_NTCE_DTL_URL'),
      bid_ntce_url: pick(row, 'bid_ntce_url', 'bidNtceUrl', 'BID_NTCE_URL'),
      page_no: pageNo,
      raw: row.raw && typeof row.raw === 'object' ? row.raw : row,
      fetched_at: row.fetched_at || new Date().toISOString(),
    };
  }

  function looksLikeBidRow(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    return Boolean(
      row.bidNtceNo ||
        row.bid_ntce_no ||
        row.bidNtceNm ||
        row.bid_ntce_nm ||
        row.ntceInsttNm ||
        row.dminsttNm ||
        row.cntrctCnclsMthdNm,
    );
  }

  function extractListArrays(data) {
    const lists = [];
    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        const rows = node.filter(looksLikeBidRow);
        if (rows.length) lists.push(rows);
        node.forEach(visit);
        return;
      }
      if (typeof node !== 'object') return;
      for (const value of Object.values(node)) visit(value);
    };
    visit(data);
    return lists;
  }

  function parseBidPayload(text) {
    const stripped = String(text || '').trim();
    if (!stripped) throw new Error('빈 응답을 받았습니다.');
    if (/^forbidden$/i.test(stripped)) {
      throw new Error(
        '나라장터 API 403 Forbidden. 「조달청_나라장터 입찰공고정보서비스」 활용신청을 확인하세요.',
      );
    }
    if (stripped.startsWith('<')) {
      const code = (stripped.match(/<(?:returnReasonCode|resultCode)>([^<]+)</i) || [])[1] || '';
      const msg = (stripped.match(/<(?:returnAuthMsg|resultMsg)>([^<]+)</i) || [])[1] || code;
      if (code && !['00', '000', '0'].includes(code.trim())) throw new Error(`[${code}] ${msg}`);
      const blocks = stripped.match(/<item>[\s\S]*?<\/item>/gi) || [];
      const items = blocks.map((block) => {
        const row = {};
        for (const match of block.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
          if (match[1].toLowerCase() === 'item') continue;
          row[match[1]] = match[2]
            .replaceAll('&lt;', '<')
            .replaceAll('&gt;', '>')
            .replaceAll('&quot;', '"')
            .replaceAll('&apos;', "'")
            .replaceAll('&amp;', '&')
            .trim();
        }
        return row;
      });
      return { items, totalCount: asInt((stripped.match(/<totalCount>([^<]+)</i) || [])[1], items.length) };
    }

    let data;
    try {
      data = JSON.parse(stripped);
    } catch (error) {
      throw new Error(`응답 파싱 실패: ${error.message}`);
    }

    const header = data?.header || data?.response?.header;
    if (header) {
      const code = String(header.resultCode || header.returnReasonCode || '').trim();
      const msg = String(header.resultMsg || header.returnAuthMsg || '').trim();
      if (code && !['00', '000', '0', 'NORMAL_SERVICE', 'NORMAL SERVICE.'].includes(code)) {
        throw new Error(`[${code}] ${msg || '상세 메시지 없음'}`);
      }
    }

    let items = [];
    const listArrays = extractListArrays(data);
    if (listArrays.length) items = listArrays.reduce((a, b) => (b.length > a.length ? b : a), []);
    else {
      let body = data?.response?.body || data?.body || data;
      let rawItems = body?.items ?? body?.item ?? [];
      if (rawItems && typeof rawItems === 'object' && !Array.isArray(rawItems)) {
        rawItems = rawItems.item ?? [rawItems];
      }
      if (!Array.isArray(rawItems)) rawItems = [];
      items = rawItems;
    }

    const totalCount = asInt(
      data?.response?.body?.totalCount ?? data?.body?.totalCount,
      items.length,
    );
    return { items, totalCount };
  }

  function buildDirectUrl(params, apiKey) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (key === 'serviceKey' || value == null || value === '') continue;
      query.set(key, String(value));
    }
    return `${API_URL}?serviceKey=${encodeServiceKey(apiKey)}&${query.toString()}`;
  }

  function fmtWon(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`;
    return `${Math.round(n).toLocaleString('ko-KR')}원`;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function filteredItems() {
    const kw = String(els.keyword.value || '').trim().toLowerCase();
    return state.items.filter((row) => {
      if (state.filterInstt && row.ntce_instt_nm !== state.filterInstt) return false;
      if (state.filterMethod && row.cntrct_cncls_mthd_nm !== state.filterMethod) return false;
      if (kw && !`${row.bid_ntce_nm} ${row.ntce_instt_nm} ${row.dminstt_nm}`.toLowerCase().includes(kw)) {
        return false;
      }
      return true;
    });
  }

  function totalPages() {
    return Math.max(1, Math.ceil((state.totalCount || 0) / PAGE_SIZE));
  }

  function updatePager() {
    const pages = totalPages();
    els.pageLabel.textContent = `${state.pageNo} / ${state.totalCount ? pages : '—'}`;
    els.totalLabel.textContent = `전체 ${state.totalCount.toLocaleString('ko-KR')}건 · 페이지당 ${PAGE_SIZE}건`;
    els.prevBtn.disabled = state.loading || state.pageNo <= 1;
    els.nextBtn.disabled = state.loading || !state.totalCount || state.pageNo >= pages;
  }

  function renderKpis(items) {
    const prices = items.map((d) => d.presmpt_prce).filter((n) => n != null && n > 0);
    const sum = prices.reduce((a, b) => a + b, 0);
    els.kpiCount.textContent = items.length.toLocaleString('ko-KR');
    els.kpiTotal.textContent = state.totalCount ? state.totalCount.toLocaleString('ko-KR') : '—';
    els.kpiPrice.textContent = prices.length ? (sum / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '—';
    els.kpiSaved.textContent = String(state.lastSaved || 0);
  }

  function chartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#95a7b8';
    Chart.defaults.borderColor = 'rgba(232,238,244,.1)';
    Chart.defaults.font.family = '"Outfit","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  }

  function destroyCharts() {
    Object.keys(state.charts).forEach((k) => {
      if (state.charts[k]) {
        state.charts[k].destroy();
        state.charts[k] = null;
      }
    });
  }

  function countBy(items, keyFn) {
    const map = new Map();
    for (const row of items) {
      const key = keyFn(row) || '(미상)';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderCharts(items) {
    if (typeof Chart === 'undefined') return;
    chartDefaults();
    destroyCharts();

    const topInstt = countBy(items, (r) => r.ntce_instt_nm).slice(0, 12);
    state.charts.instt = new Chart(document.getElementById('chartInstt'), {
      type: 'bar',
      data: {
        labels: topInstt.map(([k]) => (k.length > 14 ? `${k.slice(0, 14)}…` : k)),
        datasets: [
          {
            label: '공고 수',
            data: topInstt.map(([, v]) => v),
            backgroundColor: topInstt.map(([k]) =>
              k === state.filterInstt ? 'rgba(61,184,154,.85)' : 'rgba(226,162,74,.72)',
            ),
            borderRadius: 4,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 650 },
        onClick: (_evt, elements) => {
          if (!elements.length) {
            state.filterInstt = '';
          } else {
            const label = topInstt[elements[0].index][0];
            state.filterInstt = state.filterInstt === label ? '' : label;
          }
          renderAll();
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (ctx) => topInstt[ctx[0].dataIndex][0],
            },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(232,238,244,.06)' }, ticks: { precision: 0 } },
          y: { grid: { display: false } },
        },
      },
    });

    const methods = countBy(items, (r) => r.cntrct_cncls_mthd_nm).slice(0, 8);
    const palette = [
      'rgba(226,162,74,.85)',
      'rgba(61,184,154,.8)',
      'rgba(111,143,173,.8)',
      'rgba(209,96,96,.75)',
      'rgba(180,140,90,.8)',
      'rgba(90,160,140,.8)',
      'rgba(140,160,190,.8)',
      'rgba(160,120,90,.8)',
    ];
    state.charts.method = new Chart(document.getElementById('chartMethod'), {
      type: 'doughnut',
      data: {
        labels: methods.map(([k]) => k),
        datasets: [
          {
            data: methods.map(([, v]) => v),
            backgroundColor: methods.map((_, i) => palette[i % palette.length]),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        animation: { duration: 650 },
        onClick: (_evt, elements) => {
          if (!elements.length) {
            state.filterMethod = '';
          } else {
            const label = methods[elements[0].index][0];
            state.filterMethod = state.filterMethod === label ? '' : label;
          }
          renderAll();
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
        },
      },
    });

    const buckets = [
      { label: '~1억', min: 0, max: 1e8 },
      { label: '1~5억', min: 1e8, max: 5e8 },
      { label: '5~10억', min: 5e8, max: 1e9 },
      { label: '10~50억', min: 1e9, max: 5e9 },
      { label: '50억+', min: 5e9, max: Infinity },
    ];
    const priceCounts = buckets.map(
      (b) =>
        items.filter((d) => {
          const p = d.presmpt_prce;
          return p != null && p >= b.min && p < b.max;
        }).length,
    );
    state.charts.price = new Chart(document.getElementById('chartPrice'), {
      type: 'bar',
      data: {
        labels: buckets.map((b) => b.label),
        datasets: [
          {
            label: '건수',
            data: priceCounts,
            backgroundColor: 'rgba(61,184,154,.7)',
            borderRadius: 4,
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 650 },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(232,238,244,.06)' }, ticks: { precision: 0 } },
        },
      },
    });

    const daily = countBy(items, (r) => {
      const dt = r.ntce_dt || '';
      return dt.slice(0, 10) || '(미상)';
    })
      .filter(([k]) => k !== '(미상)')
      .sort((a, b) => a[0].localeCompare(b[0]));
    state.charts.daily = new Chart(document.getElementById('chartDaily'), {
      type: 'line',
      data: {
        labels: daily.map(([k]) => k.slice(5)),
        datasets: [
          {
            label: '공고 수',
            data: daily.map(([, v]) => v),
            borderColor: 'rgba(226,162,74,.95)',
            backgroundColor: 'rgba(226,162,74,.18)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 650 },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(232,238,244,.06)' }, ticks: { precision: 0 } },
        },
      },
    });
  }

  function renderTable(items) {
    if (!items.length) {
      els.tbody.innerHTML = '';
      els.empty.style.display = 'block';
      return;
    }
    els.empty.style.display = 'none';
    els.tbody.innerHTML = items
      .map((row, i) => {
        const url = row.bid_ntce_dtl_url || row.bid_ntce_url;
        const highlight =
          (state.filterInstt && row.ntce_instt_nm === state.filterInstt) ||
          (state.filterMethod && row.cntrct_cncls_mthd_nm === state.filterMethod);
        return `<tr style="${highlight ? 'background:rgba(226,162,74,.08)' : ''}">
          <td>${i + 1}</td>
          <td>
            <strong>${escapeHtml(row.bid_ntce_nm || '(제목 없음)')}</strong>
            <div class="sub">${escapeHtml(row.bid_ntce_no)}${row.bid_ntce_ord ? `-${escapeHtml(row.bid_ntce_ord)}` : ''}${row.bsns_div_nm ? ` · ${escapeHtml(row.bsns_div_nm)}` : ''}</div>
          </td>
          <td>${escapeHtml(row.ntce_instt_nm || '—')}</td>
          <td>${escapeHtml(row.dminstt_nm || '—')}</td>
          <td><span class="tag">${escapeHtml(row.cntrct_cncls_mthd_nm || row.bid_methd_nm || '—')}</span></td>
          <td class="money">${fmtWon(row.presmpt_prce)}</td>
          <td>${escapeHtml(row.ntce_dt || '—')}</td>
          <td>${escapeHtml(row.bid_clse_dt || '—')}</td>
          <td>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">열기</a>` : '—'}</td>
        </tr>`;
      })
      .join('');
  }

  function renderAll() {
    const items = filteredItems();
    renderKpis(items);
    renderCharts(state.items);
    renderTable(items);
    updatePager();
    els.viz.classList.add('ready');
    const filterNote = [
      state.filterInstt ? `발주=${state.filterInstt}` : '',
      state.filterMethod ? `계약=${state.filterMethod}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (filterNote) setNotice(`차트 필터 적용: ${filterNote} (다시 클릭하면 해제)`, 'warn');
  }

  async function upsertToSupabase(items) {
    if (!items.length) return 0;
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=bid_ntce_no,bid_ntce_ord`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(items),
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase 저장 실패 (${response.status}): ${detail.slice(0, 200)}`);
    }
    return items.length;
  }

  async function loadLogs() {
    try {
      const proxyRes = await fetch(`${PROXY_URL}?logLimit=12`);
      if (proxyRes.ok) {
        const data = await proxyRes.json();
        if (Array.isArray(data.logs) && data.logs.length) {
          renderLogs(data.logs);
          return;
        }
      }
    } catch (_) {
      /* fall through */
    }
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${LOG_TABLE}?select=*&order=fetched_at.desc&limit=12`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Accept: 'application/json',
          },
        },
      );
      if (!response.ok) throw new Error(`log_${response.status}`);
      renderLogs(await response.json());
    } catch (_) {
      els.logList.innerHTML = '<li class="muted">수집 로그를 불러오지 못했습니다. 스키마 적용 후 재시도하세요.</li>';
    }
  }

  function renderLogs(logs) {
    if (!logs?.length) {
      els.logList.innerHTML = '<li class="muted">아직 수집 로그가 없습니다.</li>';
      return;
    }
    els.logList.innerHTML = logs
      .map((log) => {
        const ok = log.status === 'ok';
        const when = log.fetched_at || log.created_at || '';
        return `<li>
          <span class="dot ${ok ? 'ok' : 'err'}"></span>
          <div>
            <div>${ok ? '성공' : '실패'} · ${log.row_count ?? 0}건 저장 · page ${log.page_no ?? 1}</div>
            <small>${escapeHtml(when)}${log.error_message ? ` · ${escapeHtml(log.error_message)}` : ''}</small>
          </div>
        </li>`;
      })
      .join('');
  }

  async function fetchViaProxy(apiKey, pageNo) {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey,
        pageNo,
        pageSize: PAGE_SIZE,
        inqryDiv: els.inqryDiv.value || '1',
        inqryBgnDt: els.inqryBgnDt.value.trim(),
        inqryEndDt: els.inqryEndDt.value.trim(),
        bidNtceNo: els.bidNtceNo.value.trim(),
        saveToSupabase: true,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `proxy_${response.status}`);
    }
    return data;
  }

  async function fetchDirect(apiKey, pageNo) {
    const div = els.inqryDiv.value || '1';
    const params = {
      pageNo: String(pageNo),
      numOfRows: String(PAGE_SIZE),
      inqryDiv: div,
      type: 'json',
    };
    if (div === '2') {
      const no = els.bidNtceNo.value.trim();
      if (!no) throw new Error('입찰공고번호 조회는 bidNtceNo가 필요합니다.');
      params.bidNtceNo = no;
    } else {
      params.inqryBgnDt = els.inqryBgnDt.value.trim() || daysAgoYmdHm(7);
      params.inqryEndDt = els.inqryEndDt.value.trim() || formatYmdHm();
    }
    const url = buildDirectUrl(params, apiKey);
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json, text/xml, */*',
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
    const parsed = parseBidPayload(text);
    const items = parsed.items.map((row) => normalizeItem(row, pageNo)).filter(Boolean);
    let saved = 0;
    let saveWarning = '';
    try {
      saved = await upsertToSupabase(items);
    } catch (error) {
      saveWarning = error.message;
      setNotice(error.message, 'warn');
    }
    return {
      items,
      totalCount: parsed.totalCount,
      saved,
      source: 'direct',
      saveWarning,
    };
  }

  async function loadPage(pageNo) {
    if (state.loading) return;
    const apiKey = decodeServiceKey(els.key.value);
    if (!apiKey) {
      setNotice('공공데이터포털 serviceKey를 입력하세요.', 'err');
      return;
    }
    saveKey();
    state.loading = true;
    state.pageNo = pageNo;
    state.filterInstt = '';
    state.filterMethod = '';
    els.loadBtn.disabled = true;
    els.saveBtn.disabled = true;
    updatePager();
    setStatus('조회 중…');
    setNotice('');

    try {
      let result;
      try {
        const proxy = await fetchViaProxy(apiKey, pageNo);
        result = {
          items: (proxy.items || []).map((row) => normalizeItem(row, pageNo)).filter(Boolean),
          totalCount: proxy.totalCount || 0,
          saved: proxy.saved || 0,
          source: 'proxy',
          saveWarning: proxy.saveWarning || '',
        };
      } catch (proxyError) {
        setStatus(`프록시 실패 → 직접 호출 시도 (${proxyError.message})`, 'warn');
        result = await fetchDirect(apiKey, pageNo);
      }

      state.items = result.items;
      state.totalCount = result.totalCount || result.items.length;
      state.lastSaved = result.saved || 0;
      els.sourceMode.textContent = result.source === 'proxy' ? 'Vercel 프록시' : '직접 API';
      renderAll();
      setStatus(
        `${result.items.length}건 로드 · Supabase ${result.saved || 0}건 저장 · ${result.source}`,
        'ok',
      );
      if (result.saveWarning) setNotice(result.saveWarning, 'warn');
      await loadLogs();
    } catch (error) {
      setStatus('');
      setNotice(error.message || '조회 실패', 'err');
      els.sourceMode.textContent = '오류';
    } finally {
      state.loading = false;
      els.loadBtn.disabled = false;
      els.saveBtn.disabled = false;
      updatePager();
    }
  }

  async function saveAgain() {
    if (!state.items.length) {
      setNotice('저장할 데이터가 없습니다. 먼저 조회하세요.', 'warn');
      return;
    }
    try {
      setStatus('Supabase 저장 중…');
      const saved = await upsertToSupabase(state.items);
      state.lastSaved = saved;
      els.kpiSaved.textContent = String(saved);
      setStatus(`${saved}건 재저장 완료`, 'ok');
      await loadLogs();
    } catch (error) {
      setNotice(error.message, 'err');
    }
  }

  function downloadCsv() {
    const items = filteredItems();
    if (!items.length) {
      setNotice('CSV로 보낼 행이 없습니다.', 'warn');
      return;
    }
    const headers = [
      'bid_ntce_no',
      'bid_ntce_ord',
      'bid_ntce_nm',
      'ntce_instt_nm',
      'dminstt_nm',
      'bid_methd_nm',
      'cntrct_cncls_mthd_nm',
      'presmpt_prce',
      'ntce_dt',
      'bid_clse_dt',
      'openg_dt',
      'bid_ntce_dtl_url',
    ];
    const lines = [headers.join(',')];
    for (const row of items) {
      lines.push(
        headers
          .map((h) => {
            const v = row[h] == null ? '' : String(row[h]);
            return `"${v.replaceAll('"', '""')}"`;
          })
          .join(','),
      );
    }
    const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bid-pblanc-cnstwk-p${state.pageNo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function initDates() {
    if (!els.inqryBgnDt.value) els.inqryBgnDt.value = daysAgoYmdHm(7).slice(0, 12).replace(/(\d{8})(\d{4})/, '$1$2');
    // ensure end of day style
    const end = formatYmdHm();
    if (!els.inqryEndDt.value) els.inqryEndDt.value = `${end.slice(0, 8)}2359`;
    if (!els.inqryBgnDt.value || els.inqryBgnDt.value.length < 12) {
      els.inqryBgnDt.value = daysAgoYmdHm(7).slice(0, 8) + '0000';
    }
  }

  els.toggleKey.addEventListener('click', () => {
    const show = els.key.type === 'password';
    els.key.type = show ? 'text' : 'password';
    els.toggleKey.textContent = show ? '숨김' : '표시';
  });
  els.loadBtn.addEventListener('click', () => loadPage(1));
  els.saveBtn.addEventListener('click', () => saveAgain());
  els.prevBtn.addEventListener('click', () => loadPage(Math.max(1, state.pageNo - 1)));
  els.nextBtn.addEventListener('click', () => loadPage(state.pageNo + 1));
  els.csvBtn.addEventListener('click', () => downloadCsv());
  els.keyword.addEventListener('input', () => {
    if (state.items.length) renderAll();
  });
  els.inqryDiv.addEventListener('change', () => {
    const isNo = els.inqryDiv.value === '2';
    els.bidNtceNo.disabled = !isNo;
    els.inqryBgnDt.disabled = isNo;
    els.inqryEndDt.disabled = isNo;
  });

  loadKey();
  initDates();
  els.inqryDiv.dispatchEvent(new Event('change'));
  loadLogs();
  updatePager();
})();
