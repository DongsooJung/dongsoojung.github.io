(() => {
  'use strict';
  const root = document.querySelector('[data-visitor-regions]');
  if (!root) return;
  const origin = 'https://stargate.stargate8225.workers.dev';
  const endpoint = (location.origin === origin ? '' : origin) + '/api/analytics/get_site_region_stats';
  const status = root.querySelector('[data-region-status]');
  const list = root.querySelector('[data-region-list]');
  const daysLabel = root.querySelector('[data-region-days]');
  const fmt = value => Number(value).toLocaleString('ko-KR');
  const koRegions = {Seoul:'서울',Busan:'부산',Daegu:'대구',Incheon:'인천',Gwangju:'광주',Daejeon:'대전',Ulsan:'울산',Sejong:'세종',Gyeonggi:'경기','Gyeonggi-do':'경기',Gangwon:'강원','Gangwon-do':'강원','North Chungcheong':'충북','South Chungcheong':'충남','North Jeolla':'전북','South Jeolla':'전남','North Gyeongsang':'경북','South Gyeongsang':'경남',Jeju:'제주','Jeju-do':'제주'};
  const names = new Intl.DisplayNames(['ko'], {type:'region'});
  let generation = 0;
  async function load() {
    const ticket = ++generation;
    const days = Number(document.getElementById('period-days')?.value) === 90 ? 90 : 30;
    daysLabel.textContent = days;
    list.replaceChildren();
    status.textContent = '지역별 클릭 통계를 불러오는 중입니다.';
    try {
      const response = await fetch(endpoint, {method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_days:days}),signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('REGIONS_HTTP');
      const data = await response.json();
      if (data.source !== 'cloudflare' || !Array.isArray(data.regions) || !Number.isFinite(data.total_clicks) || !Number.isFinite(data.located_clicks) || !Number.isFinite(data.unknown_clicks)) throw new Error('REGIONS_INVALID');
      if (ticket !== generation) return;
      const rows = data.regions.filter(row => /^[A-Z]{2}$/.test(row.country) && Number.isFinite(row.clicks) && row.clicks > 0 && Number.isFinite(row.share) && row.share >= 0 && row.share <= 100).slice(0,10);
      const started = new Date(data.started_at);
      const startedText = Number.isFinite(started.getTime()) ? new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(started) + ' 한국시간' : '배포 이후';
      status.textContent = `전체 ${fmt(data.total_clicks)}회 중 지역 확인 ${fmt(data.located_clicks)}회 · 미확인 ${fmt(data.unknown_clicks)}회. 지역 수집 시작: ${startedText}. ` + (rows.length ? '비중은 미확인을 포함한 전체 클릭 기준입니다.' : '지역이 확인된 클릭이 아직 없습니다. 기존 기록의 지역은 소급 복원되지 않습니다.');
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
    } catch (_) {
      if (ticket !== generation) return;
      list.replaceChildren();status.textContent = '지역별 클릭 통계에 연결하지 못했습니다. 잠시 후 다시 확인해 주세요.';
    }
  }
  document.getElementById('period-days')?.addEventListener('change',load);
  document.getElementById('refresh')?.addEventListener('click',load);
  load();
})();
