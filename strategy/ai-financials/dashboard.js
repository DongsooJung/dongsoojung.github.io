(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
  const isNumber = value => typeof value === 'number' && Number.isFinite(value);
  const format = value => isNumber(value) ? number.format(value) : '—';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const statusNames = { reported: '공개', undisclosed: '미확보·미공개', not_yet_reported: '미발표·미확인', future: '진행 중·미래 분기' };
  const scopeNames = { parent_consolidated: '운영사 연결 전체 · AI 서비스 단독 아님', operator: 'AI 운영사', ai_segment: 'AI 사업부', consolidated: '운영사 연결 전체 · AI 서비스 단독 아님' };
  const statements = {
    income: [['revenue', '매출'], ['operatingIncome', '영업손익'], ['netIncome', '순손익']],
    balance: [['totalAssets', '자산 총계'], ['totalLiabilities', '부채 총계'], ['redeemablePreferredStock', '상환전환우선주 (중간자본)'], ['totalEquity', '자본 총계'], ['cashAndEquivalents', '현금 및 현금성 자산']],
    cash: [['operatingCashFlow', '영업활동 현금흐름'], ['capex', '설비투자 (Capex)']]
  };
  const metricNames = Object.fromEntries(Object.values(statements).flat());
  let data;
  let sourceMap;
  let selected;
  let statement = 'income';
  const year = () => $('year').value;
  const visibleQuarters = company => company.quarters.filter(q => year() === 'all' || String(q.quarter).startsWith(year()));
  const scope = (company, quarter) => {
    const value = quarter?.reportingScope || company.scope;
    return scopeNames[value] || value || '운영사 · 범위는 출처 참조';
  };
  const status = q => Object.hasOwn(statusNames, q.status) ? q.status : 'undisclosed';
  const badge = q => `<span class="status ${status(q)}">${q.statementCoverage === 'balance_sheet_only' ? '재무상태만 확보' : statusNames[status(q)]}</span>`;
  const latestMetric = (company, key, quarters = visibleQuarters(company)) => [...quarters].reverse().find(q => q.status === 'reported' && isNumber(q[key]));
  const dateLabel = q => q.periodEnd || q.quarter;
  const safeUrl = url => {
    try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null; } catch (_) { return null; }
  };
  const sourceLinks = ids => (ids || []).map(id => {
    const s = sourceMap.get(id);
    const url = s && safeUrl(s.url);
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.label || id)} ↗</a>` : '';
  }).join(' ');

  function renderPicker() {
    $('company-picker').innerHTML = data.companies.map((company, i) => `<button type="button" class="company-button" data-company="${esc(company.id)}" aria-pressed="${company.id === selected.id}"><span class="service-mark" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span><strong>${esc(company.service)}</strong><small>${esc(company.name)}</small></span></button>`).join('');
  }

  function renderMetricCards() {
    $('metric-cards').innerHTML = ['revenue', 'operatingIncome', 'netIncome', 'totalAssets'].map(key => {
      const q = latestMetric(selected, key);
      return `<div class="metric-card"><span>${metricNames[key]} · 최근 공개 분기</span><strong class="${q && q[key] < 0 ? 'negative' : ''}">${format(q?.[key])}</strong><small>${q ? `${esc(q.quarter)} · ${esc(dateLabel(q))}` : '선택 기간에 수록된 수치 없음'}</small></div>`;
    }).join('');
  }

  function renderChart() {
    const quarters = visibleQuarters(selected);
    const key = $('chart-metric').value;
    const values = quarters.map(q => q.status === 'reported' && isNumber(q[key]) ? q[key] : null);
    const available = values.filter(isNumber);
    $('chart-note').textContent = `${metricNames[key]} · 백만 USD · 미확보·미공개 구간은 연결하지 않습니다.`;
    if (!available.length) {
      $('chart').innerHTML = '<div class="chart-empty"><strong>확보된 분기 수치가 없습니다</strong><span>운영사가 공시한 자료만 수록합니다.<br>공식 ARR·투자유치 발표는 아래 참고 지표에서 확인하세요.</span></div>';
      return;
    }
    const width = 1100, height = 285, left = 75, right = 45, top = 30, bottom = 46;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    let low = Math.min(0, ...available), high = Math.max(0, ...available);
    if (low === high) { low -= 1; high += 1; }
    const padding = (high - low) * 0.12;
    high += padding;
    if (low < 0) low -= padding;
    const x = i => left + (quarters.length > 1 ? i * plotWidth / (quarters.length - 1) : plotWidth / 2);
    const y = value => top + (high - value) / (high - low) * plotHeight;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(selected.service)} ${esc(metricNames[key])} 분기 추이"><title>${esc(selected.name)} ${esc(metricNames[key])}, 백만 USD</title><desc>${quarters.map((q, i) => `${esc(q.quarter)}: ${format(values[i])}`).join('; ')}</desc>`;
    for (let i = 0; i <= 4; i++) {
      const value = low + (high - low) * i / 4;
      svg += `<line class="grid" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 12}" y="${y(value) + 4}" text-anchor="end">${format(value)}</text>`;
    }
    let segment = [];
    const flush = () => { if (segment.length > 1) svg += `<polyline class="line" points="${segment.join(' ')}"/>`; segment = []; };
    values.forEach((value, i) => { if (isNumber(value)) segment.push(`${x(i)},${y(value)}`); else flush(); });
    flush();
    quarters.forEach((q, i) => {
      const label = year() === 'all' ? `${q.quarter.slice(2, 4)} ${q.quarter.slice(4)}` : q.quarter.slice(4);
      svg += `<text x="${x(i)}" y="${height - 15}" text-anchor="middle">${esc(label)}</text>`;
      if (isNumber(values[i])) svg += `<circle class="point" cx="${x(i)}" cy="${y(values[i])}" r="5"><title>${esc(q.quarter)} · ${esc(dateLabel(q))}: ${format(values[i])} 백만 USD</title></circle>`;
      else svg += `<text x="${x(i)}" y="${top + plotHeight - 8}" text-anchor="middle">—</text>`;
    });
    $('chart').innerHTML = `${svg}</svg>`;
  }

  function renderStatement() {
    const quarters = visibleQuarters(selected);
    document.querySelectorAll('[data-statement]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.statement === statement)));
    let html = `<caption class="sr-only">${esc(selected.name)} 분기별 ${statement === 'income' ? '손익계산서' : statement === 'balance' ? '재무상태표' : '현금흐름표'}, 단위 백만 USD</caption><thead><tr><th scope="col">재무 항목<small>단위: 백만 USD</small></th>${quarters.map(q => `<th scope="col">${esc(q.quarter)}<small>${esc(q.fiscalQuarter || '회계분기 미확보·미공개')}</small><small>종료일 ${esc(q.periodEnd || '미확보·미공개')}</small></th>`).join('')}</tr></thead><tbody>`;
    html += `<tr class="meta-row"><th scope="row">공개 상태</th>${quarters.map(q => `<td>${badge(q)}</td>`).join('')}</tr>`;
    html += `<tr class="meta-row"><th scope="row">보고 범위</th>${quarters.map(q => `<td>${esc(scope(selected, q))}</td>`).join('')}</tr>`;
    statements[statement].filter(([key]) => key !== 'redeemablePreferredStock' || selected.quarters.some(q => isNumber(q[key]))).forEach(([key, name]) => {
      html += `<tr><th scope="row">${name}${key === 'redeemablePreferredStock' ? '<small>부채·자본과 별도 분류</small>' : ''}</th>${quarters.map(q => `<td class="numeric ${isNumber(q[key]) && q[key] < 0 ? 'negative' : ''}">${format(q[key])}</td>`).join('')}</tr>`;
    });
    html += `<tr class="meta-row"><th scope="row">분기 출처</th>${quarters.map(q => `<td>${sourceLinks(q.sourceIds) || '—'}</td>`).join('')}</tr></tbody>`;
    $('statement-table').innerHTML = html;
  }

  function renderHighlights() {
    const list = (selected.highlights || []).filter(h => year() === 'all' || String(h.date).startsWith(year()));
    $('highlights').innerHTML = list.length ? `<div class="highlight-list">${list.map(h => `<article class="highlight-item"><time datetime="${esc(h.date)}">${esc(h.date)}</time><h5>${esc(h.label)} <span class="tag">${esc(h.kind || '참고')}</span></h5><span class="highlight-value">${esc(h.value)}</span>${h.notes ? `<p>${esc(h.notes)}</p>` : ''}<div class="source-links">${sourceLinks(h.sourceIds)}</div></article>`).join('')}</div>` : '<p class="empty-copy">선택 연도에 수록된 공식 참고 지표가 없습니다.</p>';
  }

  function renderSources() {
    const quarters = visibleQuarters(selected);
    $('quarter-notes').innerHTML = quarters.filter(q => q.notes).map(q => `<p class="quarter-note"><strong>${esc(q.quarter)}</strong> · ${esc(q.notes)}</p>`).join('');
    const ids = new Set([...quarters.flatMap(q => q.sourceIds || []), ...(selected.highlights || []).filter(h => year() === 'all' || String(h.date).startsWith(year())).flatMap(h => h.sourceIds || []), ...(selected.sourceIds || [])]);
    const sources = [...ids].map(id => sourceMap.get(id)).filter(Boolean);
    $('company-sources').innerHTML = sources.map(s => `<li>${sourceLinks([s.id])}<small>${esc(s.filingDate || s.publishedAt || '')}${s.audit ? ` · ${esc(s.audit)}` : ''}</small></li>`).join('') || '<li>수록된 공식 분기 재무제표 출처가 없습니다. 미확보·미공개는 0을 의미하지 않습니다.</li>';
  }

  function renderOverview() {
    $('overview-body').innerHTML = data.companies.map(company => {
      const quarters = visibleQuarters(company);
      const q = latestMetric(company, 'revenue', quarters);
      const recent = q || [...quarters].reverse().find(item => item.status !== 'future') || quarters.at(-1) || { status: 'undisclosed' };
      return `<tr><td><button type="button" data-company="${esc(company.id)}"><strong>${esc(company.service)}</strong><small>${esc(company.name)}</small></button></td><td>${esc(scope(company, q || recent))}</td><td>${q ? esc(q.quarter) : '—'}<small>${q ? esc(dateLabel(q)) : '분기 매출 미확보·미공개'}</small></td><td class="numeric">${format(q?.revenue)}</td><td>${badge(recent)}</td></tr>`;
    }).join('');
  }

  function render() {
    renderPicker();
    $('company-name').textContent = `${selected.service} / ${selected.name}`;
    $('company-description').textContent = selected.description || '';
    $('company-tags').innerHTML = `<span class="tag accent">${esc(selected.isPublic ? '상장 운영사' : '비상장 운영사')}</span>${selected.ticker ? `<span class="tag">${esc(selected.ticker)}</span>` : ''}<span class="tag">${esc(scope(selected))}</span>`;
    renderMetricCards(); renderChart(); renderStatement(); renderHighlights(); renderSources(); renderOverview();
  }

  function downloadCsv() {
    const keys = ['quarter', 'periodStart', 'periodEnd', 'fiscalQuarter', 'status', 'statementCoverage', 'reportingScope', ...Object.values(statements).flat().map(([key]) => key), 'notes'];
    const fields = ['service', 'company', 'unit', 'asOf', ...keys, 'sourceIds', 'sourceUrls'];
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = selected.quarters.map(q => [selected.service, selected.name, data.unit || 'USD million', data.asOf, ...keys.map(key => key === 'reportingScope' ? scope(selected, q) : q[key]), (q.sourceIds || []).join('|'), (q.sourceIds || []).map(id => sourceMap.get(id)?.url || '').join('|')]);
    const blob = new Blob(['\uFEFF', [fields, ...rows].map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `ai-financials-${selected.id}-${data.asOf}.csv`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const companyButton = event.target.closest('[data-company]');
      if (companyButton) {
        const found = data.companies.find(company => company.id === companyButton.dataset.company);
        if (found) {
          selected = found;
          const fromOverview = !!companyButton.closest('#overview-body');
          render();
          if (fromOverview) $('explorer-title').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
          else $('company-picker').querySelector(`[data-company="${CSS.escape(selected.id)}"]`)?.focus({ preventScroll: true });
        }
      }
      const tab = event.target.closest('[data-statement]');
      if (tab) { statement = tab.dataset.statement; renderStatement(); }
    });
    $('year').addEventListener('change', render);
    $('chart-metric').addEventListener('change', renderChart);
    $('download-csv').addEventListener('click', downloadCsv);
  }

  async function init() {
    try {
      const response = await fetch('./data.json?v=20261007', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      if (!Array.isArray(data.companies) || !data.companies.length || !Array.isArray(data.sources) || data.companies.some(c => !Array.isArray(c.quarters))) throw new Error('Invalid financial data');
      sourceMap = new Map(data.sources.map(s => [s.id, s]));
      data.companies.forEach(company => company.quarters.sort((a, b) => String(a.quarter).localeCompare(String(b.quarter))));
      selected = data.companies[0];
      $('as-of').textContent = `자료 기준일 ${data.asOf} · 공식 공시·기업 발표`;
      $('company-count').textContent = data.companies.length;
      $('reported-count').textContent = data.companies.filter(c => c.quarters.some(q => q.status === 'reported' && Object.values(statements).flat().some(([key]) => isNumber(q[key])))).length;
      $('methodology-notes').innerHTML = (data.methodology || []).map(note => `<li>${esc(note)}</li>`).join('');
      bindEvents(); render();
      $('load-state').hidden = true; $('dashboard').hidden = false;
    } catch (_) {
      $('load-state').innerHTML = '재무자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요. <a href="./data.json">원본 데이터 확인 ↗</a>';
      $('load-state').setAttribute('role', 'alert');
    }
  }
  init();
})();
