/**
 * LH 분양정보 대시보드
 * - 공지사항 API가 아니라 분양임대공고문(lhLeaseNoticeInfo1) 사용
 * - 기본 30건씩 조회 후 Supabase upsert
 */
(function () {
  const API_URL = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1';
  const PROXY_URL = '/api/lh-sale-info';
  const SUPABASE_URL = 'https://inftexpcnfinglwlrvsj.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluZnRleHBjbmZpbmdsd2xydnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MTMyMzgsImV4cCI6MjA4ODQ4OTIzOH0.HONuULp0L3B5T0gTiwJMnowjJonJzzNHhUV_LtpDQoI';
  const TABLE = 'lh_sale_notices';
  const LOG_TABLE = 'lh_sale_fetch_logs';
  const KEY_STORAGE = 'stargate-data-go-kr-key';
  const PAGE_SIZE = 30;
  const PCT_ENCODED = /%[0-9A-Fa-f]{2}/;
  // 사용자가 제공한 공공데이터포털 디코딩 키(브라우저 localStorage 없을 때 시드)
  const SEED_KEY = 'fcc95a3d84cbb220391765c9ba129573f32b5e86bfc746483e0e96a806b35c9c';

  const els = {
    key: document.getElementById('apiKey'),
    toggleKey: document.getElementById('toggleKey'),
    typeCode: document.getElementById('typeCode'),
    regionCode: document.getElementById('regionCode'),
    status: document.getElementById('statusFilter'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
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
    kpiOpen: document.getElementById('kpiOpen'),
    kpiSaved: document.getElementById('kpiSaved'),
    sourceMode: document.getElementById('sourceMode'),
    logList: document.getElementById('logList'),
  };

  const state = {
    pageNo: 1,
    totalCount: 0,
    items: [],
    lastSaved: 0,
    loading: false,
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

  function formatDotDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    return `${map.year}.${map.month}.${map.day}`;
  }

  function yearsAgoDot(years) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return formatDotDate(d);
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
    const panId = pick(row, 'pan_id', 'PAN_ID', 'PanId');
    const panNm = pick(row, 'pan_nm', 'PAN_NM', 'PanNm');
    if (!panId && !panNm) return null;
    return {
      pan_id: panId || `name:${panNm}`,
      pan_nm: panNm,
      upp_ais_tp_cd: pick(row, 'upp_ais_tp_cd', 'UPP_AIS_TP_CD'),
      upp_ais_tp_nm: pick(row, 'upp_ais_tp_nm', 'UPP_AIS_TP_NM'),
      ais_tp_cd: pick(row, 'ais_tp_cd', 'AIS_TP_CD'),
      ais_tp_cd_nm: pick(row, 'ais_tp_cd_nm', 'AIS_TP_CD_NM'),
      cnp_cd: pick(row, 'cnp_cd', 'CNP_CD'),
      cnp_cd_nm: pick(row, 'cnp_cd_nm', 'CNP_CD_NM'),
      pan_ss: pick(row, 'pan_ss', 'PAN_SS'),
      pan_nt_st_dt: pick(row, 'pan_nt_st_dt', 'PAN_NT_ST_DT', 'pan_dt', 'PAN_DT'),
      clsg_dt: pick(row, 'clsg_dt', 'CLSG_DT'),
      all_cnt: asInt(pick(row, 'all_cnt', 'ALL_CNT'), 0),
      dtl_url: pick(row, 'dtl_url', 'DTL_URL', 'detail_url'),
      spl_inf_tp_cd: pick(row, 'spl_inf_tp_cd', 'SPL_INF_TP_CD'),
      ccr_cnnt_sys_ds_cd: pick(row, 'ccr_cnnt_sys_ds_cd', 'CCR_CNNT_SYS_DS_CD'),
      page_no: pageNo,
      raw: row.raw && typeof row.raw === 'object' ? row.raw : row,
      fetched_at: row.fetched_at || new Date().toISOString(),
    };
  }

  function looksLikeNoticeRow(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    return Boolean(
      row.PAN_ID ||
        row.pan_id ||
        row.PAN_NM ||
        row.pan_nm ||
        row.UPP_AIS_TP_CD ||
        row.upp_ais_tp_cd ||
        row.DTL_URL ||
        row.dtl_url,
    );
  }

  function extractListArrays(data) {
    const namedLists = [];
    const genericLists = [];
    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        const rows = node.filter(looksLikeNoticeRow);
        if (rows.length) genericLists.push(rows);
        node.forEach(visit);
        return;
      }
      if (typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (Array.isArray(value)) {
          const rows = value.filter(looksLikeNoticeRow);
          if (rows.length) {
            if (/^dsList/i.test(key)) namedLists.push(rows);
            else genericLists.push(rows);
          }
        } else {
          visit(value);
        }
      }
    };
    visit(data);
    return namedLists.length ? namedLists : genericLists;
  }

  function parseLhPayload(text) {
    const stripped = String(text || '').trim();
    if (!stripped) throw new Error('빈 응답을 받았습니다.');
    if (/^forbidden$/i.test(stripped)) {
      throw new Error(
        'LH API 403 Forbidden. 공공데이터포털에서 「분양임대공고문 조회 서비스」 활용신청이 승인됐는지 확인하세요.',
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
      return { items, totalCount: asInt((stripped.match(/<ALL_CNT>([^<]+)</i) || [])[1], items.length) };
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
    else if (Array.isArray(data)) {
      items = data.filter((row) => row && typeof row === 'object' && !Array.isArray(row) && (row.PAN_NM || row.pan_nm || row.PAN_ID));
    } else {
      let body = data?.response?.body || data?.body || data;
      let rawItems = body?.items ?? body?.item ?? [];
      if (rawItems && typeof rawItems === 'object' && !Array.isArray(rawItems)) rawItems = rawItems.item ?? [rawItems];
      if (!Array.isArray(rawItems)) rawItems = [];
      items = rawItems;
    }

    const totalCount =
      asInt(items[0]?.ALL_CNT ?? items[0]?.all_cnt, 0) ||
      asInt(data?.response?.body?.totalCount ?? data?.body?.totalCount, items.length);
    return { items, totalCount };
  }

  function currentParams() {
    return {
      pageNo: state.pageNo,
      pageSize: PAGE_SIZE,
      typeCode: els.typeCode.value,
      regionCode: els.regionCode.value,
      status: els.status.value,
      startDate: els.startDate.value.trim() || yearsAgoDot(2),
      endDate: els.endDate.value.trim() || formatDotDate(),
    };
  }

  function buildDirectUrl(apiKey, params) {
    const query = new URLSearchParams();
    query.set('PG_SZ', String(params.pageSize));
    query.set('PAGE', String(params.pageNo));
    query.set('PAN_NT_ST_DT', params.startDate);
    query.set('CLSG_DT', params.endDate);
    if (params.typeCode && params.typeCode !== 'all') query.set('UPP_AIS_TP_CD', params.typeCode);
    if (params.regionCode) query.set('CNP_CD', params.regionCode);
    if (params.status) query.set('PAN_SS', params.status);
    return `${API_URL}?serviceKey=${encodeServiceKey(apiKey)}&${query.toString()}`;
  }

  async function fetchDirect(apiKey, params) {
    const url = buildDirectUrl(apiKey, params);
    const response = await fetch(url, {
      headers: { Accept: 'application/json, text/xml, */*' },
    });
    const text = await response.text();
    if (response.status === 403 || /^forbidden$/i.test(text.trim())) {
      throw new Error(
        'LH API 403 Forbidden. 「분양임대공고문 조회 서비스」 활용신청·승인 여부를 확인하세요.',
      );
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    const parsed = parseLhPayload(text);
    return {
      items: parsed.items.map((row) => normalizeItem(row, params.pageNo)).filter(Boolean),
      totalCount: parsed.totalCount,
      source: 'direct',
    };
  }

  async function fetchViaProxy(apiKey, params, saveToSupabase) {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, apiKey, saveToSupabase }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `proxy_${response.status}`);
    }
    return {
      items: (data.items || []).map((row) => normalizeItem(row, params.pageNo)).filter(Boolean),
      totalCount: data.totalCount || 0,
      saved: data.saved || 0,
      source: 'proxy',
    };
  }

  async function supabaseFetch(path, options = {}) {
    return fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...(options.headers || {}),
      },
    });
  }

  async function saveToSupabase(items, params) {
    if (!items.length) return 0;
    const response = await supabaseFetch(`/rest/v1/${TABLE}?on_conflict=pan_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(items),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase 저장 실패 (${response.status}): ${detail.slice(0, 200)}`);
    }
    await supabaseFetch(`/rest/v1/${LOG_TABLE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        page_no: params.pageNo,
        page_size: params.pageSize,
        row_count: items.length,
        total_count: state.totalCount,
        params,
        status: 'ok',
        fetched_at: new Date().toISOString(),
      }),
    });
    return items.length;
  }

  async function loadLogs() {
    try {
      const response = await supabaseFetch(
        `/rest/v1/${LOG_TABLE}?select=*&order=fetched_at.desc&limit=8`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) {
        els.logList.innerHTML = '<li class="muted">로그 테이블이 아직 없습니다. SQL 스키마를 적용하세요.</li>';
        return;
      }
      const rows = await response.json();
      if (!rows.length) {
        els.logList.innerHTML = '<li class="muted">아직 수집 로그가 없습니다.</li>';
        return;
      }
      els.logList.innerHTML = rows
        .map((row) => {
          const when = new Date(row.fetched_at || row.created_at).toLocaleString('ko-KR');
          const ok = row.status === 'ok';
          return `<li><span class="dot ${ok ? 'ok' : 'err'}"></span><div><strong>${ok ? '저장' : '오류'} · ${row.row_count || 0}건</strong><small>${when}${row.error_message ? ` · ${row.error_message}` : ''}</small></div></li>`;
        })
        .join('');
    } catch (_) {
      els.logList.innerHTML = '<li class="muted">로그를 불러오지 못했습니다.</li>';
    }
  }

  function updatePager() {
    const totalPages = Math.max(1, Math.ceil((state.totalCount || 0) / PAGE_SIZE) || 1);
    els.pageLabel.textContent = `${state.pageNo} / ${totalPages.toLocaleString('ko-KR')}`;
    els.totalLabel.textContent = state.totalCount
      ? `전체 ${state.totalCount.toLocaleString('ko-KR')}건 · ${PAGE_SIZE}건씩`
      : `페이지당 ${PAGE_SIZE}건`;
    els.prevBtn.disabled = state.pageNo <= 1 || state.loading;
    els.nextBtn.disabled = state.pageNo >= totalPages || !state.totalCount || state.loading;
  }

  function renderKpis(items) {
    const open = items.filter((x) => /공고중|접수중/.test(x.pan_ss)).length;
    els.kpiCount.textContent = items.length.toLocaleString('ko-KR');
    els.kpiTotal.textContent = state.totalCount ? state.totalCount.toLocaleString('ko-KR') : '—';
    els.kpiOpen.textContent = open.toLocaleString('ko-KR');
    els.kpiSaved.textContent = state.lastSaved ? state.lastSaved.toLocaleString('ko-KR') : '0';
  }

  function statusClass(status) {
    if (/공고중|접수중/.test(status)) return 'tag open';
    if (/마감|종료/.test(status)) return 'tag closed';
    return 'tag';
  }

  function renderTable(items) {
    renderKpis(items);
    if (!items.length) {
      els.tbody.innerHTML = '';
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
    els.tbody.innerHTML = items
      .map((row, idx) => {
        const link = row.dtl_url
          ? `<a href="${row.dtl_url}" target="_blank" rel="noopener">청약센터 ↗</a>`
          : '—';
        return `<tr>
          <td>${(state.pageNo - 1) * PAGE_SIZE + idx + 1}</td>
          <td><strong>${escapeHtml(row.pan_nm || '—')}</strong><div class="sub">${escapeHtml(row.pan_id)}</div></td>
          <td>${escapeHtml(row.upp_ais_tp_nm || row.upp_ais_tp_cd || '—')}<div class="sub">${escapeHtml(row.ais_tp_cd_nm || '')}</div></td>
          <td>${escapeHtml(row.cnp_cd_nm || '—')}</td>
          <td><span class="${statusClass(row.pan_ss)}">${escapeHtml(row.pan_ss || '—')}</span></td>
          <td>${escapeHtml(row.pan_nt_st_dt || '—')}</td>
          <td>${escapeHtml(row.clsg_dt || '—')}</td>
          <td>${link}</td>
        </tr>`;
      })
      .join('');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function toCsv(rows) {
    const fields = [
      'pan_id',
      'pan_nm',
      'upp_ais_tp_nm',
      'ais_tp_cd_nm',
      'cnp_cd_nm',
      'pan_ss',
      'pan_nt_st_dt',
      'clsg_dt',
      'dtl_url',
    ];
    const escape = (v) => {
      const text = v == null ? '' : String(v);
      return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    return `\uFEFF${[fields.join(',')].concat(rows.map((r) => fields.map((f) => escape(r[f])).join(','))).join('\n')}\n`;
  }

  function downloadCsv() {
    if (!state.items.length) {
      setNotice('내보낼 데이터가 없습니다.', 'warn');
      return;
    }
    const blob = new Blob([toCsv(state.items)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lh-sale-info_p${state.pageNo}_${formatDotDate().replaceAll('.', '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadFromSupabase(params) {
    const filters = [];
    if (params.typeCode && params.typeCode !== 'all') {
      filters.push(`upp_ais_tp_cd=eq.${encodeURIComponent(params.typeCode)}`);
    } else {
      filters.push('upp_ais_tp_cd=neq.xx');
    }
    if (params.regionCode) {
      // region code is not stored reliably from portal; skip exact code filter
    }
    if (params.status) filters.push(`pan_ss=eq.${encodeURIComponent(params.status)}`);

    const from = (params.pageNo - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const query = [
      'select=*',
      ...filters,
      'order=pan_nt_st_dt.desc,fetched_at.desc',
    ].join('&');

    const response = await supabaseFetch(`/rest/v1/${TABLE}?${query}`, {
      headers: {
        Accept: 'application/json',
        Prefer: 'count=exact',
        Range: `${from}-${to}`,
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase 조회 실패 (${response.status}): ${detail.slice(0, 180)}`);
    }
    const rows = await response.json();
    const contentRange = response.headers.get('content-range') || '';
    const total = asInt((contentRange.match(/\/(\d+|\*)/) || [])[1], rows.length);
    return {
      items: rows.map((row) => normalizeItem(row, params.pageNo)).filter(Boolean),
      totalCount: total === '*' ? rows.length : total,
      source: 'supabase',
      saved: 0,
    };
  }

  async function loadPage({ save = true, preferSupabase = false } = {}) {
    if (state.loading) return;
    const apiKey = decodeServiceKey(els.key.value);
    if (apiKey) saveKey();

    state.loading = true;
    els.loadBtn.disabled = true;
    els.saveBtn.disabled = true;
    setStatus(preferSupabase ? 'Supabase에서 불러오는 중…' : 'LH 분양정보를 수집하는 중…');
    setNotice('');

    const params = currentParams();
    try {
      let result = null;
      let openApiError = null;

      if (!preferSupabase && apiKey) {
        try {
          try {
            result = await fetchViaProxy(apiKey, params, save);
            if (save) state.lastSaved = result.saved || result.items.length;
          } catch (_) {
            result = await fetchDirect(apiKey, params);
            if (save) {
              try {
                state.lastSaved = await saveToSupabase(result.items, params);
              } catch (saveError) {
                state.lastSaved = 0;
                setNotice(`조회는 성공했지만 Supabase 저장에 실패: ${saveError.message}`, 'warn');
              }
            }
          }
        } catch (error) {
          openApiError = error;
        }
      }

      if (!result) {
        result = await loadFromSupabase(params);
        state.lastSaved = result.items.length;
        if (openApiError) {
          setNotice(
            `공공데이터 API는 아직 403입니다. LH 청약플러스에서 수집해 둔 Supabase 데이터 ${result.items.length}건을 표시합니다. (${openApiError.message})`,
            'warn',
          );
        } else if (preferSupabase) {
          setNotice(`Supabase에서 ${result.items.length}건을 불러왔습니다.`, 'ok');
        }
      } else if (save && state.lastSaved) {
        setNotice(`Supabase에 ${state.lastSaved}건 upsert 했습니다.`, 'ok');
      }

      state.items = result.items;
      state.totalCount = result.totalCount || result.items.length;
      els.sourceMode.textContent =
        result.source === 'supabase'
          ? 'Supabase'
          : result.source === 'proxy'
            ? '프록시 API'
            : 'data.go.kr';
      renderTable(state.items);
      updatePager();
      setStatus(`${state.items.length}건 표시 (페이지 ${state.pageNo})`, 'ok');
      await loadLogs();
      document.getElementById('viz')?.classList.add('ready');
    } catch (error) {
      setStatus('조회 실패', 'err');
      setNotice(error instanceof Error ? error.message : String(error), 'err');
    } finally {
      state.loading = false;
      els.loadBtn.disabled = false;
      els.saveBtn.disabled = false;
      updatePager();
    }
  }

  function initDates() {
    if (!els.startDate.value) els.startDate.value = yearsAgoDot(2);
    if (!els.endDate.value) els.endDate.value = formatDotDate();
  }

  els.toggleKey?.addEventListener('click', () => {
    const hidden = els.key.type === 'password';
    els.key.type = hidden ? 'text' : 'password';
    els.toggleKey.textContent = hidden ? '숨김' : '표시';
  });
  els.loadBtn?.addEventListener('click', () => {
    state.pageNo = 1;
    loadPage({ save: true, preferSupabase: false });
  });
  els.saveBtn?.addEventListener('click', () => loadPage({ save: false, preferSupabase: true }));
  els.prevBtn?.addEventListener('click', () => {
    if (state.pageNo <= 1) return;
    state.pageNo -= 1;
    loadPage({ save: false, preferSupabase: true });
  });
  els.nextBtn?.addEventListener('click', () => {
    state.pageNo += 1;
    loadPage({ save: false, preferSupabase: true });
  });
  els.csvBtn?.addEventListener('click', downloadCsv);

  loadKey();
  initDates();
  updatePager();
  renderTable([]);
  loadLogs();
  loadPage({ save: false, preferSupabase: true });
})();
