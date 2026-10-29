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
  const mapRoot=root.querySelector('[data-region-map]');
  const mapSummary=root.querySelector('[data-region-map-summary]');
  const mapDetail=root.querySelector('[data-region-map-detail]');
  const provinceSelect=root.querySelector('[data-province-select]');
  const districtSelect=root.querySelector('[data-district-select]');
  const hourlyRoot=root.querySelector('[data-hourly-chart]');
  const hourlyStatus=root.querySelector('[data-hourly-status]');
  let geometryPromise,generation=0,lastData=null;
  const pathCache=new Map();
  function decodeRing(encoded){let cursor=0,x=0,y=0;const points=[];function read(){let value=0,shift=0,chunk;do{if(cursor>=encoded.length||shift>30)throw new Error('MAP_ENCODING');chunk=encoded.charCodeAt(cursor++)-63;value|=(chunk&31)<<shift;shift+=5;}while(chunk>=32);return value&1?~(value>>>1):value>>>1;}while(cursor<encoded.length){x+=read();y+=read();points.push([x/1e5,y/1e5]);}return points;}
  const project=([x,y])=>[(x-124.4)*100,(38.9-y)*125];
  function pathFor(district){if(!pathCache.has(district.code))pathCache.set(district.code,district.rings.map(poly=>poly.map(ring=>'M'+decodeRing(ring).map(point=>project(point).map(n=>n.toFixed(2)).join(',')).join('L')+'Z').join('')).join(''));return pathCache.get(district.code);}
  function mapBox(shapes){if(!shapes.length)return '0 0 780 740';const boxes=shapes.map(d=>d.bbox);const minX=Math.min(...boxes.map(b=>b[0])),minY=Math.min(...boxes.map(b=>b[1])),maxX=Math.max(...boxes.map(b=>b[2])),maxY=Math.max(...boxes.map(b=>b[3]));const [x,y]=project([minX,maxY]);const width=(maxX-minX)*100,height=(maxY-minY)*125,pad=Math.max(width,height)*.07;return `${x-pad} ${y-pad} ${width+pad*2} ${height+pad*2}`;}
  function resetMap(message){mapRoot?.replaceChildren();if(mapSummary)mapSummary.textContent=message;if(mapDetail)mapDetail.textContent='시도 또는 시군구를 선택하면 지도를 확대하고 클릭 수를 확인할 수 있습니다.';hourlyRoot?.replaceChildren();if(hourlyStatus)hourlyStatus.textContent='새로 수집된 클릭의 시간대만 집계합니다.';}
  function option(value,label){const element=document.createElement('option');element.value=value;element.textContent=label;return element;}
  function renderHours(data){if(!hourlyRoot)return;const hours=new Map((Array.isArray(data.hourly)?data.hourly:[]).filter(row=>Number.isInteger(row.hour)&&row.hour>=0&&row.hour<24&&Number.isFinite(row.clicks)&&row.clicks>=0).map(row=>[row.hour,row.clicks]));const max=Math.max(1,...hours.values());hourlyRoot.replaceChildren(...Array.from({length:24},(_,hour)=>{const n=hours.get(hour)||0;const column=document.createElement('div');column.className='visitor-hour-column';const bar=document.createElement('div');bar.className='visitor-hour-bar';bar.style.height=Math.max(2,n/max*90)+'px';bar.title=`${hour}시 · ${fmt(n)}회 클릭`;bar.setAttribute('aria-label',bar.title);const label=document.createElement('small');label.textContent=hour%3===0?String(hour).padStart(2,'0'):'';column.append(bar,label);return column;}));const total=[...hours.values()].reduce((sum,n)=>sum+n,0);hourlyStatus.textContent=total?`한국시간 기준 · 새로 수집된 ${fmt(total)}회 클릭의 시간대 집계. 이전 기록은 시간대 복원이 불가능합니다.`:'시간대 집계가 시작된 이후의 클릭 기록이 아직 없습니다.';}
  async function renderMap(data,ticket){
    if(!mapRoot)return;
    try{
      geometryPromise ||= fetch('/assets/korea-district-boundaries.json?v=20261001',{credentials:'same-origin',signal:AbortSignal.timeout(10000)}).then(response=>{if(!response.ok)throw new Error('MAP_HTTP');return response.json();}).catch(error=>{geometryPromise=null;throw error;});
      const geometry=await geometryPromise;if(ticket!==generation)return;
      if(geometry.encoding!=='delta-varint-1e5'||!Array.isArray(geometry.districts)||geometry.districts.length<200)throw new Error('MAP_INVALID');
      const counts=new Map((Array.isArray(data.districts)?data.districts:[]).filter(row=>/^\d{5}$/.test(row.code)&&Number.isFinite(row.clicks)&&row.clicks>=0).map(row=>[row.code,row.clicks]));
      const provinces=[...new Map(geometry.districts.map(d=>[d.province_code,d.province_name])).entries()];
      const province=provinceSelect?.value||'all';
      if(provinceSelect){provinceSelect.replaceChildren(option('all','전국 시군구'),...provinces.map(([code,name])=>option(code,name)));provinceSelect.value=provinces.some(([code])=>code===province)?province:'all';}
      const shapes=geometry.districts.filter(d=>(provinceSelect?.value||'all')==='all'||d.province_code===provinceSelect.value);
      const chosen=districtSelect?.value||'all';
      if(districtSelect){districtSelect.replaceChildren(option('all','시군구 선택'),...shapes.map(d=>option(d.code,d.province_name+' '+d.name)));districtSelect.value=shapes.some(d=>d.code===chosen)?chosen:'all';}
      const max=Math.max(1,...shapes.map(d=>counts.get(d.code)||0));const ns='http://www.w3.org/2000/svg';
      const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',mapBox(shapes));svg.setAttribute('role','group');svg.setAttribute('aria-label',`대한민국 ${shapes.length}개 시군구의 IP 추정 클릭 분포`);
      let selected;
      function select(path,d,n){selected?.removeAttribute('data-selected');selected=path;path.setAttribute('data-selected','true');mapDetail.textContent=`${d.province_name} ${d.name}\n${fmt(n)}회 클릭 · 전체 클릭의 ${data.total_clicks?(n/data.total_clicks*100).toFixed(1):'0.0'}%\nIP 추정 위치를 시군구 경계와 대조한 값입니다.`;}
      const paths=new Map();
      for(const d of shapes){const n=counts.get(d.code)||0;const path=document.createElementNS(ns,'path');path.setAttribute('d',pathFor(d));path.setAttribute('fill-rule','evenodd');path.setAttribute('fill',n?`hsl(204 68% ${74-42*n/max}%)`:'var(--line,#d7e0ed)');path.setAttribute('tabindex','0');path.setAttribute('role','button');path.setAttribute('data-district-code',d.code);path.setAttribute('aria-label',`${d.province_name} ${d.name}: ${fmt(n)}회 클릭`);const title=document.createElementNS(ns,'title');title.textContent=`${d.province_name} ${d.name} · ${fmt(n)}회 클릭`;path.append(title);for(const event of ['click','focus','mouseenter'])path.addEventListener(event,()=>select(path,d,n));path.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select(path,d,n);}});paths.set(d.code,path);svg.append(path);}
      const chosenDistrict=shapes.find(d=>d.code===districtSelect?.value);
      if(chosenDistrict){svg.setAttribute('viewBox',mapBox([chosenDistrict]));select(paths.get(chosenDistrict.code),chosenDistrict,counts.get(chosenDistrict.code)||0);}
      mapRoot.replaceChildren(svg);
      const resolved=[...counts.values()].reduce((sum,n)=>sum+n,0);const foreign=(Array.isArray(data.regions)?data.regions:[]).filter(row=>row.country!=='KR').reduce((sum,row)=>sum+(Number(row.clicks)||0),0);
      mapSummary.textContent=`시군구 확인 ${fmt(resolved)}회 · 미확인·해외 ${fmt(Math.max(0,data.total_clicks-resolved))}회 · 해외 확인 ${fmt(foreign)}회. 시도 선택으로 확대할 수 있습니다.`;
    }catch(_){if(ticket!==generation)return;mapRoot.replaceChildren();mapSummary.textContent='시군구 지도를 불러오지 못했습니다. 아래 집계는 계속 확인할 수 있습니다.';}
  }
  async function load(){
    const ticket=++generation;lastData=null;const selectedDays=Number(document.getElementById('period-days')?.value),days=[7,30,90].includes(selectedDays)?selectedDays:30;daysLabel.textContent=days;list.replaceChildren();resetMap('시군구별 클릭 통계를 확인하고 있습니다.');status.textContent='시군구별 클릭 통계를 불러오는 중입니다.';
    try{
      const response=await fetch(endpoint,{method:'POST',credentials:isAdmin?'same-origin':'omit',redirect:isAdmin?'manual':'follow',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_days:days}),signal:AbortSignal.timeout(10000)});
      if(isAdmin&&([401,403,302,303].includes(response.status)||response.type==='opaqueredirect'||response.redirected||response.headers?.get('content-type')?.includes('text/html')))throw new Error('ACCESS_LOGIN_REQUIRED');
      if(!response.ok)throw new Error('DISTRICTS_HTTP');const data=await response.json();if(data.source!=='cloudflare'||!Number.isFinite(data.total_clicks))throw new Error('DISTRICTS_INVALID');if(ticket!==generation)return;
      const rows=(Array.isArray(data.districts)?data.districts:[]).filter(row=>/^\d{5}$/.test(row.code)&&Number.isFinite(row.clicks)&&row.clicks>0&&Number.isFinite(row.share)&&row.share>=0&&row.share<=100).sort((a,b)=>b.clicks-a.clicks||a.code.localeCompare(b.code));
      const resolved=rows.reduce((sum,row)=>sum+row.clicks,0);const started=new Date(data.district_started_at);const startedText=Number.isFinite(started.getTime())?new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(started)+' 한국시간':'이번 업데이트 이후';
      status.textContent=`전체 ${fmt(data.total_clicks)}회 중 시군구 확인 ${fmt(resolved)}회 · 미확인·해외 ${fmt(Math.max(0,data.total_clicks-resolved))}회. 시군구 집계 시작: ${startedText}. `+(rows.length?'비중은 전체 클릭 기준입니다.':'확인된 시군구 클릭이 아직 없습니다. 기존 기록의 시군구는 소급 복원되지 않습니다.');
      lastData=data;await renderMap(data,ticket);if(ticket!==generation)return;renderHours(data);
      rows.slice(0,30).forEach((row,index)=>{const item=document.createElement('li'),line=document.createElement('div');line.className='visitor-region-line';const title=document.createElement('strong');title.textContent=`${index+1}. ${row.province_name} ${row.name}`;const value=document.createElement('span');value.textContent=`${fmt(row.clicks)}회 · ${row.share}%`;const track=document.createElement('div');track.className='visitor-region-track';track.setAttribute('aria-hidden','true');const bar=document.createElement('i');bar.style.width=row.share+'%';track.append(bar);line.append(title,value);item.append(line,track);list.append(item);});
    }catch(error){if(ticket!==generation)return;lastData=null;resetMap(isAdmin?'관리자 인증 후 지도를 확인할 수 있습니다.':'시군구 통계 연결에 실패했습니다. 새로고침해 주세요.');list.replaceChildren();status.textContent=error.message==='ACCESS_LOGIN_REQUIRED'?'대표님 관리자 로그인이 필요합니다. 다시 로그인한 뒤 새로고침해 주세요.':'시군구별 클릭 통계에 연결하지 못했습니다. 잠시 후 다시 확인해 주세요.';}
  }
  provinceSelect?.addEventListener('change',()=>{if(!lastData)return;if(districtSelect)districtSelect.value='all';renderMap(lastData,generation);});
  districtSelect?.addEventListener('change',()=>{if(lastData)renderMap(lastData,generation);});
  document.getElementById('period-days')?.addEventListener('change',load);document.getElementById('refresh')?.addEventListener('click',load);load();
})();
