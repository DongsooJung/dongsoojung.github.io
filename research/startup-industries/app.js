(() => {
 'use strict';
 const $=id=>document.getElementById(id), fmt=n=>n.toLocaleString('ko-KR');
 let data, type='corporation';
 const labels={corporation:'법인',personal:'개인사업자',combined:'법인+개인사업자 합계'};
 function records(){if(type!=='combined')return data.datasets[type];return data.datasets.corporation.map(a=>{const b=data.datasets.personal.find(b=>b.name===a.name);return {...a,h1:a.h1+b.h1,q3:a.q3+b.q3,sum:a.sum+b.sum,months:a.months.map((v,i)=>v+b.months[i])};});}
 function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
 function render(){
  if(!data)return;
  const all=records(),period=$('period').value,query=$('search').value.trim().toLowerCase(),total=all.reduce((s,r)=>s+r[period],0),h1=all.reduce((s,r)=>s+r.h1,0),q3=all.reduce((s,r)=>s+r.q3,0);
  const sorted=[...all].sort((a,b)=>b[period]-a[period]),filtered=sorted.filter(r=>(r.name+' '+r.businessType+' '+r.ksic).toLowerCase().includes(query)),shown=filtered.slice(0,20);
  $('total').textContent=fmt(total);$('h1').textContent=fmt(h1);$('q3').textContent=fmt(q3);$('top3').textContent=(sorted.slice(0,3).reduce((s,r)=>s+r[period],0)/total*100).toFixed(1)+'%';
  $('total-note').textContent=period==='h1'?'공식 실적 · 개':'추정 포함 · 개';
  $('state').textContent=labels[type]+' · '+$('period').selectedOptions[0].text+' · '+filtered.length+'개 업종 중 '+shown.length+'개 표시';
  $('rank-note').textContent=query?'검색 일치 업종을 전체 순위와 함께 표시합니다.':'중복 없는 25개 범주 중 상위 20개 · 분류 수준은 서로 다릅니다.';
  const rank=$('ranking');rank.replaceChildren();const max=sorted[0][period];
  if(!shown.length)rank.append(el('p','caption','검색에 맞는 업종이 없습니다. 검색어를 지워주세요.'));
  shown.forEach(r=>{const row=el('div','rank-row'),label=el('div','rank-label'),name=el('span');name.append(el('em','',String(sorted.indexOf(r)+1).padStart(2,'0')),document.createTextNode(r.name));label.append(name,el('b','',fmt(r[period])));const track=el('div','track'),bar=el('div','bar');bar.style.width=r[period]/max*100+'%';const actual=period==='q3'?0:period==='h1'?r.h1:r.h1,estimated=period==='h1'?0:r.q3;const a=el('span','actual'),b=el('span','estimated');a.style.width=actual/r[period]*100+'%';b.style.width=estimated/r[period]*100+'%';bar.append(a,b);track.append(bar);row.append(label,track);rank.append(row);});
  const months=Array.from({length:9},(_,i)=>all.reduce((s,r)=>s+r.months[i],0)),mx=Math.max(...months),chart=$('monthly-chart');chart.replaceChildren();
  months.forEach((v,i)=>{const box=el('div','month'),c=el('div','column '+(i===4||i===5?'actual':'estimated'));c.style.height=(v/mx*160)+'px';box.title=`${i+1}월 ${i===4||i===5?'실적':'추정'} ${fmt(v)}개`;box.append(el('span','value',fmt(v)),c,el('span','month-label',(i+1)+'월'));chart.append(box);});
  const rows=$('rows');rows.replaceChildren();shown.forEach(r=>{const tr=el('tr');const th=el('th','',r.name);th.scope='row';tr.append(th);[...r.months,r.sum].forEach(v=>tr.append(el('td','',fmt(v))));rows.append(tr);});
  $('csv').disabled=false;
 }
 document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>{type=b.dataset.type;document.querySelectorAll('[data-type]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
 $('period').addEventListener('change',render);$('search').addEventListener('input',render);
 $('theme').addEventListener('click',()=>{const root=document.documentElement;root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';});
 $('csv').addEventListener('click',()=>{if(!data)return;const rows=[['사업자 형태','업종','1월 추정','2월 추정','3월 추정','4월 추정','5월 실적','6월 실적','7월 추정','8월 추정','9월 추정','상반기 실적','7~9월 추정','1~9월 추정','통계 기준'],...records().sort((a,b)=>b.sum-a.sum).map(r=>[labels[type],r.name,...r.months,r.h1,r.q3,r.sum,'사업자등록 기준; 1~9월 확정 통계 아님'])];const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download='startup-industries-2026-'+type+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 fetch('data.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(d=>{data=d;render();}).catch(()=>{$('state').textContent='자료를 불러오지 못했습니다. 새로고침하거나 아래 엑셀 다운로드를 이용해 주세요.';});
})();
