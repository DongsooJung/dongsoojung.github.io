const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const labels = { urban:'도시·공간', society:'경제·사회', research:'연구·AI', education:'교육·수학', operations:'운영·제품' };
// These fields are plain text. Preserve literal angle brackets; render() escapes
// every value for HTML, and the browser status renderer uses textContent.
const text = value => String(value || '').replaceAll('&amp;','&').trim();
const attr = (value, name) => value.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const normalize = href => {const u = new URL(href,'https://www.stargateedu.co.kr');return /^(www\.)?stargateedu\.co\.kr$/.test(u.hostname) ? u.pathname : u.href.replace(/\/$/,'');};
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const catalogFile = path.join(root,'research/data-catalog.json');
const planFile = path.join(root,'research/refresh-plan.json');
function initialize() {
 const html = fs.readFileSync(path.join(root,'research/index.html'),'utf8');
 let previous;
 try { previous=JSON.parse(fs.readFileSync(catalogFile,'utf8')); }
 catch(error) { if(error.code!=='ENOENT')throw error; previous={projects:[]}; }
 const byUrl = new Map(previous.projects.map(p=>[p.key,p]));
 const projects = [...html.matchAll(/<a\b[^>]*\bdata-card(?:\s|=|>)[\s\S]*?<\/a>/g)].map(([card])=>{
  const url=attr(card,'href'),key=normalize(url),primary=attr(card,'data-primary');
  return {...(byUrl.get(key)||{source:{label:null,url:null,verification:'pending'},dataAsOf:null,dataPeriod:null,snapshotUpdatedAt:null,collectedAt:null,checkedAt:null,reviewStatus:'pending',freshness:'unverified',evidence:[],issues:[]}),key,url,title:text(card.match(/<h3>([\s\S]*?)<\/h3>/)?.[1]),primary,classification:labels[primary],sourceHint:text(card.match(/class="project-footer"><span>([\s\S]*?)<\/span>/)?.[1])};
 });
 if(new Set(projects.map(p=>p.key)).size!==projects.length)throw Error('Duplicate project URL');
 const catalog={schemaVersion:1,targetMonths:['2026-09','2026-10'],projects};
 fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+'\n');
 {
  const steps=[{id:'setup',label:'가나다순·출처 목록·6개 게시본 1차 점검',status:'completed',completedAt:new Date().toISOString()}];
  for(const [primary,label] of Object.entries(labels)){
   const keys=projects.filter(p=>p.primary===primary).map(p=>p.key);
   const size=primary==='research'?8:7;
   for(let i=0;i<keys.length;i+=size)steps.push({id:`${primary}-${i/size+1}`,label:`${label} ${i/size+1}차`,status:'pending',keys:keys.slice(i,i+size)});
  }
  steps.push({id:'acceptance',label:'전 항목 검증·최종 배포·예약 종료',status:'pending',keys:[]});
  try {
   fs.writeFileSync(planFile,JSON.stringify({schemaVersion:1,status:'active',intervalMinutes:1440,targetMonths:catalog.targetMonths,steps},null,2)+'\n',{flag:'wx'});
  } catch(error) { if(error.code!=='EEXIST')throw error; }
 }
 return catalog;
}
const statusLabels={pending:'출처 점검 대기',snapshot_checked:'게시본 확인 · 원출처 대조 대기',verified:'원출처 대조 완료',not_applicable:'기준월 비적용',source_unavailable:'원출처 접근 불가',awaiting_publication:'공표 대기',needs_review:'수치·범위 검증 필요'};
function render(catalog = JSON.parse(fs.readFileSync(catalogFile,'utf8'))) {
 const rows=[...catalog.projects].sort((a,b)=>a.title.localeCompare(b.title,'ko',{numeric:true})).map(p=>{
  const source=p.source.url ? `<a href="${escape(p.source.url)}" target="_blank" rel="noopener noreferrer">${escape(p.source.label||p.sourceHint)}</a>` : escape(p.sourceHint+' (미검증)');
  const evidence=p.evidence.map(e=>`<a href="${escape(e.url)}" target="_blank" rel="noopener noreferrer">${escape(e.kind==='published-snapshot'?'게시본':'원출처')}</a>`).join(' · ');
  return `<tr><th scope="row"><a href="${escape(p.url)}">${escape(p.title)}</a></th><td>${escape(p.classification)}</td><td>${source}</td><td>${escape(p.dataAsOf||p.dataPeriod||'미확인')}</td><td>${escape(p.collectedAt||'미공개')}<br>게시본 갱신 ${escape(p.snapshotUpdatedAt||'미확인')}</td><td>${escape(statusLabels[p.reviewStatus]||p.reviewStatus)}${p.issues.length?'<br>'+escape(p.issues.join(' / ')):''}<br>${evidence}</td><td>${escape(p.checkedAt||'미확인')}</td></tr>`;
 }).join('\n');
 const count=catalog.projects.filter(p=>p.checkedAt).length;
 const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>연구 허브 출처·자료 기준 점검</title><style>body{margin:0;background:#f5f7fb;color:#172033;font:15px/1.7 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:28px 20px}a{color:#1d4ed8}h1{font-size:28px}.table-wrap{overflow:auto;background:white;border:1px solid #d7deea;border-radius:12px}table{border-collapse:collapse;width:100%;min-width:1100px;font-size:12px}th,td{padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid #d7deea;overflow-wrap:anywhere}thead{background:#eaf0fa}td{min-width:120px}tbody th{min-width:180px}p{max-width:1000px}</style></head><body><main><a href="/research/">← 연구 허브</a><h1>출처·자료 기준 점검</h1><p>전체 ${catalog.projects.length}개 중 게시본 또는 원출처 확인 기록 ${count}개. 2026년 9월·10월 자료를 목표로 단계별 점검 중입니다. 게시본 확인은 공식 원출처 대조 완료와 구분합니다. 자료 기준은 관측 기간, 게시본 갱신은 파일에 기재된 날짜, 수집일은 실제 수집 시각이 공개된 경우만 표시합니다.</p><div class="table-wrap"><table><thead><tr><th>프로젝트</th><th>분류</th><th>출처</th><th>자료 기준</th><th>수집일·게시본 갱신</th><th>검증 상태·근거</th><th>확인일 (UTC)</th></tr></thead><tbody>${rows}</tbody></table></div></main></body></html>`;
 fs.mkdirSync(path.join(root,'research/data-review'),{recursive:true});
 fs.writeFileSync(path.join(root,'research/data-review/index.html'),html+'\n');
 return {projects:catalog.projects.length,checked:count};
}
if(require.main===module){if(process.argv.includes('--init'))initialize();console.log(JSON.stringify(render()));}
module.exports={initialize,render,catalogFile,planFile,statusLabels};
