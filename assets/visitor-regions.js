(() => {
  'use strict';
  const root = document.querySelector('[data-visitor-regions]');
  if (!root) return;
  const origin = 'https://stargate.stargate8225.workers.dev';
  const isAdmin = location.origin === origin && location.pathname.startsWith('/admin/');
  const publicOrigins = new Set(['https://stargateedu.co.kr','https://www.stargateedu.co.kr',origin]);
  const isPublicReport = publicOrigins.has(location.origin) && /^\/visitors(?:\/|\/index\.html)?$/.test(location.pathname);
  if (!isAdmin && !isPublicReport) return;
  const endpoint = isAdmin ? '/api/admin/analytics/get_site_region_stats'
    : (location.origin === origin ? '' : origin) + '/api/analytics/get_site_region_summary';
  const status = root.querySelector('[data-region-status]');
  const list = root.querySelector('[data-region-list]');
  const daysLabel = root.querySelector('[data-region-days]');
  const fmt = value => Number(value).toLocaleString('ko-KR');
  const koRegions = {Seoul:'서울',Busan:'부산',Daegu:'대구',Incheon:'인천',Gwangju:'광주',Daejeon:'대전',Ulsan:'울산',Sejong:'세종',Gyeonggi:'경기','Gyeonggi-do':'경기',Gangwon:'강원','Gangwon-do':'강원','North Chungcheong':'충북','South Chungcheong':'충남','North Jeolla':'전북','South Jeolla':'전남','North Gyeongsang':'경북','South Gyeongsang':'경남',Jeju:'제주','Jeju-do':'제주'};
  const names = new Intl.DisplayNames(['ko'], {type:'region'});
  const mapRoot = root.querySelector('[data-region-map]');
  const mapSummary = root.querySelector('[data-region-map-summary]');
  const mapDetail = root.querySelector('[data-region-map-detail]');
  const aliases = {
    'gyeonggi-do':'Gyeonggi','gangwon-do':'Gangwon','gangwon state':'Gangwon',
    'chungcheongbuk-do':'North Chungcheong','chungcheongnam-do':'South Chungcheong',
    'jeollabuk-do':'North Jeolla','jeonbuk state':'North Jeolla','jeollanam-do':'South Jeolla',
    'gyeongsangbuk-do':'North Gyeongsang','gyeongsangnam-do':'South Gyeongsang','jeju-do':'Jeju',
    'jeju special self-governing province':'Jeju','sejong-si':'Sejong'
  };
  let geometryPromise;
  function resetMap(message) {
    mapRoot?.replaceChildren();
    if (mapSummary) mapSummary.textContent = message;
    if (mapDetail) mapDetail.textContent = '지역을 선택하면 클릭 수를 확인할 수 있습니다.';
  }
  async function renderMap(data, ticket) {
    if (!mapRoot) return;
    try {
      geometryPromise ||= fetch('/assets/korea-region-shapes.json?v=20261029', {credentials:'same-origin',signal:AbortSignal.timeout(10000)})
        .then(response => { if (!response.ok) throw new Error('MAP_HTTP'); return response.json(); })
        .catch(error => {geometryPromise = null;throw error;});
      const geometry = await geometryPromise;
      if (ticket !== generation) return;
      if (!Array.isArray(geometry.regions) || geometry.regions.length !== 17) throw new Error('MAP_INVALID');
      const counts = new Map();
      let domestic = 0;
      for (const row of data.regions) {
        if (row.country !== 'KR' || !Number.isFinite(row.clicks) || row.clicks < 0) continue;
        domestic += row.clicks;
        const value = String(row.region || '').trim().toLowerCase();
        const name = aliases[value] || geometry.regions.find(shape => shape.name.toLowerCase() === value || shape.code.toLowerCase() === value || koRegions[shape.name] === row.region)?.name;
        if (name) counts.set(name, (counts.get(name) || 0) + row.clicks);
      }
      const mapped = [...counts.values()].reduce((sum,n) => sum+n,0);
      const max = Math.max(1,...counts.values());
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns,'svg');
      svg.setAttribute('viewBox',geometry.viewBox);
      svg.setAttribute('role','group');
      svg.setAttribute('aria-label','대한민국 17개 시도 클릭 분포. 지역을 선택하면 상세 수치를 표시합니다.');
      let selected;
      function select(path,shape,n) {
        selected?.removeAttribute('data-selected');selected=path;path.setAttribute('data-selected','true');
        mapDetail.textContent = `${koRegions[shape.name] || shape.name}\n${fmt(n)}회 클릭 · 전체 클릭의 ${data.total_clicks ? (n/data.total_clicks*100).toFixed(1) : '0.0'}%`;
      }
      for (const shape of geometry.regions) {
        const n = counts.get(shape.name) || 0;
        const path = document.createElementNS(ns,'path');
        path.setAttribute('d',shape.path);path.setAttribute('fill-rule','evenodd');
        path.setAttribute('fill',n ? `hsl(204 68% ${74-42*(n/max)}%)` : 'var(--line,#d7e0ed)');
        path.setAttribute('tabindex','0');path.setAttribute('role','button');
        path.setAttribute('data-region',shape.name);
        path.setAttribute('aria-label',`${koRegions[shape.name] || shape.name}: ${fmt(n)}회 클릭`);
        const title = document.createElementNS(ns,'title');title.textContent = `${koRegions[shape.name] || shape.name} · ${fmt(n)}회 클릭`;path.append(title);
        for (const event of ['click','focus','mouseenter']) path.addEventListener(event,()=>select(path,shape,n));
        path.addEventListener('keydown',event=>{if (['Enter',' '].includes(event.key)){event.preventDefault();select(path,shape,n);}});
        svg.append(path);
      }
      mapRoot.replaceChildren(svg);
      mapSummary.textContent = `국내 ${fmt(domestic)}회 · 지도 표시 ${fmt(mapped)}회 · 국내 시도 미확인 ${fmt(domestic-mapped)}회 · 해외 ${fmt(data.located_clicks-domestic)}회`;
    } catch (_) {
      if (ticket !== generation) return;
      mapRoot.replaceChildren();mapSummary.textContent = '지도를 불러오지 못했습니다. 아래 지역별 순위는 계속 확인할 수 있습니다.';
    }
  }
  let generation = 0;
  async function load() {
    const ticket = ++generation;
    const selectedDays = Number(document.getElementById('period-days')?.value);
    const days = [7,30,90].includes(selectedDays) ? selectedDays : 30;
    daysLabel.textContent = days;
    list.replaceChildren();
    resetMap('지역 통계를 확인하고 있습니다.');
    status.textContent = '지역별 클릭 통계를 불러오는 중입니다.';
    try {
      const response = await fetch(endpoint, {method:'POST',credentials:isAdmin?'same-origin':'omit',redirect:isAdmin?'manual':'follow',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_days:days}),signal:AbortSignal.timeout(10000)});
      if (isAdmin && ([401,403,302,303].includes(response.status) || response.type === 'opaqueredirect' || response.redirected || response.headers?.get('content-type')?.includes('text/html'))) throw new Error('ACCESS_LOGIN_REQUIRED');
      if (!response.ok) throw new Error('REGIONS_HTTP');
      const data = await response.json();
      if (data.source !== 'cloudflare' || !Array.isArray(data.regions) || !Number.isFinite(data.total_clicks) || !Number.isFinite(data.located_clicks) || !Number.isFinite(data.unknown_clicks)) throw new Error('REGIONS_INVALID');
      if (ticket !== generation) return;
      const rows = data.regions.filter(row => /^[A-Z]{2}$/.test(row.country) && Number.isFinite(row.clicks) && row.clicks > 0 && Number.isFinite(row.share) && row.share >= 0 && row.share <= 100).slice(0,10);
      const started = new Date(data.started_at);
      const startedText = Number.isFinite(started.getTime()) ? new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(started) + ' 한국시간' : '배포 이후';
      status.textContent = `전체 ${fmt(data.total_clicks)}회 중 지역 확인 ${fmt(data.located_clicks)}회 · 미확인 ${fmt(data.unknown_clicks)}회. 지역 수집 시작: ${startedText}. ` + (rows.length ? '비중은 미확인을 포함한 전체 클릭 기준입니다.' : '지역이 확인된 클릭이 아직 없습니다. 기존 기록의 지역은 소급 복원되지 않습니다.');
      await renderMap(data,ticket);
      if (ticket !== generation) return;
      rows.forEach((row,index) => {
        const item = document.createElement('li');
        const line = document.createElement('div'); line.className = 'visitor-region-line';
        const title = document.createElement('strong');
        const region = row.country === 'KR' ? (koRegions[row.region] || row.region) : row.region;
        title.textContent = `${index+1}. ${names.of(row.country) || row.country}${region ? ' · '+region : ' · 지역 미확인'}`;
        const value = document.createElement('span'); value.textContent = `${fmt(row.clicks)}회 · ${row.share}%`;
        const track = document.createElement('div');track.className = 'visitor-region-track';track.setAttribute('aria-hidden','true');
        const bar = document.createElement('i');bar.style.width = row.share+'%';track.append(bar);
        line.append(title,value);item.append(line,track);list.append(item);
      });
    } catch (error) {
      if (ticket !== generation) return;
      resetMap(isAdmin ? '관리자 인증 후 지도를 확인할 수 있습니다.' : '지역 통계를 불러오지 못했습니다. 새로고침해 주세요.');
      list.replaceChildren();status.textContent = error.message === 'ACCESS_LOGIN_REQUIRED' ? '대표님 관리자 로그인이 필요합니다. 다시 로그인한 뒤 새로고침해 주세요.' : '지역별 클릭 통계에 연결하지 못했습니다. 잠시 후 다시 확인해 주세요.';
    }
  }
  document.getElementById('period-days')?.addEventListener('change',load);
  document.getElementById('refresh')?.addEventListener('click',load);
  load();
})();


