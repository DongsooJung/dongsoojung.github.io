const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'research/new-car-sales'),read=f=>fs.readFileSync(path.join(dir,f),'utf8'),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function validate(d){
 if(d.dataPeriod!=='2026-09'||d.market.period!==d.dataPeriod||d.hyundai.period!==d.dataPeriod)throw Error('Period mismatch');
 for(const y of ['2025','2026'])if(d.years[y].length!==12||d.years[y].some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0)))throw Error('Invalid series');
 if(d.years['2026'].slice(9).some(n=>n!==null)||d.years['2026'][8]!==d.market.sales)throw Error('Future or mixed series');
 const pct=(a,b)=>Math.round((a/b-1)*1000)/10;
 if(pct(d.hyundai.domesticSales,d.hyundai.previousYearDomesticSales)!==d.hyundai.yoyPct||pct(d.market.sales,d.years['2025'][8])!==d.market.yoyPct)throw Error('Unreconciled percentage');
 if(!d.market.sourceUrl.startsWith('https://www.kama.or.kr/')||!d.hyundai.sourceUrl.startsWith('https://www.hyundaimotorgroup.com/'))throw Error('Missing original source');
 if(d.hyundai.workingDaysDecrease!==null)throw Error('Unverified company working days');
}
function render(){
 const d=JSON.parse(read('data/market-sales.json'));validate(d);let h=read('index.html').replaceAll('\r\n','\n');const n=x=>x.toLocaleString('ko-KR');
 const kpis=`<section class="kpis" aria-label="핵심 지표"><article class="card"><label>9월 현대차 국내판매</label><strong>${n(d.hyundai.domesticSales)}대</strong><small>현대차 공식 발표 · 2026-10-01</small></article><article class="card"><label>현대차 국내판매 · 전년 동월비</label><strong class="down">−25.7%</strong><small>2025년 9월 ${n(d.hyundai.previousYearDomesticSales)}대 대비</small></article><article class="card"><label>9월 전체 내수 · KAMA 확정 본문</label><strong>${n(d.market.sales)}대</strong><small>국산 + 수입 · 승용 + 상용</small></article><article class="card"><label>전체 내수 · 전년 동월비</label><strong class="down">−14.3%</strong><small>현대차 개별 실적과 범위 구분</small></article></section>`;
 h=h.replace(/<section class="kpis"[\s\S]*?<\/section>/,kpis);
 const marker='<!-- CAR_SEPTEMBER_START -->',end='<!-- CAR_SEPTEMBER_END -->';
 const note=`${marker}<section class="notice" id="hyundai-september"><span class="icon" aria-hidden="true">📉</span><div><h2 style="font-size:20px;margin:0 0 10px">현대차 국내판매, 영업일수 감소 속 25.7% 줄어</h2><p>2026년 9월 현대차 국내판매는 <b>49,022대</b>로 전년 동월 <b>66,001대 대비 25.7% 감소</b>했습니다. 회사는 추석 연휴에 따른 영업일수 감소와 신차 대기수요를 배경으로 설명했습니다. 감소 일수는 회사 원문에 명시되지 않았으며, 이 설명만으로 감소폭 전체의 원인을 확정하지 않습니다.</p><p style="margin-top:10px"><a href="${esc(d.hyundai.sourceUrl)}" target="_blank" rel="noopener">현대차 10월 1일 원문 ↗</a> · <a href="data/hyundai-202609.csv" download>현대차 국내판매 CSV</a> · <a href="data/market-sales.json" download>기준·공표·수집일 JSON</a></p></div></section><section class="notice" id="september-source-note"><span class="icon" aria-hidden="true">🗓️</span><p><b>9월 판본과 범위:</b> <a href="${esc(d.market.sourceUrl)}" target="_blank" rel="noopener">KAMA 10월 19일 확정 발표 본문</a>은 전체 내수 135,370대(−14.3%)입니다. <a href="${esc(d.ministry.sourceUrl)}" target="_blank" rel="noopener">산업부 같은 날 잠정 원표</a>는 135,396대로 26대 차이가 있습니다. 차트의 9월 값은 KAMA 공개 본문 수치를 쓰며, 잠정 원표의 누계·국산·수입 항목을 섞어 확정 합계로 만들지 않습니다. 산업부의 <b>평균 영업일수 3일 감소</b>는 시장 전체 설명으로, 현대차의 개별 조업일수와 구분합니다. <br>9월 원문 수집 ${esc(d.market.collectedAt)} · 파일 생성 ${esc(d.snapshotUpdatedAt)}. 2025년 9월 비교값 외의 과거 차트 값은 기존 게시본이며 이번 원표 미대조입니다. <a href="data/source-review.json">출처·검증 범위</a></p></section>${end}`;
 if(h.includes(marker))h=h.slice(0,h.indexOf(marker))+note+h.slice(h.indexOf(end)+end.length);else h=h.replace(/    <section class="notice"><span class="icon">🗓️<\/span>[\s\S]*?<\/section>/,note);
 h=h.replace('2026년 1–8월</span>','2026년 9월 반영</span>');
 h=h.replace('판매대수는 시장 전체의 방향을 보여주며, 중산층 가계소비 분석에서는 개인 등록 비중을 함께 확인해야 합니다.','9월은 KAMA 확정 발표 본문, 과거 값은 이전 게시본입니다. 2025년 9월 비교값만 산업부 원표로 대조했습니다.');
 h=h.replace('<th>증감률</th></tr></thead><tbody id="month-table">','<th>증감률</th><th>대조 범위</th></tr></thead><tbody id="month-table">');
 h=h.replace(/국내 월별 신차 판매: [\s\S]*?개인·법인:/,'국내 월별 신차 판매: 2026년 9월 KAMA 확정 발표 본문 135,370대와 2025년 9월 산업부 원표 비교값 157,898대를 대조했습니다. 이외 2025·2026년 과거 값은 이전 게시본으로 이번 전수 원표 미대조입니다. 개인·법인:');
 if(!h.includes('id="download-imports-csv"'))h=h.replace(end,'<section class="notice"><span class="icon" aria-hidden="true">ℹ️</span><p>별도 범위: KAIDA 9월 수입 승용차 신규등록 34,904대(10월 6일 공표·10월 17일 원문 확인). 전체 내수와 합산하지 않습니다. <button class="download" id="download-imports-csv" type="button">수입 승용차 CSV</button></p></section>'+end);
 const start=h.indexOf('    const SALES_DATA=')>=0?h.indexOf('    const SALES_DATA='):h.indexOf('    const months=');const finish=h.indexOf('    const fmt=',start);if(start<0||finish<0)throw Error('Series markers missing');
 h=h.slice(0,start)+`    const SALES_DATA=${JSON.stringify(d).replaceAll('<','\\u003c')};\n    const months=["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];\n    const sales2025=SALES_DATA.years['2025'],sales2026=SALES_DATA.years['2026'];\n    const yoy=sales2026.map((v,i)=>v==null?null:Math.round((v/sales2025[i]-1)*1000)/10);\n`+h.slice(finish);
 h=h.replace(/    document.getElementById\("month-table"\)\.innerHTML=[\s\S]*?;\n/,`    document.getElementById("month-table").innerHTML=months.map((month,i)=>\`<tr><td>\${month}</td><td>\${fmt(sales2025[i])}</td><td>\${fmt(sales2026[i])}</td><td class="\${yoy[i]<0?'down':yoy[i]>0?'up':''}">\${yoy[i]==null?'—':yoy[i].toFixed(1)+'%'}</td><td>\${i===8?'9월 원문 대조':sales2026[i]==null?'미수록':'이전 게시본·미대조'}</td></tr>\`).join("");\n`);
 const a=h.indexOf('    document.getElementById("download-csv").addEventListener');const b=h.indexOf('\n',a);if(a<0)throw Error('CSV handler missing');
 h=h.slice(0,a)+'    document.getElementById("download-csv").addEventListener("click",()=>{const a=document.createElement("a");a.href="data/market-sales.csv";a.download="stargate_korea_new_car_sales_2025_2026.csv";a.click();});'+h.slice(b);
 fs.writeFileSync(path.join(dir,'index.html'),h);
 const csv=rows=>'\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
 const rows=[['year','month','sales','yoy_pct','verification','scope','published_at','collected_at','source_url']];
 for(const year of ['2025','2026'])d.years[year].forEach((v,i)=>{if(v===null)return;const verified=d.verifiedPoints[year+'-'+String(i+1).padStart(2,'0')],source=verified?d[verified.source]:null;rows.push([year,i+1,v,year==='2026'?((v/d.years['2025'][i]-1)*100).toFixed(1):'',verified?'official_point_checked':'legacy_unverified','전체 내수 · 국산+수입 · 승용+상용',source?.publishedAt,source?.collectedAt,source?.sourceUrl]);});
 fs.writeFileSync(path.join(dir,'data/market-sales.csv'),csv(rows));
 fs.writeFileSync(path.join(dir,'data/hyundai-202609.csv'),csv([['period','scope','sales','previous_year_sales','yoy_pct','working_days_decrease','published_at','collected_at','source_url'],[d.hyundai.period,'현대자동차 국내판매',d.hyundai.domesticSales,d.hyundai.previousYearDomesticSales,d.hyundai.yoyPct,'미확인',d.hyundai.publishedAt,d.hyundai.collectedAt,d.hyundai.sourceUrl]]));
 console.log(JSON.stringify({market:d.market.sales,hyundai:d.hyundai.domesticSales,exportedPoints:rows.length-1}));
}
if(require.main===module)render();module.exports={validate,render};
