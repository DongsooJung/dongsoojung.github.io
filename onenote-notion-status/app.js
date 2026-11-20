(() => {
  const API_URL = '/api/service-status';
  const NOTION_SUMMARY = 'https://www.notion-status.com/api/v2/summary.json';
  const HISTORY_KEY = 'onenote-notion-status-history-v2'; // v1 mixed probe reachability with service status
  const MAX_HISTORY = 12;

  const el = {
    refreshBtn: document.getElementById('refresh-btn'),
    autoRefresh: document.getElementById('auto-refresh'),
    checkedAt: document.getElementById('checked-at'),
    overallState: document.getElementById('overall-state'),
    overallSub: document.getElementById('overall-sub'),
    statOnenote: document.getElementById('stat-onenote'),
    statNotion: document.getElementById('stat-notion'),
    statLatency: document.getElementById('stat-latency'),
    services: document.getElementById('services'),
    historyList: document.getElementById('history-list'),
  };

  let timer = null;
  let loading = false;

  const STATE_LABEL = {
    operational: '정상',
    degraded: '지연·부분장애',
    down: '장애',
    unknown: '확인불가',
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'Asia/Seoul',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function mapNotionIndicator(indicator) {
    switch (String(indicator || '').toLowerCase()) {
      case 'none':
        return 'operational';
      case 'minor':
      case 'maintenance':
        return 'degraded';
      case 'major':
      case 'critical':
        return 'down';
      default:
        return 'unknown';
    }
  }

  function summarizeProbes(probes) {
    if (!probes.length) return { state: 'unknown', okCount: 0, total: 0, avgLatencyMs: null };
    const okCount = probes.filter((p) => p.ok).length;
    const downCount = probes.filter((p) => p.state === 'down').length;
    const degradedCount = probes.filter((p) => p.state === 'degraded').length;
    const latencies = probes.filter((p) => p.ok && Number.isFinite(p.latencyMs) && p.latencyMs >= 0).map((p) => p.latencyMs);
    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;
    let state = 'operational';
    if (downCount === probes.length) state = 'down';
    else if (downCount > 0 || degradedCount > 0) state = 'degraded';
    else if (probes.some((p) => p.state !== 'operational')) state = 'unknown';
    return { state, okCount, total: probes.length, avgLatencyMs };
  }

  function rollup(a, b) {
    if (a === 'down' || b === 'down') return 'down';
    if (a === 'degraded' || b === 'degraded') return 'degraded';
    if (a !== 'operational' || b !== 'operational') return 'unknown';
    return 'operational';
  }

  async function probeClient(url, accept) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors',
        cache: 'no-store',
      });
      const latencyMs = Date.now() - started;
      const authRequired = [401, 403].includes(response.status);
      const ok = accept.includes(response.status) && !authRequired;
      return {
        ok,
        httpStatus: response.status,
        latencyMs,
        state: ok ? (latencyMs > 2500 ? 'degraded' : 'operational') : 'unknown',
        reachability: authRequired ? 'auth_required' : ok ? 'reachable' : 'http_error',
        error: null,
        finalUrl: response.url || url,
      };
    } catch (error) {
      return {
        ok: false,
        httpStatus: null,
        latencyMs: Date.now() - started,
        state: 'unknown',
        error: String(error.message || error),
        finalUrl: url,
        reachability: 'unavailable',
      };
    } finally { clearTimeout(timeout); }
  }

  async function fallbackPayload() {
    const checkedAt = new Date().toISOString();
    let official = {
      ok: false,
      description: '공식 상태 조회 실패',
      indicator: 'unknown',
      state: 'unknown',
      components: [],
      incidents: [],
      pageUrl: 'https://www.notion-status.com/',
      error: null,
      latencyMs: null,
    };

    const started = Date.now();
    let notionOfficialProbe;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(NOTION_SUMMARY, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!data.status || !Array.isArray(data.components)) throw new Error('공식 상태 JSON 형식 확인 필요');
      const latencyMs = Date.now() - started;
      official = {
        ok: true, latencyMs, description: data.status.description || 'Unknown',
        indicator: data.status.indicator || 'unknown', state: mapNotionIndicator(data.status.indicator),
        pageUrl: data.page?.url || 'https://www.notion-status.com/', updatedAt: data.page?.updated_at || null,
        components: data.components.filter(c => c && !c.group && c.name).map(c => ({id:c.id,name:c.name,status:c.status,description:c.description || '',updatedAt:c.updated_at || null})),
        incidents: Array.isArray(data.incidents) ? data.incidents : [], error: null,
      };
      notionOfficialProbe = {ok:true,httpStatus:response.status,latencyMs,state:latencyMs > 2500 ? 'degraded' : 'operational',reachability:'reachable',finalUrl:response.url || NOTION_SUMMARY};
    } catch(error) {
      official.error = error.name === 'AbortError' ? '공식 상태 조회 시간 초과' : String(error.message || error);
      notionOfficialProbe = {ok:false,httpStatus:null,latencyMs:Date.now()-started,state:'unknown',reachability:'unavailable',error:official.error,finalUrl:NOTION_SUMMARY};
    } finally { clearTimeout(timeout); }

    const notionApi = await probeClient('https://api.notion.com/v1/users/me', [401, 403]);
    const notionProbes = [
      {
        id: 'notion-status-api',
        service: 'notion',
        label: 'Notion Status API',
        url: NOTION_SUMMARY,
        ...notionOfficialProbe,
      },
      {
        id: 'notion-api',
        service: 'notion',
        label: 'Notion API',
        url: 'https://api.notion.com/v1/users/me',
        ...notionApi,
      },
    ];
    const notionProbeSummary = summarizeProbes(notionProbes);

    return {
      checkedAt,
      region: 'browser-fallback',
      source: 'fallback',
      services: {
        onenote: {
          name: 'Microsoft OneNote',
          webUrl: 'https://www.onenote.com/',
          statusPageUrl: 'https://status.cloud.microsoft/',
          official: {
            note: '이번 공개 조회로 OneNote 개인 계정·노트북·동기화 상태를 확인할 수 없습니다. Microsoft Graph의 테넌트 서비스 상태는 조직 권한이 필요하며 개인 Microsoft 계정은 지원하지 않습니다.',
            state: 'unknown',
          },
          probes: [],
          summary: { state: 'unknown', okCount: 0, total: 0, avgLatencyMs: null },
          overall: 'unknown',
        },
        notion: {
          name: 'Notion',
          webUrl: 'https://www.notion.so/',
          statusPageUrl: 'https://www.notion-status.com/',
          official,
          probes: notionProbes,
          summary: notionProbeSummary,
          overall: official.state // Public reachability never changes the provider incident status,
        },
      },
    };
  }

  async function loadStatus() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${API_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`API HTTP ${response.status}`);
      const data = await response.json();
      if (!data.services?.onenote || !data.services?.notion) throw new Error('상태 응답 형식 확인 필요');
      data.services.onenote.overall = 'unknown';
      data.services.notion.overall = data.services.notion.official?.ok ? data.services.notion.official.state : 'unknown';
      data.source = 'api';
      return data;
    } catch {
      return fallbackPayload();
    } finally { clearTimeout(timeout); }
  }

  function badge(state) {
    const key = STATE_LABEL[state] ? state : 'unknown';
    return `<span class="badge ${key}">${STATE_LABEL[key]}</span>`;
  }

  function mini(state) {
    const key = STATE_LABEL[state] ? state : 'unknown';
    return `<span class="mini ${key}">${STATE_LABEL[key]}</span>`;
  }

  function renderProbes(probes) {
    if (!probes?.length) {
      return '<div class="empty">프로브 결과가 없습니다.</div>';
    }
    return probes
      .map(
        (p) => `
      <div class="probe">
        <div class="name">${escapeHtml(p.label)}
          <span class="url">${escapeHtml(p.finalUrl || p.url)}</span>
        </div>
        <span class="mini ${p.ok ? p.state : 'unknown'}">${escapeHtml(p.reachability === 'auth_required' || [401,403].includes(p.httpStatus) ? '인증·접근 제한' : p.ok ? (p.state === 'degraded' ? '공개 응답 지연' : '공개 응답 도달') : '응답 확인불가')}</span>
        <div class="latency">${p.latencyMs != null ? `${p.latencyMs} ms` : '—'} · ${
          p.httpStatus != null ? `HTTP ${p.httpStatus}` : escapeHtml(p.error || 'n/a')
        }</div>
      </div>`
      )
      .join('');
  }

  function componentState(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'operational') return 'operational';
    if (s.includes('degrad') || s.includes('partial') || s.includes('maintenance')) return 'degraded';
    if (s.includes('major') || s.includes('outage') || s === 'down') return 'down';
    return 'unknown';
  }

  function renderComponents(components) {
    if (!components?.length) return '<div class="empty">구성 요소 정보가 없습니다.</div>';
    return components
      .map(
        (c) => `
      <div class="component">
        <div class="name">${escapeHtml(c.name)}</div>
        ${mini(componentState(c.status))}
        <div class="latency">${escapeHtml(c.status)}</div>
      </div>`
      )
      .join('');
  }

  function renderService(key, service) {
    const accent = key === 'onenote' ? 'var(--onenote)' : 'var(--notion)';
    const officialNote = service.official?.note
      ? `<div class="note">${escapeHtml(service.official.note)}</div>`
      : '';
    const officialBlock =
      key === 'notion' && service.official?.ok
        ? `<div class="section-label">공식 상태</div>
           <div class="probe">
             <div class="name">${escapeHtml(service.official.description)}
               <span class="url">indicator: ${escapeHtml(service.official.indicator)}</span><span class="url">제공자 갱신 · ${escapeHtml(formatTime(service.official.updatedAt))}</span>
             </div>
             ${mini(service.official.state)}
             <div class="latency">${
               service.official.latencyMs != null ? `${service.official.latencyMs} ms` : '—'
             }</div>
           </div>
           <div class="section-label">구성 요소 · ${service.official.components.length}개</div>
           ${renderComponents(service.official.components)}`
        : key === 'notion'
          ? `<div class="section-label">공식 상태</div>
             <div class="empty">${escapeHtml(service.official?.error || '조회 실패')}</div>`
          : `<div class="section-label">공식 상태</div>${officialNote}`;

    return `
      <article class="service" style="--svc:${accent}">
        <div class="service-head">
          <div>
            <h2 style="color:${accent}">${escapeHtml(service.name)}</h2>
            <div class="sub">${escapeHtml(service.webUrl)}</div>
          </div>
          ${badge(service.overall)}
        </div>
        <div class="service-body">
          ${officialBlock}
          <div class="section-label">공개 응답 도달성 · 서비스 정상 판정과 별도</div>
          ${renderProbes(service.probes)}
          <div class="links">
            <a class="chip" href="${escapeHtml(service.webUrl)}" target="_blank" rel="noopener">웹앱 열기 ↗</a>
            <a class="chip" href="${escapeHtml(service.statusPageUrl)}" target="_blank" rel="noopener">상태 페이지 ↗</a>
          </div>
        </div>
      </article>`;
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveHistory(entry) {
    const list = loadHistory();
    list.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
  }

  function renderHistory() {
    const list = loadHistory();
    if (!list.length) {
      el.historyList.innerHTML = '<div class="empty">아직 기록이 없습니다.</div>';
      return;
    }
    el.historyList.innerHTML = list
      .map(
        (item) => `
      <div class="history-item">
        <div>${escapeHtml(formatTime(item.checkedAt))}</div>
        <div>OneNote ${escapeHtml(STATE_LABEL[item.onenote] || item.onenote)}</div>
        <div>Notion ${escapeHtml(STATE_LABEL[item.notion] || item.notion)}</div>
        <div>${item.avgLatencyMs != null ? `${item.avgLatencyMs} ms` : '—'}</div>
      </div>`
      )
      .join('');
  }

  function overallFrom(data) {
    return rollup(data.services.onenote.overall, data.services.notion.overall);
  }

  function avgLatency(data) {
    const all = [
      ...(data.services.onenote.probes || []),
      ...(data.services.notion.probes || []),
    ].filter((p) => p.ok && Number.isFinite(p.latencyMs) && p.latencyMs >= 0);
    if (!all.length) return null;
    return Math.round(all.reduce((sum, p) => sum + p.latencyMs, 0) / all.length);
  }

  function render(data) {
    const overall = overallFrom(data);
    const latency = avgLatency(data);
    el.overallState.textContent = STATE_LABEL[overall] || '확인불가';
    el.overallSub.textContent =
      data.source === 'fallback'
        ? 'API 프록시 없이 브라우저 폴백으로 조회했습니다. OneNote는 이번 조회 범위에서 확인할 수 없습니다. 프록시 연결도 계정 내부 정상 여부를 보장하지 않습니다.'
        : `리전 ${data.region || '—'} · Notion은 제공자 공식 상태, OneNote 계정 상태는 확인불가입니다. 공개 응답 도달성은 서비스 정상 여부와 구분합니다.`;
    el.statOnenote.textContent = STATE_LABEL[data.services.onenote.overall] || '—';
    el.statNotion.textContent = STATE_LABEL[data.services.notion.overall] || '—';
    el.statLatency.textContent = latency != null ? `${latency}ms` : '—';
    el.checkedAt.textContent = `이번 조회 시작 · ${formatTime(data.checkedAt)}`;
    el.services.innerHTML =
      renderService('onenote', data.services.onenote) +
      renderService('notion', data.services.notion);

    saveHistory({
      checkedAt: data.checkedAt,
      onenote: data.services.onenote.overall,
      notion: data.services.notion.overall,
      avgLatencyMs: latency,
    });
    renderHistory();
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    el.refreshBtn.disabled = true;
    el.refreshBtn.textContent = '점검 중…';
    try {
      const data = await loadStatus();
      render(data);
    } catch (error) {
      el.overallState.textContent = '오류';
      el.overallSub.textContent = String(error.message || error);
    } finally {
      loading = false;
      el.refreshBtn.disabled = false;
      el.refreshBtn.textContent = '지금 다시 점검';
    }
  }

  function syncTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (el.autoRefresh.checked) {
      timer = setInterval(refresh, 60000);
    }
  }

  el.refreshBtn.addEventListener('click', refresh);
  el.autoRefresh.addEventListener('change', syncTimer);
  renderHistory();
  refresh();
  syncTimer();
})();
