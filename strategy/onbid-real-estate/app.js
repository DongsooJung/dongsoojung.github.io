const $ = (id) => document.getElementById(id);
const API_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? '/api/onbid-real-estate'
  : 'https://stargate-onbid-api.vercel.app/api/onbid-real-estate';
const state = { pageNo: 1, pageSize: 100, totalCount: 0, items: [], loading: false };
const money = new Intl.NumberFormat('ko-KR');
const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[char]);
}
function formatMoney(value) { return Number(value) > 0 ? `${money.format(Number(value))}원` : '—'; }
function formatArea(item) {
  const parts=[]; if(item.landArea) parts.push(`토지 ${number.format(item.landArea)}㎡`); if(item.buildingArea) parts.push(`건물 ${number.format(item.buildingArea)}㎡`); return parts.join('<br>')||'—';
}
function formatDate(value, withTime=true) {
  const digits=String(value||'').replace(/\D/g,''); if(digits.length<8) return value||'—'; const date=`${digits.slice(0,4)}.${digits.slice(4,6)}.${digits.slice(6,8)}`; return withTime&&digits.length>=12?`${date} ${digits.slice(8,10)}:${digits.slice(10,12)}`:date;
}
function apiError(payload,response) {
  if(payload?.error==='api_key_missing') return '배포 환경에 공공데이터 인증키 연결이 필요합니다.';
  if(['20','30','31'].includes(String(payload?.error))) return '이 인증키에는 해당 온비드 API 이용 권한이 없습니다. 활용신청 상태를 확인해 주세요.';
  if(['22','23'].includes(String(payload?.error))) return '온비드 API 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.';
  return payload?.message||`데이터 조회 실패 (HTTP ${response.status})`;
}
function setStatus(mode,title,note) { $('status').className=`status ${mode||''}`; $('status-title').textContent=title; $('status-note').textContent=note; }
function currentFilters() { return {pageNo:state.pageNo,prptDivCd:$('property-type').value,pvctTrgtYn:$('private-contract').value,lctnSdnm:$('region').value,onbidCltrNm:$('keyword').value.trim()}; }
function queryString(values) { const params=new URLSearchParams({action:'list'}); for(const [key,value] of Object.entries(values)) if(value!=='') params.set(key,value); return params.toString(); }

function renderRows() {
  $('rows').innerHTML=state.items.map((item,index)=>{
    const minimum=item.minimumBidAmount?formatMoney(item.minimumBidAmount):escapeHtml(item.minimumBidText||'—');
    const ratio=item.appraisalRatio?`<div class="sub">감정가의 ${number.format(item.appraisalRatio)}%</div>`:'';
    return `<tr><td>${money.format((state.pageNo-1)*state.pageSize+index+1)}</td><td><div class="row-title">${escapeHtml(item.title||'제목 없음')}</div><div class="sub">${escapeHtml(item.address||[item.province,item.district,item.neighborhood].filter(Boolean).join(' '))}</div><div class="sub">${escapeHtml(item.id)}</div></td><td><span class="pill">${escapeHtml(item.propertyType||'부동산')}</span><div class="sub">${escapeHtml([item.disposition,item.status,item.category].filter(Boolean).join(' · '))}</div></td><td class="amount">${formatMoney(item.appraisalAmount)}</td><td class="amount">${minimum}${ratio}</td><td class="amount">${formatArea(item)}</td><td class="amount">${formatDate(item.bidEnd)}</td><td><button class="detail-button" type="button" data-detail="${escapeHtml(item.id)}" data-condition="${escapeHtml(item.conditionNo)}">상세 보기</button></td></tr>`;
  }).join('');
  $('empty').hidden=state.items.length>0;
  $('rows').querySelectorAll('[data-detail]').forEach((button)=>button.addEventListener('click',()=>openDetail(button.dataset.detail,button.dataset.condition)));
}
function renderSummary() {
  const ratios=state.items.map((item)=>Number(item.appraisalRatio)).filter((value)=>value>0); const average=ratios.length?ratios.reduce((sum,value)=>sum+value,0)/ratios.length:0; const now=Date.now(); const week=7*86400000;
  const endingSoon=state.items.filter((item)=>{const d=String(item.bidEnd||'').replace(/\D/g,'');if(d.length<8)return false;const end=new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${d.slice(8,10)||'23'}:${d.slice(10,12)||'59'}:00+09:00`).getTime();return end>=now&&end<=now+week}).length;
  $('total-count').textContent=`${money.format(state.totalCount)}건`; $('page-count').textContent=`${money.format(state.items.length)}건`; $('average-ratio').textContent=average?`${number.format(average)}%`:'—'; $('ending-soon').textContent=`${money.format(endingSoon)}건`;
  const start=state.items.length?(state.pageNo-1)*state.pageSize+1:0; const end=(state.pageNo-1)*state.pageSize+state.items.length; $('range').textContent=`${money.format(start)}–${money.format(end)} / ${money.format(state.totalCount)}건 · ${state.pageNo}페이지`;
  $('prev').disabled=state.loading||state.pageNo<=1; $('next').disabled=state.loading||end>=state.totalCount; $('export').disabled=!state.items.length;
}
async function loadPage() {
  if(state.loading)return; state.loading=true; $('prev').disabled=$('next').disabled=true; setStatus('','온비드 100건을 조회하고 있습니다.','공식 목록 API 응답을 기다리는 중입니다.');
  try {
    const response=await fetch(`${API_URL}?${queryString(currentFilters())}`,{cache:'no-store'}); const payload=await response.json().catch(()=>({})); if(!response.ok||!payload.ok)throw new Error(apiError(payload,response));
    state.pageNo=payload.pageNo||state.pageNo; state.pageSize=payload.pageSize||100; state.totalCount=payload.totalCount||0; state.items=Array.isArray(payload.items)?payload.items:[]; renderRows(); renderSummary();
    $('updated-at').textContent=`최근 조회 ${new Date(payload.updatedAt).toLocaleString('ko-KR')} · ${payload.source}`; setStatus('live','온비드 공식 데이터 연결됨',`${money.format(state.items.length)}건을 불러왔습니다. 상세정보는 물건을 선택할 때 조회합니다.`);
  } catch(error) { state.items=[];state.totalCount=0;renderRows();renderSummary();setStatus('error','온비드 데이터를 불러오지 못했습니다.',error.message); }
  finally { state.loading=false;renderSummary(); }
}
function detailText(title,text){return text?`<section class="detail-section"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></section>`:''}
function renderDetail(item) {
  if(!item)return '<p>상세정보가 없습니다.</p>';
  const image=item.photos?.[0]?`<img class="photo" src="${escapeHtml(item.photos[0])}" alt="${escapeHtml(item.title)}" referrerpolicy="no-referrer">`:'';
  const areas=item.areaBreakdown?.length?`<section class="detail-section"><h3>면적 상세</h3><ul>${item.areaBreakdown.map((area)=>`<li>${escapeHtml([area.type,area.area,area.share,area.note].filter(Boolean).join(' · '))}</li>`).join('')}</ul></section>`:'';
  const appraisals=item.appraisals?.length?`<section class="detail-section"><h3>감정평가</h3><ul>${item.appraisals.map((entry)=>`<li>${escapeHtml(entry.organization||'감정평가기관')} · ${formatDate(entry.date,false)} · ${formatMoney(entry.amount)}${entry.reportUrl?` · <a href="${escapeHtml(entry.reportUrl)}" target="_blank" rel="noopener">평가서</a>`:''}</li>`).join('')}</ul></section>`:'';
  const corrections=item.corrections?.length?`<section class="detail-section"><h3>정정 내역</h3><ul>${item.corrections.map((entry)=>`<li>${formatDate(entry.date,false)} · ${escapeHtml(entry.field)} — ${escapeHtml(entry.after||entry.before)}</li>`).join('')}</ul></section>`:'';
  return `<span class="pill">${escapeHtml(item.propertyType||'부동산')} · ${escapeHtml(item.status||'상태 확인')}</span><h2 id="detail-title">${escapeHtml(item.title||'온비드 부동산')}</h2><p class="sub">${escapeHtml(item.roadAddress||item.address)}<br>${escapeHtml(item.id)}</p>${image}<div class="detail-stats"><div class="detail-stat"><span>감정평가금액</span><b>${formatMoney(item.appraisalAmount)}</b></div><div class="detail-stat"><span>최저입찰가격</span><b>${item.minimumBidAmount?formatMoney(item.minimumBidAmount):escapeHtml(item.minimumBidText||'—')}</b></div><div class="detail-stat"><span>유찰횟수</span><b>${money.format(item.failedCount||0)}회</b></div></div><section class="detail-section"><h3>입찰·물건 정보</h3><dl class="facts"><dt>입찰기간</dt><dd>${formatDate(item.bidStart)} – ${formatDate(item.bidEnd)}</dd><dt>입찰방식</dt><dd>${escapeHtml([item.competitionMethod,item.bidMethod,item.bidDivision].filter(Boolean).join(' · ')||'—')}</dd><dt>처분방식</dt><dd>${escapeHtml([item.disposition,item.rentMethod,item.rentPeriod].filter(Boolean).join(' · ')||'—')}</dd><dt>면적</dt><dd>${formatArea(item)}</dd><dt>공고기관</dt><dd>${escapeHtml(item.organization||'—')}</dd><dt>배분요구종기</dt><dd>${escapeHtml(item.distributionDue||'—')}</dd></dl></section>${areas}${appraisals}${detailText('위치 및 부근 현황',item.locationOverview)}${detailText('이용 현황',item.useOverview)}${detailText('부대 조건',item.additionalConditions)}${detailText('매수인 자격',item.buyerQualification)}${detailText('낙찰 후 인도·인수 책임',item.deliveryResponsibility)}${detailText('유의사항',item.cautions)}${detailText('기타 정보',item.otherInformation)}${corrections}`;
}
async function openDetail(id,conditionNo) {
  $('detail-backdrop').hidden=false;document.body.style.overflow='hidden';$('detail-content').innerHTML='<p><span class="loading"></span> 상세정보를 불러오고 있습니다.</p>';
  try { const params=new URLSearchParams({action:'detail',cltrMngNo:id});if(conditionNo)params.set('pbctCdtnNo',conditionNo);const response=await fetch(`${API_URL}?${params}`,{cache:'no-store'});const payload=await response.json().catch(()=>({}));if(!response.ok||!payload.ok)throw new Error(apiError(payload,response));$('detail-content').innerHTML=renderDetail(payload.item); }
  catch(error){$('detail-content').innerHTML=`<h2 id="detail-title">상세정보 조회 실패</h2><p>${escapeHtml(error.message)}</p>`}
}
function closeDetail(){$('detail-backdrop').hidden=true;document.body.style.overflow=''}
function exportCsv(){const headers=['번호','물건관리번호','물건명','재산유형','상태','소재지','감정평가금액','최저입찰가격','토지면적㎡','건물면적㎡','입찰시작','입찰종료'];const rows=state.items.map((item,index)=>[(state.pageNo-1)*state.pageSize+index+1,item.id,item.title,item.propertyType,item.status,item.address,item.appraisalAmount,item.minimumBidAmount||item.minimumBidText,item.landArea,item.buildingArea,item.bidStart,item.bidEnd]);const csv=[headers,...rows].map((row)=>row.map((value)=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));link.download=`onbid-real-estate-page-${state.pageNo}.csv`;link.click();URL.revokeObjectURL(link.href)}
$('search-form').addEventListener('submit',(event)=>{event.preventDefault();state.pageNo=1;loadPage()});$('prev').addEventListener('click',()=>{if(state.pageNo>1){state.pageNo-=1;loadPage();window.scrollTo({top:480,behavior:'smooth'})}});$('next').addEventListener('click',()=>{state.pageNo+=1;loadPage();window.scrollTo({top:480,behavior:'smooth'})});$('export').addEventListener('click',exportCsv);$('detail-close').addEventListener('click',closeDetail);$('detail-backdrop').addEventListener('click',(event)=>{if(event.target===$('detail-backdrop'))closeDetail()});document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&!$('detail-backdrop').hidden)closeDetail()});
loadPage();
