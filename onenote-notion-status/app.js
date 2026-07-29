(() => {
  const API_URL = '/api/service-status';
  const NOTION_SUMMARY = 'https://www.notion-status.com/api/v2/summary.json';
  const HISTORY_KEY = 'onenote-notion-status-history-v1';
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
    const latencies = probes.filter((p) => p.ok).map((p) => p.latencyMs);
    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;
    let state = 'operational';
    if (downCount === probes.length) state = 'down';
    else if (downCount > 0 || degradedCount > 0) state = 'degraded';
    return { state, okCount, total: probes.length, avgLatencyMs };
  }

  function rollup(a, b) {
    const ranks = { operational: 0, degraded: 1, down: 2, unknown: 1 };
    const max = Math.max(ranks[a] ?? 1, ranks[b] ?? 1);
    if (max >= 2) return 'down';
    if (max === 1) return 'degraded';
    return 'operational';
  }

  async function probeClient(url, accept) {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
      });
      const latencyMs = Date.now() - started;
      const ok = accept.includes(response.status);
      return {
        ok,
        httpStatus: response.status,
        latencyMs,
        state: ok ? (latencyMs > 2500 ? 'degraded' : 'operational') : 'down',
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
      };
    }
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

    const notionOfficialProbe = await probeClient(NOTION_SUMMARY, [200]);
    if (notionOfficialProbe.ok) {
      try {
        const response = await fetch(NOTION_SUMMARY, { cache: 'no-store' });
        const data = await response.json();
        official = {
          ok: true,
          latencyMs: notionOfficialProbe.latencyMs,
          description: data.status?.description || 'Unknown',
          indicator: data.status?.indicator || 'unknown',
          state: mapNotionIndicator(data.status?.indicator),
          pageUrl: data.page?.url || 'https://www.notion-status.com/',
          updatedAt: data.page?.updated_at || null,
          components: Array.isArray(data.components)
            ? data.components
                .filter((c) => c && !c.group && c.name)
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  status: c.status,
                  description: c.description || '',
                  updatedAt: c.updated_at || null,
                }))
            : [],
          incidents: Array.isArray(data.incidents) ? data.incidents.slice(0, 8) : [],
          error: null,
        };
      } catch (error) {
        official.error = String(error.message || error);
      }
    } else {
      official.error = notionOfficialProbe.error || 'unreachable';
      official.latencyMs = notionOfficialProbe.latencyMs;
    }

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
            note: 'GitHub Pages/정적 환경에서는 OneNote 프로브 프록시(/api/service-status)가 필요합니다. 아래 링크로 웹앱을 직접 열어 확인하세요.',
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
          overall: rollup(official.state, notionProbeSummary.state),
        },
      },
    };
  }

  async function loadStatus() {
    try {
      const response = await fetch(`${API_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`API HTTP ${response.status}`);
      const data = await response.json();
      data.source = 'api';
      return data;
    } catch {
      return fallbackPayload();
    }
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
        ${mini(p.state)}
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
    if (s.includes('degrad') || s.includes('partial') || s === 'maintenance') return 'degraded';
    if (s.includes('major') || s.includes('outage') || s === 'down') return 'down';
    return 'unknown';
  }

  function renderComponents(components) {
    if (!components?.length) return '<div class="empty">구성 요소 정보가 없습니다.</div>';
    return components
      .slice(0, 12)
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
               <span class="url">indicator: ${escapeHtml(service.official.indicator)}</span>
             </div>
             ${mini(service.official.state)}
             <div class="latency">${
               service.official.latencyMs != null ? `${service.official.latencyMs} ms` : '—'
             }</div>
           </div>
           <div class="section-label">구성 요소</div>
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
          <div class="section-label">웹 도달성 프로브</div>
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
    ].filter((p) => p.ok && typeof p.latencyMs === 'number');
    if (!all.length) return null;
    return Math.round(all.reduce((sum, p) => sum + p.latencyMs, 0) / all.length);
  }

  function render(data) {
    const overall = overallFrom(data);
    const latency = avgLatency(data);
    el.overallState.textContent = STATE_LABEL[overall] || '확인불가';
    el.overallSub.textContent =
      data.source === 'fallback'
        ? 'API 프록시 없이 브라우저 폴백으로 조회했습니다. OneNote는 프록시 연결 후 완전 점검됩니다.'
        : `리전 ${data.region || '—'} · 공개 상태·웹 엔드포인트 기반`;
    el.statOnenote.textContent = STATE_LABEL[data.services.onenote.overall] || '—';
    el.statNotion.textContent = STATE_LABEL[data.services.notion.overall] || '—';
    el.statLatency.textContent = latency != null ? `${latency}ms` : '—';
    el.checkedAt.textContent = `마지막 점검 · ${formatTime(data.checkedAt)}`;
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
