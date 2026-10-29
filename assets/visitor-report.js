(() => {
  'use strict';
  const status=document.getElementById('report-status');
  if(!status)return;
  const endpoint=(location.origin==='https://stargate.stargate8225.workers.dev'?'':'https://stargate.stargate8225.workers.dev')+'/api/analytics/get_site_visit_summary';
  async function load(){
    status.textContent='방문 통계를 확인하고 있습니다.';
    try{
      const response=await fetch(endpoint,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_days:30}),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('VISIT_HTTP');
      const data=await response.json();
      if(data.source!=='cloudflare'||!Number.isFinite(data.today)||!Number.isFinite(data.total))throw new Error('VISIT_INVALID');
      document.getElementById('report-today').textContent=data.today.toLocaleString('ko-KR');
      document.getElementById('report-total').textContent=data.total.toLocaleString('ko-KR');
      status.textContent='공개 집계 · '+new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date())+' 한국시간 확인';
    }catch(_){
      document.getElementById('report-today').textContent='—';document.getElementById('report-total').textContent='—';
      status.textContent='방문 통계 연결에 실패했습니다. 새로고침해 주세요.';
    }
  }
  document.getElementById('refresh')?.addEventListener('click',load);load();
})();
