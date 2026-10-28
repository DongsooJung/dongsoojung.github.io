/* STARGATE OpenDART official disclosures — read-only public JSON snapshot. */
(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const targetNames = ['아리바이오', 'SK에코플랜트', 'LS전선', '아이엠증권', '삼성메디슨'];
  const metricLabels = [
    ['revenue', '매출액/영업수익'], ['operating_profit', '영업이익'],
    ['net_income', '당기순이익'], ['assets', '자산총계'],
    ['liabilities', '부채총계'], ['equity', '자본총계']
  ];
  let snapshot = null;

  function node(tag, text, className) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  }

  function formatMoney(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '공시 없음';
    const abs = Math.abs(value);
    const formatted = abs >= 100000000
      ? (value / 100000000).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '억 원'
      : value.toLocaleString('ko-KR') + '원';
    return formatted;
  }

  function formatDate(value) {
    return /^\d{8}$/.test(value || '')
      ? value.slice(0, 4) + '-' + value.slice(4, 6) + '-' + value.slice(6, 8)
      : '날짜 미확인';
  }

  function renderFinancial() {
    const root = el('dartFinancialBody');
    root.replaceChildren();
    const name = el('dartCompany').value;
    if (!snapshot || snapshot.status !== 'ok') {
      root.appendChild(node('p', '인증된 OpenDART 데이터가 아직 없습니다. 데이터 수집 설정을 확인하세요.', 'help'));
      return;
    }
    const company = (snapshot.financials || []).find((d) => d.name === name);
    if (!company) {
      root.appendChild(node('p', '선택 기업의 OpenDART 매칭 결과가 없습니다.', 'help'));
      return;
    }
    if (company.match !== 'unique_exact_name') {
      const reason = company.match === 'ambiguous' ? '동일 이름의 공시법인이 복수 확인됨' : '일치하는 공시법인 찾지 못함';
      root.appendChild(node('div', reason + ' — 잘못된 재무정보 표시를 방지하기 위해 수치를 생략했습니다.', 'note warning'));
      return;
    }
    if (!company.periods || company.periods.length === 0) {
      root.appendChild(node('div', 'DART 고유번호가 확인되었지만 조회 가능한 정기보고서 재무정보는 없습니다.', 'note warning'));
      return;
    }
    const hint = node('p', '공시법인 고유번호 ' + company.corp_code + ' · 연결(CFS) 우선, 없으면 별도(OFS) · 기간별 금액을 서로 합산하지 않습니다.', 'help');
    root.appendChild(hint);
    const container = node('div', undefined, 'dart-financial-grid');
    company.periods.forEach((p) => {
      const section = node('section', undefined, 'dart-financial-period');
      section.appendChild(node('h3', p.period + ' · ' + (p.fs_div === 'CFS' ? '연결' : '별도')));
      const dl = node('dl', undefined, 'dart-metrics');
      metricLabels.forEach(([metric, label]) => {
        dl.appendChild(node('dt', label));
        dl.appendChild(node('dd', formatMoney(p.metrics && p.metrics[metric])));
      });
      section.appendChild(dl);
      container.appendChild(section);
    });
    root.appendChild(container);
    const a = node('a', 'OpenDART 기업공시 원문 확인 ↗', 'btn');
    a.href = 'https://dart.fss.or.kr/';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    root.appendChild(a);
  }

  function renderFilings() {
    const root = el('dartIpoRows');
    const status = el('dartIpoMeta');
    root.replaceChildren();
    if (!snapshot || snapshot.status !== 'ok') {
      status.textContent = '현재 OpenDART 인증 수집 데이터가 없어 실제 공시 목록을 표시하지 않습니다.';
      root.appendChild(node('p', '수집 미설정 또는 데이터 없음', 'help'));
      return;
    }
    const filings = (snapshot.equity_filings || []).filter(
      (f) => /^\d{14}$/.test(f.rcept_no || '') && /^\d{8}$/.test(f.received || '')
    ).slice(0, 30);
    status.textContent = (snapshot.equity_window ?
      snapshot.equity_window.start + ' ~ ' + snapshot.equity_window.end : '최근 60일') +
      ' · DART의 비상장(기타법인) 지분증권 발행공시 ' +
      (snapshot.equity_filings || []).length + '건 확인. IPO 신청·승인·공모 확정과는 다릅니다.';
    if (filings.length === 0) {
      root.appendChild(node('p', '조회 조건에 해당하는 공시가 없습니다.', 'help'));
      return;
    }
    filings.forEach((f) => {
      const item = node('div', undefined, 'dart-ipo-item');
      const summary = node('div', undefined, 'dart-ipo-title');
      summary.appendChild(node('strong', f.name || '회사명 미확인'));
      summary.appendChild(node('span', formatDate(f.received) + ' · 발행공시 확인 / IPO 여부 미확인', 'dart-ipo-date'));
      const detail = node('div', f.report || '지분증권 발행 관련', 'dart-ipo-report');
      const a = node('a', '공시 원문 ↗', 'btn');
      a.href = 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=' + f.rcept_no;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      item.append(summary, detail, a);
      root.appendChild(item);
    });
  }

  function renderStatus() {
    const status = el('dartStatus');
    if (!snapshot || snapshot.status !== 'ok') {
      status.textContent = 'OpenDART 연결 대기 · 검증된 데이터 없음';
      return;
    }
    const updated = Date.parse(snapshot.updated_at || '');
    const stale = !Number.isFinite(updated) || Date.now() - updated > 10 * 86400000;
    status.textContent = 'OpenDART 스냅샷 ' +
      (Number.isFinite(updated) ? new Date(updated).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '일자 미확인') +
      (stale ? ' · 갱신 지연' : ' · 수집 완료');
  }

  async function load() {
    try {
      // Static JSON snapshot comes from Actions; no API credentials are sent from the client.
      const response = await fetch('./data/opendart.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.schema !== 1 || !['ok', 'not_configured'].includes(data.status) ||
          !Array.isArray(data.financials) || !Array.isArray(data.equity_filings)) {
        throw new Error('Unexpected snapshot format');
      }
      snapshot = data;
    } catch (error) {
      snapshot = null;
      el('dartStatus').textContent = '스냅샷 다운로드 실패 · 원천 공시 직접 확인 필요';
    }
    renderStatus();
    renderFinancial();
    renderFilings();
  }

  const select = el('dartCompany');
  targetNames.forEach((name) => {
    const option = node('option', name);
    option.value = name;
    select.appendChild(option);
  });
  select.addEventListener('change', renderFinancial);
  load();
})();
