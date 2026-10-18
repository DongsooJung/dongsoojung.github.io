(() => {
  'use strict';
  const $=id=>document.getElementById(id),fmt=n=>Number(n||0).toLocaleString('ko-KR');let pages=[],generation=0;
  function clear(){pages=[];['views','visitors','clicks','crm-views'].forEach(id=>$(id).textContent='—');['chart','daily','pages'].forEach(id=>$(id).replaceChildren());$('empty').hidden=true;}
  function row(values){const tr=document.createElement('tr');values.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});return tr;}
  function renderPages(){const query=$('search').value.toLowerCase().trim(),filtered=pages.filter(v=>v.page_path.toLowerCase().includes(query));$('pages').replaceChildren(...filtered.map(v=>row([v.page_path,fmt(v.page_views),fmt(v.visitors),fmt(v.clicks)])));$('empty').hidden=filtered.length>0;}
  async function load(){
    const epoch=++generation;clear();$('refresh').disabled=true;$('login').hidden=true;$('status').className='';$('status').textContent='실제 집계 데이터를 불러오는 중…';
    try{
      const response=await fetch('/api/sms/analytics?days='+$('days').value,{cache:'no-store',credentials:'same-origin',redirect:'manual'});
      if([401,403].includes(response.status)||response.type==='opaqueredirect'){const error=new Error('관리자 로그인이 필요합니다. 로그인 후 이 페이지로 돌아오세요.');error.auth=true;throw error;}
      const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.message||'조회수를 불러오지 못했습니다.');if(epoch!==generation)return;
      if(data.source!=='cloudflare')throw new Error('집계 출처를 확인하지 못했습니다.');
      pages=(data.pages||[]).sort((a,b)=>b.page_views-a.page_views);$('views').textContent=fmt(data.page_views);$('visitors').textContent=fmt(data.visitors);$('clicks').textContent=fmt(data.clicks);$('crm-views').textContent=fmt(pages.filter(v=>v.page_path==='/sms'||v.page_path.startsWith('/sms/')).reduce((sum,v)=>sum+Number(v.page_views||0),0));renderPages();
      const daily=data.daily||[],max=Math.max(1,...daily.map(v=>v.page_views));
      $('chart').replaceChildren(...daily.map(v=>{const col=document.createElement('div');col.className='column';col.title=v.date+' · '+fmt(v.page_views)+'회';const bar=document.createElement('div');bar.className='bar';bar.style.height=Math.max(2,150*v.page_views/max)+'px';const day=document.createElement('span');day.className='day';day.textContent=v.date.slice(5);col.append(bar,day);return col;}));
      $('daily').replaceChildren(...[...daily].reverse().map(v=>row([v.date,fmt(v.page_views),fmt(v.visitors),fmt(v.clicks)])));
      $('status').textContent='정상 연결 · '+new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' 한국시간';
    }catch(error){if(epoch!==generation)return;clear();$('status').textContent=error.message;$('status').className='error';$('login').hidden=!error.auth;}finally{if(epoch===generation)$('refresh').disabled=false;}
  }
  $('search').addEventListener('input',renderPages);$('days').addEventListener('change',load);$('refresh').addEventListener('click',load);window.addEventListener('pageshow',load);
})();
