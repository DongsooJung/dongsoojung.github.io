const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>fs.writeFileSync(path.join(root,p),s);
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const number=n=>n.toLocaleString('ko-KR');
function block(text,key,content){
 const start=`<!-- ${key}_START -->`,end=`<!-- ${key}_END -->`;
 const a=text.indexOf(start),b=text.indexOf(end,a);
 if(a<0||b<a)throw Error('Missing render marker '+key);
 return text.slice(0,a)+start+content+end+text.slice(b+end.length);
}
function table(d,region){
 const rows=d.districts.slice().sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 return `<div style="overflow-x:auto"><table><caption>${region} 지역별 시설 수</caption><thead><tr><th scope="col">지역</th><th scope="col">학원</th><th scope="col">교습소</th><th scope="col">합계</th></tr></thead><tbody>`+rows.map(g=>`<tr><th scope="row">${esc(g.name)}</th><td>${number(g.academyCount)}</td><td>${number(g.teachingRoomCount)}</td><td>${number(g.total)}</td></tr>`).join('')+`<tr><th scope="row">합계</th><td>${number(d.totals.academyCount)}</td><td>${number(d.totals.teachingRoomCount)}</td><td>${number(d.totals.total)}</td></tr></tbody></table></div>`;
}
function summary(d,region,file){
 return `<p class="sub">${region} 학원·교습소 <strong>${number(d.totals.total)}개</strong> (학원 ${number(d.totals.academyCount)} · 교습소 ${number(d.totals.teachingRoomCount)})</p>`+
 `<p>${region==='경기'?'명부 기준일 2026-09-30 · 원문 게시 2026-10-14':'전수 통계 기준일 미제공 · 행별 적재일 2023-10-18~2026-10-11 · 10월 부분 갱신 포함(월간 합계 아님)'}<br>원본 수집 ${esc(d.collectedAt)} · 집계 파일 생성 ${esc(d.snapshotUpdatedAt)}</p>`+
 `<p>${esc(d.definition)} 지도는 2013년 참고 경계로 현행 경계가 아니며 면적당 밀도는 제공하지 않습니다.</p>`+
 `<p><a href="${esc(d.source.url)}" target="_blank" rel="noopener">공식 원출처</a> · <a href="/data/academy/${file}.json" download>집계·검증 JSON</a> · <a href="/data/academy/${file}.csv" download>지역별 CSV</a> · <a href="/research/source-reviews/2026-10-17-urban-2.json">출처 점검</a></p>`+
 (region==='서울'?'<p>이전 화면의 총계 25,522개는 저장된 구별 합계 25,480개와 달랐습니다. 이번 공식 CSV 집계 25,507개와는 기준·정의가 달라 증감으로 해석하지 않습니다. 기존 수요지수는 산식·소득 입력·비교 회차를 검증하지 못해 기본 지도에서 제외했습니다. <a href="/data/academy/seoul-legacy-model.json" download>기존 모델 보존본(미검증)</a></p><p>원문 자치구 공란 43행은 도로명주소에서 복원했습니다. 등록일자 1행이 2106년으로 기재된 원문 오류는 기록하되 시설 수에 등록일자 필터를 적용하지 않았습니다.</p>':'<p>원본의 성남 학원 강좌 4행에 있는 주소 접두어 ‘5경기도 성남시’를 ‘경기도 성남시’로 정정했습니다. 원본 해시와 중복 제거 내역을 JSON에 기록했습니다.</p>');
}
function render(){
 const s=JSON.parse(read('data/academy/seoul.json')),g=JSON.parse(read('data/academy/gyeonggi.json'));
 for(const [file,d,label,marker] of [['seoul',s,'서울','SEOUL'],['gyeonggi',g,'경기','GYEONGGI']]){
  for(const key of ['academyCount','teachingRoomCount','total'])if(d.districts.reduce((a,r)=>a+r[key],0)!==d.totals[key])throw Error('Unreconciled '+file);
  let text=read(`${file}-academy-map/index.html`);
  text=block(text,`${marker}_SUMMARY`,summary(d,label,file));
  text=block(text,`${marker}_TABLE`,table(d,label));
  text=text.replace(/const counts\s*=\s*\{[^;]*?\};/,`const counts=${JSON.stringify(Object.fromEntries(d.districts.map(r=>[r.name,r.total])))};`);
  write(`${file}-academy-map/index.html`,text);
  const header=['지역','학원','교습소','합계','자료기준일','행별최종적재일','원본수집일','집계파일생성일','공식출처'];
  const csv=d.districts.slice().sort((a,b)=>a.name.localeCompare(b.name,'ko')).map(r=>[r.name,r.academyCount,r.teachingRoomCount,r.total,d.dataAsOf||'전수 기준일 미제공',d.sourceLatestRowLoadedAt||'',d.collectedAt,d.snapshotUpdatedAt,d.source.url]);
  write(`data/academy/${file}.csv`,'\ufeff'+[header,...csv].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n');
 }
 let cap=read('sudogwon-academy-map/index.html');
 for(const [name,data] of [['seoul',s],['gg',g]])cap=cap.replace(new RegExp(`const ${name}=\\{[^;]+?\\};`),`const ${name}=${JSON.stringify(Object.fromEntries(data.districts.map(r=>[r.name,r.total])))};`);
 cap=block(cap,'CAPITAL_SUMMARY',`<p class="note">서울 ${number(s.totals.total)}개: 공식 CSV 개원 시설, 전수 기준일 미제공(행별 적재일 최댓값 2026-10-11). 경기 ${number(g.totals.total)}개: 교육청 2026-09-30 명부의 유형·시설명·주소 중복 제거 집계. 인천은 2026-08-01 명부입니다. 정의·기간이 달라 수도권 동시점 합계·지역 간 증감·면적당 밀도를 제공하지 않습니다. 지도는 2013년 참고 경계입니다. <a href="/seoul-academy-map/">서울 표·출처·다운로드</a> · <a href="/gyeonggi-academy-map/">경기 표·출처·다운로드</a></p>`);
 write('sudogwon-academy-map/index.html',cap);
 console.log(JSON.stringify({seoul:s.totals,gyeonggi:g.totals}));
}
if(require.main===module)render();
module.exports={render};
