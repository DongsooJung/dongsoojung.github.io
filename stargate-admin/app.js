import {selectBoardTasks} from './board.mjs?v=1.4.0';
import {createDataStore, validateBackupState, parseBackup, deadlineInfo, validDate, createDraftStore, validateCustomProject, PROJECT_GROUPS, StorageConflictError} from './data.mjs?v=1.2';
'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const E = escapeHTML;
const iconPaths = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  research:'<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-35 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(35 12 12)"/>',
  strategy:'<path d="M4 20V10h4v10m2 0V5h4v15m2 0V2h4v18M2 21h20"/>',
  star:'<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-3-5.6 3 1-6.2L3 9.6l6.2-.9z"/>',
  board:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M5.5 7h1M11.5 7h1M17.5 7h1"/>',
  channels:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  settings:'<path d="m10 3-.8 3-2 .9-2.8-.8-2 3.4 2.2 2.1v2.8L2.4 16l2 3.4 2.8-.8 2 .9.8 2.5h4l.8-2.5 2-.9 2.8.8 2-3.4-2.2-1.6v-2.8l2.2-2.1-2-3.4-2.8.8-2-.9L14 3z"/><circle cx="12" cy="12.5" r="3"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  moon:'<path d="M20.5 14A8.7 8.7 0 0 1 10 3.5 8.8 8.8 0 1 0 20.5 14z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  external:'<path d="M14 3h7v7m0-7L11 13M10 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18M7 15h2m4 0h2m-8 3h2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  book:'<path d="M12 5v16m0-16C8 2 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-2-1-6-2-10 1z"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',
  edit:'<path d="m15 4 5 5M4 20l4-1L21 6a2 2 0 0 0-5-5L3 14l-1 7z"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name]||iconPaths.layers}</svg>`;
const icons = root => $$('[data-icon]',root).forEach(el=>el.innerHTML=icon(el.dataset.icon));
const STORAGE_KEY='stargate-admin-v1';
const statuses={unreviewed:'미검토',doing:'진행 중',hold:'보류',done:'완료'};
const stateClasses={unreviewed:'',doing:'doing',hold:'hold',done:'done'};
let catalog, state, page='today', filters={search:'',group:'전체',status:'all',favorite:false,view:'grid',page:1}, pinTab='all', taskTab='open';
let toastTimer, storageWarning=false, dataStore, draftStore, baseProjects=[];
let boardMode='active', boardFilters={axis:'all',deadline:'all',search:'',sort:'due'};
const pages={today:'오늘의 현황',research:'연구 대시보드',strategy:'전략 대시보드',favorites:'즐겨찾기',board:'실행 보드',channels:'앱 · 블로그 · 채널',settings:'설정 및 데이터'};
const axisLabel=axis=>axis==='research'?'연구':'전략';
const dateKST = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const formatDate = value => value ? String(value).slice(0,10).replaceAll('-','.') : '기한 없음';
const formatShortDate = value => value ? String(value).slice(5,10).replace('-','.') : '';
const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'#';}catch{return '#';}};
const external=(url,label,cls='text-link')=>`<a class="${cls}" href="${E(safeUrl(url))}" target="_blank" rel="noopener noreferrer"${cls==='icon-button'?' aria-label="원본 페이지 열기"':''}>${label}${cls==='icon-button'?'':icon('external')}</a>`;
const projectMeta=p=>state.projects[p.id]||{status:'unreviewed',note:'',priority:'normal'};
const isFavorite=p=>state.favorites.includes(p.id);
const statusBadge=p=>`<span class="status ${stateClasses[projectMeta(p).status]}">${statuses[projectMeta(p).status]}</span>`;
function toast(message){
  $('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);
  const dialog=$('dialog[open]');if(dialog){let feedback=$('[data-dialog-feedback]',dialog);if(!feedback){feedback=document.createElement('div');feedback.dataset.dialogFeedback='';feedback.className='dialog-feedback';feedback.setAttribute('role','alert');dialog.append(feedback);}feedback.textContent=message;}
}
function rebuildCatalog(){catalog.projects=[...baseProjects,...(state.customProjects||[])];}
function bindDraft(form,key,ids){
  const draft=draftStore.read(key);const hint=document.createElement('p');hint.className='draft-hint';hint.textContent=draft?'임시 보관하던 작성 내용을 복원했습니다.':'작성 중 내용은 이 탭에 임시 보관됩니다.';form.prepend(hint);
  if(draft&&ids.some(id=>typeof draft.fields?.[id]==='string'&&draft.fields[id]!==$('#'+id,form)?.value)){
    const comparison=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('pre');comparison.className='draft-compare';summary.textContent='현재 저장된 내용 보기';
    content.textContent=ids.map(id=>{const field=$('#'+id,form),label=$('label[for="'+id+'"]',form)?.textContent||id;return label+'\n'+(field?.tagName==='SELECT'?field.selectedOptions[0]?.textContent:field?.value||'비어 있음');}).join('\n\n');comparison.append(summary,content);hint.after(comparison);
  }
  if(draft)for(const id of ids){const field=$('#'+id,form),value=draft.fields?.[id];if(!field||typeof value!=='string')continue;if(field.tagName==='SELECT'&&![...field.options].some(o=>o.value===value))continue;if(field.type==='date'&&value&&!validDate(value))continue;field.value=value.slice(0,field.maxLength>0?field.maxLength:20000);}
  const keep=()=>{draftStore.save(key,Object.fromEntries(ids.map(id=>[id,$('#'+id,form).value])));hint.textContent='작성 중 · 이 탭에 임시 보관됨';};form.addEventListener('input',keep);form.addEventListener('change',keep);
}

function adopted(next){
  state=next;rebuildCatalog();storageWarning=false;
  $('#footer-state').textContent='이 브라우저에 저장 · '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(new Date());
}
function saveFailed(error){storageWarning=true;$('#footer-state').textContent='저장하지 못함 · 작성 내용 보관';toast(error instanceof StorageConflictError?error.message:'저장하지 못했습니다. 입력 내용은 그대로 두었습니다. 저장 공간을 확인해 주세요.');}
function persist(next){try{adopted(dataStore.save(next));return true;}catch(error){saveFailed(error);return false;}}
function mutateState(change){const next=structuredClone(state);change(next);return persist(next);}
function validateState(value){return validateBackupState(value,baseProjects.map(p=>p.id));}
function restoreAvailable(){try{return !!dataStore.restorePoint();}catch{return false;}}
function deadlineBadge(task){const d=deadlineInfo(task,dateKST());return '<span class="deadline '+d.kind+'">'+E(d.label)+'</span>';}

function initialState(){
  const initial=['실시간 도시 관측','인천공항 혼잡도 연구 대시보드','DID 정책효과','2026 Q4 실행계획','BidPilot','당근 최근 3개년 재무분석'];
  return {schemaVersion:1,favorites:initial.map(title=>catalog.projects.find(p=>p.title.includes(title))?.id).filter(Boolean),projects:{},tasks:[],customProjects:[],preferences:{textSize:'normal'},revision:0,theme:'light',updatedAt:''};
}
function setTheme(theme){document.documentElement.dataset.textSize=state.preferences?.textSize||'normal';document.documentElement.dataset.theme=theme;$('#theme-toggle').innerHTML=icon(theme==='dark'?'sun':'moon');$('#theme-toggle').setAttribute('aria-label',theme==='dark'?'라이트 모드로 전환':'다크 모드로 전환');$('#theme-toggle').title=theme==='dark'?'라이트 모드':'다크 모드';}
function nav(){
  const navItems=[['today','home'],['research','research'],['strategy','strategy'],['favorites','star'],['board','board'],['channels','channels']];
  $('#nav').innerHTML=navItems.map(([p,i],index)=>`${index===4?'<div class="nav-separator"></div><div class="nav-caption">MANAGEMENT</div>':''}<button class="nav-link ${page===p?'active':''}" data-page="${p}" ${page===p?'aria-current="page"':''}>${icon(i)}<span>${pages[p]}</span>${p==='research'||p==='strategy'?`<span class="nav-count">${catalog.projects.filter(x=>x.axes.includes(p)).length}</span>`:p==='favorites'?`<span class="nav-count">${state.favorites.length}</span>`:''}</button>`).join('');
  $('#mobile-nav').innerHTML=[['today','home','오늘'],['research','research','연구'],['strategy','strategy','전략'],['board','board','실행'],['channels','channels','채널']].map(([p,i,label])=>`<button data-page="${p}" class="${page===p?'active':''}" ${page===p?'aria-current="page"':''}>${icon(i)}<span>${label}</span></button>`).join('');
  $$('.sidebar-bottom [data-page]').forEach(x=>x.classList.toggle('active',page===x.dataset.page));
  $('#crumb').textContent=pages[page];document.title=`${pages[page]} · STARGATE 관리자`;
}
function heading(kicker,title,description,actions=''){return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;}
function projectSymbol(p){return `<span class="project-symbol ${p.axes[0]}">${icon(p.axes[0])}</span>`;}
function pinRow(p){return `<div class="pin-row">${projectSymbol(p)}<div class="project-row-main"><button class="row-title" data-project="${p.id}">${E(p.title)}</button><div class="row-meta"><span>${p.axes.map(axisLabel).join(' · ')}</span><span>${E(p.groups[p.axes[0]])}</span></div></div>${statusBadge(p)}<button class="icon-button" data-project="${p.id}" aria-label="${E(p.title)} 관리">${icon('chevron')}</button></div>`;}
function taskLine(t){return `<div class="task-item ${t.status==='done'?'task-done':''}"><input class="task-check" type="checkbox" data-task-check="${E(t.id)}" aria-label="${E(t.title)} 완료" ${t.status==='done'?'checked':''}><div class="task-content"><button class="task-title" data-edit-task="${E(t.id)}">${E(t.title)}</button><div class="task-meta"><span class="tag ${t.axis==='research'?'blue':t.axis==='strategy'?'amber':''}">${t.axis==='operations'?'운영':axisLabel(t.axis)}</span>${t.due?deadlineBadge(t):''}<span>${t.status==='doing'?'진행 중':t.status==='done'?'완료':'할 일'}</span></div></div></div>`;}
function renderToday(){
  const activeTasks=state.tasks.filter(t=>!t.archived);
  const research=catalog.projects.filter(p=>p.axes.includes('research')).length,strategy=catalog.projects.filter(p=>p.axes.includes('strategy')).length;
  const openTasks=activeTasks.filter(t=>t.status!=='done'),done=activeTasks.filter(t=>t.status==='done').length;
  const favorites=catalog.projects.filter(isFavorite).filter(p=>pinTab==='all'||p.axes.includes(pinTab)).slice(0,4);
  const tasks=activeTasks.filter(t=>taskTab==='all'||t.status!=='done').sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,4);
  const today=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date());
  $('#main').innerHTML=heading('YOUR DAILY OVERVIEW','오늘, 무엇에 집중할까요?','연구의 발견과 사업의 실행을 한눈에 이어봅니다.',`<span class="date-pill">${icon('calendar')}${E(today)}</span><button class="button primary" data-new-task>${icon('plus')}할 일 추가</button>`)+`
  <section class="stats" aria-label="워크스페이스 요약">
    ${[[research,'연구 프로젝트','research','9개 세부 분야를 6개 주제로'],[strategy,'전략 보고서','strategy','기업 · 시장 · 실행 · 관측'],[state.favorites.length,'즐겨찾기','star','자주 보는 프로젝트 모음'],[openTasks.length,'진행할 과제','board',`완료 ${done}건 · 직접 등록한 실행 과제`]].map(([n,label,i,caption])=>`<div class="stat"><div class="stat-top">${label}<span class="stat-icon">${icon(i)}</span></div><div class="stat-number">${n}<small>개</small></div><div class="stat-caption">${E(caption)}</div></div>`).join('')}
  </section>
  <section class="axis-grid" aria-label="두 가지 대시보드">
    <article class="axis-card"><div class="axis-card-content"><div class="axis-kicker">${icon('research')}RESEARCH OBSERVATORY</div><h2>연구 대시보드</h2><p>데이터를 관측하고, 다음 질문을 발견하세요.</p><div class="axis-bottom"><button class="axis-button" data-page="research">연구 살펴보기 ${icon('arrow')}</button><span class="axis-count"><strong>${research}</strong>프로젝트</span></div></div><div class="axis-art" aria-hidden="true"><i class="orbit"></i><i class="orbit"></i><i class="orbit"></i></div></article>
    <article class="axis-card strategy"><div class="axis-card-content"><div class="axis-kicker">${icon('strategy')}STRATEGY INTELLIGENCE</div><h2>전략 대시보드</h2><p>시장의 신호를 읽고, 사업의 다음 수를 정하세요.</p><div class="axis-bottom"><button class="axis-button" data-page="strategy">전략 살펴보기 ${icon('arrow')}</button><span class="axis-count"><strong>${strategy}</strong>보고서</span></div></div><div class="axis-art" aria-hidden="true"><i class="art-step"></i><i class="art-step"></i><i class="art-step"></i><i class="art-step"></i></div></article>
  </section>
  <div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>자주 보는 프로젝트 <span class="count">${state.favorites.length}</span></h2><button class="text-link" data-page="favorites">전체 보기 ${icon('arrow')}</button></div><div class="tabs" role="group" aria-label="즐겨찾기 분류">${[['all','전체'],['research','연구'],['strategy','전략']].map(([v,l])=>`<button data-pin-tab="${v}" class="${pinTab===v?'active':''}" aria-pressed="${pinTab===v}">${l}</button>`).join('')}</div>${favorites.length?favorites.map(pinRow).join(''):'<div class="empty">프로젝트의 별을 눌러 이곳에 모아보세요.</div>'}<div class="panel-foot"><span>별표로 내 시작 화면을 구성하세요.</span>${icon('star')}</div></section>
  <section class="panel"><div class="panel-head"><h2>나의 실행 과제 <span class="count">${openTasks.length}</span></h2><button class="icon-button" data-new-task aria-label="실행 과제 추가">${icon('plus')}</button></div><div class="tabs" role="group" aria-label="과제 표시 범위"><button data-task-tab="open" class="${taskTab==='open'?'active':''}" aria-pressed="${taskTab==='open'}">진행할 일</button><button data-task-tab="all" class="${taskTab==='all'?'active':''}" aria-pressed="${taskTab==='all'}">전체</button></div>${tasks.length?`<div class="task-list">${tasks.map(taskLine).join('')}</div>`:`<div class="empty"><div class="empty-icon">${icon('check')}</div>${activeTasks.length?'진행할 일을 모두 마쳤습니다.':'중요한 일 세 가지만 시작해 보세요.'}<br><span class="helper">연구 검토, 보고서 보완, 다음 콘텐츠 준비까지.</span><br><button class="button" data-new-task>${icon('plus')}첫 과제 등록</button></div>`}<div class="panel-foot"><div class="task-progress"><span>완료 ${done} / ${activeTasks.length}</span><span class="completion"><span style="width:${activeTasks.length?Math.round(done/activeTasks.length*100):0}%"></span></span></div><button class="text-link" data-page="board">실행 보드 ${icon('arrow')}</button></div></section></div>
  <div class="bottom-grid"><section class="panel"><div class="panel-head"><h2>스타게이트 채널</h2><button class="text-link" data-page="channels">채널 관리 ${icon('arrow')}</button></div><div class="channel-strip"><a class="channel-mini" href="https://stargateedu.co.kr/" target="_blank" rel="noopener"><span class="arrow-corner">${icon('external')}</span><span class="channel-logo">✳</span><strong>스타게이트 홈페이지</strong><small>교육 · 연구 · 전략</small></a><a class="channel-mini" href="https://blog.stargateedu.co.kr/" target="_blank" rel="noopener"><span class="arrow-corner">${icon('external')}</span><span class="channel-logo dark">B.</span><strong>스타게이트 블로그</strong><small>지식 · 연구 아카이브</small></a><a class="channel-mini" href="https://play.google.com/store/apps/details?id=kr.co.stargateedu.twa" target="_blank" rel="noopener"><span class="arrow-corner">${icon('external')}</span><span class="channel-logo amber">${icon('phone')}</span><strong>스타게이트 앱</strong><small>Google Play</small></a></div></section>
  <section class="panel"><div class="panel-head"><h2>최근 블로그 글</h2><span class="tag">가져온 목록</span></div><div class="blog-brief">${external(catalog.posts[0]?.url||catalog.sources.blog,E(catalog.posts[0]?.title||'공식 블로그 살펴보기'),'blog-title')}<div class="row-meta">${E(catalog.posts[0]?.channel)} · ${formatDate(catalog.posts[0]?.date)}</div><div class="helper">목록 수집 ${E(catalog.blogCollectedAt)}</div></div></section></div>`;
}
const researchBuckets={ '도시·공간':['실시간 도시','행정경계','접근·부동산'],'경제·사회':['거시·산업','커뮤니티 신호'],'연구·AI':['연구 방법·AI'],'난제·에세이':['난제·에세이'],'교육·수학':['교육·수학'],'운영·제품':['운영·제품']};
function inGroup(p,group){if(group==='전체')return true;if(page==='research')return researchBuckets[group]?.includes(p.groups.research);return p.groups.strategy===group;}
function allForPage(){return catalog.projects.filter(p=>page==='favorites'?isFavorite(p):p.axes.includes(page));}
function filteredProjects(){return allForPage().filter(p=>inGroup(p,filters.group)&&(!filters.favorite||isFavorite(p))&&(filters.status==='all'||projectMeta(p).status===filters.status)&&(`${p.title} ${p.description} ${p.source} ${projectMeta(p).note} ${Object.values(p.groups).join(' ')}`).toLowerCase().includes(filters.search.toLowerCase())).sort((a,b)=>Number(projectMeta(b).priority==='high')-Number(projectMeta(a).priority==='high')||Number(isFavorite(b))-Number(isFavorite(a)));}
function projectCard(p){return `<article class="project-card"><div class="card-top">${projectSymbol(p)}<button class="icon-button favorite ${isFavorite(p)?'selected':''}" data-favorite="${p.id}" aria-label="${E(p.title)} 즐겨찾기" aria-pressed="${isFavorite(p)}">${icon('star')}</button></div><h3><button data-project="${p.id}">${E(p.title)}</button></h3><p>${E(p.description)}</p><div class="card-bottom"><span class="tag">${E(p.groups[page]||p.groups[p.axes[0]])}</span>${statusBadge(p)}<button class="text-link" data-project="${p.id}">관리 ${icon('arrow')}</button></div></article>`;}
function renderCatalog(){
  const isFav=page==='favorites',n=allForPage().length;
  const groups=isFav?[]:page==='research'?Object.keys(researchBuckets):catalog.groups.strategy;
  $('#main').innerHTML=heading(isFav?'YOUR SHORTLIST':page==='research'?'RESEARCH OBSERVATORY':'STRATEGY INTELLIGENCE',isFav?'자주 보는 것만, 가까이에.':page==='research'?'발견을 쌓는 연구 공간':'판단을 실행으로 연결하세요.',isFav?'필요한 프로젝트를 골라 나만의 시작점을 만듭니다.':page==='research'?`연결된 ${n}개 연구 프로젝트를 목적별로 살펴보세요.`:`기업·시장·사업 실행에 필요한 ${n}개 보고서를 모았습니다.`,external(catalog.sources[page]||catalog.sources.research,'홈페이지에서 보기','button')+`<button class="button primary" data-new-project>${icon('plus')}프로젝트 등록</button>`)+`
  <div class="toolbar"><div class="search-field">${icon('search')}<input id="catalog-search" type="search" placeholder="제목, 주제, 관리 메모로 검색" aria-label="프로젝트 검색" value="${E(filters.search)}"></div><select class="select" id="status-filter" aria-label="검토 상태"><option value="all">모든 검토 상태</option>${Object.entries(statuses).map(([v,l])=>`<option value="${v}" ${filters.status===v?'selected':''}>${l}</option>`).join('')}</select>${!isFav?`<button class="filter-button ${filters.favorite?'active':''}" id="favorite-filter" aria-pressed="${filters.favorite}">${icon('star')}즐겨찾기</button>`:''}<div class="view-toggle" role="group" aria-label="목록 보기 방식"><button class="${filters.view==='grid'?'active':''}" data-view="grid" aria-label="카드 보기" aria-pressed="${filters.view==='grid'}">${icon('grid')}</button><button class="${filters.view==='list'?'active':''}" data-view="list" aria-label="표 보기" aria-pressed="${filters.view==='list'}">${icon('list')}</button></div></div>
  ${groups.length?`<div class="group-pills" role="group" aria-label="주제 분류"><button data-group="전체" class="${filters.group==='전체'?'active':''}" aria-pressed="${filters.group==='전체'}">전체 <small>${n}</small></button>${groups.map(g=>`<button data-group="${E(g)}" class="${filters.group===g?'active':''}" aria-pressed="${filters.group===g}">${E(g)}<small>${allForPage().filter(p=>page==='research'?researchBuckets[g].includes(p.groups.research):p.groups.strategy===g).length}</small></button>`).join('')}</div>`:''}
  <div id="catalog-results"></div><p class="catalog-note">홈페이지 목록 기준 ${catalog.sourceDate} · 검토 상태는 이 관리자 앱에서 직접 기록한 상태입니다. 원본 서비스의 운영 상태와는 별개입니다.</p>`;
  $('#catalog-search').addEventListener('input',event=>{filters.search=event.target.value;filters.page=1;renderCatalogResults();});
  $('#status-filter').addEventListener('change',event=>{filters.status=event.target.value;filters.page=1;renderCatalogResults();});
  renderCatalogResults();
}
function renderCatalogResults(){
  const result=filteredProjects(),pageSize=12,pagesCount=Math.max(1,Math.ceil(result.length/pageSize));filters.page=Math.min(filters.page,pagesCount);
  const visible=result.slice((filters.page-1)*pageSize,filters.page*pageSize);
  $('#catalog-results').innerHTML=`<div class="catalog-summary" role="status"><span><strong>${result.length}</strong>개 프로젝트${filters.search?' · “'+E(filters.search)+'” 검색 결과':''}</span><span>중요 표시 · 즐겨찾기 우선</span></div>`+(visible.length?(filters.view==='grid'?`<div class="project-grid">${visible.map(projectCard).join('')}</div>`:`<div class="table-scroll"><table class="project-table"><thead><tr><th scope="col">프로젝트</th><th scope="col">분류</th><th scope="col">검토 상태</th><th scope="col">바로가기</th></tr></thead><tbody>${visible.map(p=>`<tr><td><button class="row-title" data-project="${p.id}">${E(p.title)}</button><div class="row-meta">${E(p.source)}</div></td><td>${E(p.groups[page]||p.groups[p.axes[0]])}</td><td>${statusBadge(p)}</td><td><button class="icon-button favorite ${isFavorite(p)?'selected':''}" data-favorite="${p.id}" aria-label="${E(p.title)} 즐겨찾기" aria-pressed="${isFavorite(p)}">${icon('star')}</button>${external(p.url,icon('external'),'icon-button')}</td></tr>`).join('')}</tbody></table></div>`):`<div class="panel empty"><div class="empty-icon">${icon('search')}</div>조건에 맞는 프로젝트가 없습니다.<br><button class="button" data-reset-filters>검색 조건 초기화</button></div>`)+`<div class="pagination"><button class="button" data-pagination="-1" ${filters.page===1?'disabled':''}>이전</button><span>${filters.page} / ${pagesCount}</span><button class="button" data-pagination="1" ${filters.page===pagesCount?'disabled':''}>다음</button></div>`;
}
function openProject(id){
  const p=catalog.projects.find(x=>x.id===id);if(!p)return;
  const m=projectMeta(p),expectedRecord=JSON.stringify(projectMeta(p)),dialog=$('#project-dialog');
  dialog.innerHTML=`<div class="dialog-head"><div class="eyebrow">PROJECT WORKSPACE</div><button class="icon-button" data-close-dialog aria-label="닫기">${icon('close')}</button></div><div class="dialog-content">${projectSymbol(p)}<h2 id="project-title">${E(p.title)}</h2><p class="description">${E(p.description)}</p>${external(p.url,'원본 프로젝트 열기','button')}${p.id.startsWith('custom-')?`<button class="button" data-edit-custom="${p.id}">등록 정보 수정</button>`:''}<div class="source-box"><strong>${p.id.startsWith('custom-')?'내가 등록한 정보':'홈페이지에 표시된 자료 출처'}</strong>${E(p.source||'출처 안내 없음')}<p>프로젝트 목록 확인: ${catalog.sourceDate} · 개별 데이터의 최신성은 원본에서 확인하세요.</p></div><form id="project-form" data-id="${p.id}"><div class="field-row"><div><label class="form-label" for="project-status">나의 검토 상태</label><select id="project-status" class="form-input">${Object.entries(statuses).map(([v,l])=>`<option value="${v}" ${m.status===v?'selected':''}>${l}</option>`).join('')}</select></div><div><label class="form-label" for="project-priority">중요도</label><select class="form-input" id="project-priority"><option value="normal">보통</option><option value="high" ${m.priority==='high'?'selected':''}>중요</option></select></div></div><label class="form-label" for="project-note">관리 메모</label><textarea class="form-input" id="project-note" maxlength="12000" placeholder="확인할 출처, 다음 분석, 보완할 내용을 남겨보세요.">${E(m.note)}</textarea><p class="helper">메모와 검토 상태는 이 브라우저에 저장됩니다.</p><div class="dialog-actions"><button type="button" class="button" data-favorite="${p.id}">${icon('star')}${isFavorite(p)?'즐겨찾기 해제':'즐겨찾기 추가'}</button><button class="button primary" type="submit">변경 저장 ${icon('check')}</button></div></form><hr class="dialog-divider"><button class="text-link" data-task-from-project="${p.id}">${icon('plus')}이 프로젝트의 실행 과제 만들기</button><div class="helper">${p.axes.map(axisLabel).join(' · ')} / ${E(Object.values(p.groups).join(' · '))}${m.reviewedAt?'<br>기록일 '+formatDate(m.reviewedAt):''}</div></div>`;
  bindDraft($('#project-form'),'project:'+id,['project-status','project-priority','project-note']);
  $('#project-form').addEventListener('submit',event=>{event.preventDefault();if(JSON.stringify(projectMeta(p))!==expectedRecord){toast('다른 탭에서 이 프로젝트가 변경됐습니다. 작성 내용은 임시 보관했습니다. 닫고 다시 열어 확인해 주세요.');return;}const record={status:$('#project-status').value,note:$('#project-note').value,priority:$('#project-priority').value,reviewedAt:new Date().toISOString()};if(mutateState(next=>{next.projects[id]=record;})){draftStore.clear('project:'+id);dialog.close();render();toast('검토 상태와 메모를 저장했습니다.');}});
  dialog.showModal();
}
function openTask(id,project){
  const draftKey='task:'+(id||project?.id||'new');
  const t=state.tasks.find(x=>x.id===id)||{title:project?project.title+' 검토':'',note:project?project.url:'',axis:project?project.axes[0]:'research',status:'todo',due:''};
  $('#task-dialog').innerHTML=`<div class="dialog-head"><h2 id="task-title">${id?'실행 과제 수정':'새 실행 과제'}</h2><button class="icon-button" data-close-dialog aria-label="닫기">${icon('close')}</button></div><div class="dialog-content"><form id="task-form"><label class="form-label" for="task-name">할 일</label><input id="task-name" class="form-input" required maxlength="160" value="${E(t.title)}" placeholder="지금 집중할 한 가지를 적어주세요."><div class="field-row"><div><label class="form-label" for="task-axis">연결할 영역</label><select id="task-axis" class="form-input">${[['research','연구'],['strategy','전략'],['operations','운영']].map(([v,l])=>`<option value="${v}" ${t.axis===v?'selected':''}>${l}</option>`).join('')}</select></div><div><label class="form-label" for="task-due">목표일 <span class="helper">선택</span></label><input id="task-due" class="form-input" type="date" value="${E(t.due)}"></div></div><label class="form-label" for="task-status">진행 상태</label><select id="task-status" class="form-input">${[['todo','할 일'],['doing','진행 중'],['done','완료']].map(([v,l])=>`<option value="${v}" ${t.status===v?'selected':''}>${l}</option>`).join('')}</select><label class="form-label" for="task-note">메모 <span class="helper">선택</span></label><textarea id="task-note" class="form-input" maxlength="4000" placeholder="완료 기준이나 관련 링크를 남겨주세요.">${E(t.note)}</textarea><div class="dialog-actions"><span class="helper">이 브라우저에 저장됩니다.</span><button type="submit" class="button primary">${id?'수정 저장':'과제 추가'} ${icon('arrow')}</button></div></form></div>`;
  const expectedTask=id?JSON.stringify(state.tasks.find(x=>x.id===id)):null;bindDraft($('#task-form'),draftKey,['task-name','task-axis','task-due','task-status','task-note']);
  $('#task-form').addEventListener('submit',event=>{event.preventDefault();if(id&&JSON.stringify(state.tasks.find(x=>x.id===id))!==expectedTask){toast('다른 탭에서 이 과제가 변경됐습니다. 작성 내용은 임시 보관했습니다. 닫고 다시 열어 확인해 주세요.');return;}const title=$('#task-name').value.trim();if(!title)return;const due=$('#task-due').value;if(due&&!validDate(due)){toast('목표일을 확인해 주세요.');return;}const task={id:id||crypto.randomUUID(),title,axis:$('#task-axis').value,due,status:$('#task-status').value,note:$('#task-note').value,archived:t.archived===true,createdAt:t.createdAt||new Date().toISOString()};if(mutateState(next=>{const index=next.tasks.findIndex(x=>x.id===id);if(index>=0)next.tasks[index]=task;else next.tasks.push(task);})){draftStore.clear(draftKey);$('#task-dialog').close();render();toast(id?'실행 과제를 수정했습니다.':'새 실행 과제를 추가했습니다.');}});
  $('#task-dialog').showModal();
}
function openCustomProject(id){
  const existing=state.customProjects.find(p=>p.id===id),draftKey='custom:'+(id||'new'),draft=draftStore.read(draftKey)?.fields||{},expected=JSON.stringify(existing);
  const proposedAxis=draft['custom-axis']||existing?.axes[0]||(page==='strategy'?'strategy':'research');
  const axis=Object.hasOwn(PROJECT_GROUPS,proposedAxis)?proposedAxis:'research';
  const group=draft['custom-group']||existing?.groups[axis]||PROJECT_GROUPS[axis][0];
  const dialog=$('#task-dialog');dialog.innerHTML=`<div class="dialog-head"><h2 id="task-title">${id?'내 프로젝트 수정':'내 프로젝트 등록'}</h2><button class="icon-button" data-close-dialog aria-label="닫기">${icon('close')}</button></div><div class="dialog-content"><form id="custom-form"><label class="form-label" for="custom-name">프로젝트 이름</label><input id="custom-name" class="form-input" required maxlength="140" value="${E(existing?.title||'')}" placeholder="관리할 대시보드나 프로젝트 이름"><label class="form-label" for="custom-url">프로젝트 주소</label><input id="custom-url" class="form-input" required type="url" maxlength="2000" value="${E(existing?.url||'')}" placeholder="https://"><div class="field-row"><div><label class="form-label" for="custom-axis">연결할 축</label><select id="custom-axis" class="form-input"><option value="research" ${axis==='research'?'selected':''}>연구</option><option value="strategy" ${axis==='strategy'?'selected':''}>전략</option></select></div><div><label class="form-label" for="custom-group">분류</label><select id="custom-group" class="form-input">${PROJECT_GROUPS[axis].map(g=>'<option '+(g===group?'selected':'')+'>'+E(g)+'</option>').join('')}</select></div></div><label class="form-label" for="custom-desc">설명</label><textarea id="custom-desc" class="form-input" maxlength="1500" placeholder="무엇을 확인하는 프로젝트인가요?">${E(existing?.description||'')}</textarea><p class="helper">이 관리자 앱의 개인 목록에 추가합니다. 원본 홈페이지에는 게시되지 않습니다.</p><div class="dialog-actions"><button class="button" type="button" data-close-dialog>닫기</button><button class="button primary" type="submit">${id?'등록 정보 저장':'프로젝트 추가'}</button></div></form></div>`;
  $('#custom-axis').addEventListener('change',e=>{$('#custom-group').innerHTML=PROJECT_GROUPS[e.target.value].map(g=>'<option>'+E(g)+'</option>').join('');});
  bindDraft($('#custom-form'),draftKey,['custom-name','custom-url','custom-axis','custom-group','custom-desc']);
  $('#custom-form').addEventListener('submit',e=>{e.preventDefault();try{
    if(id&&JSON.stringify(state.customProjects.find(p=>p.id===id))!==expected)throw Error('다른 탭에서 등록 정보가 변경됐습니다. 닫고 다시 열어 확인해 주세요.');
    const axis=$('#custom-axis').value;const item=validateCustomProject({id:id||'custom-'+crypto.randomUUID(),title:$('#custom-name').value,url:$('#custom-url').value,description:$('#custom-desc').value,axes:[axis],groups:{[axis]:$('#custom-group').value}});
    if(catalog.projects.some(p=>p.url===item.url&&p.id!==id))throw Error('이미 등록된 주소입니다. 기존 프로젝트를 검색해 주세요.');
    if(mutateState(next=>{const i=next.customProjects.findIndex(p=>p.id===id);if(i>=0)next.customProjects[i]=item;else{next.customProjects.push(item);next.favorites.push(item.id);}})){draftStore.clear(draftKey);dialog.close();go(axis);toast(id?'등록 정보를 수정했습니다.':'내 프로젝트를 등록하고 즐겨찾기에 추가했습니다.');}
  }catch(error){toast(error.message);}});dialog.showModal();
}

function boardCard(t){
  return `<article class="board-task"><div class="board-card-top"><span class="tag ${t.axis==='research'?'blue':t.axis==='strategy'?'amber':''}">${t.axis==='operations'?'운영':axisLabel(t.axis)}</span>${t.archived?'<span class="tag">보관됨</span>':''}</div><button class="task-title" data-edit-task="${E(t.id)}">${E(t.title)}</button>${t.note?'<p>'+E(t.note)+'</p>':''}<div class="board-task-bottom">${deadlineBadge(t)}${!t.archived?`<select data-task-status="${E(t.id)}" aria-label="${E(t.title)} 진행 상태">${[['todo','할 일'],['doing','진행 중'],['done','완료']].map(([v,l])=>'<option value="'+v+'" '+(t.status===v?'selected':'')+'>'+l+'</option>').join('')}</select>`:''}</div><div class="board-card-actions">${t.archived?'<button class="text-link" data-unarchive-task="'+E(t.id)+'" aria-label="'+E(t.title)+' 복원">실행 보드로 복원</button>':'<button class="text-link" data-archive-task="'+E(t.id)+'" aria-label="'+E(t.title)+' 보관">보관하기</button>'}</div></article>`;
}
function renderBoardResults(){
  const tasks=selectBoardTasks(state.tasks,{...boardFilters,mode:boardMode},dateKST());
  const total=state.tasks.filter(t=>Boolean(t.archived)===(boardMode==='archived')).length;
  $('#board-result-count').textContent='표시 '+tasks.length+' / 전체 '+total+'개';
  $('#board-results').innerHTML=boardMode==='archived'?'<div class="project-grid">'+(tasks.length?tasks.map(boardCard).join(''):'<div class="panel empty">조건에 맞는 보관 과제가 없습니다.</div>')+'</div>':
  '<div class="board-grid">'+[['todo','할 일',''],['doing','진행 중','blue'],['done','완료','green']].map(([status,title,color])=>{const items=tasks.filter(t=>t.status===status);return '<section class="board-column"><h2><span class="pending-dot '+color+'"></span>'+title+'<span class="count">'+items.length+'</span></h2>'+(items.length?items.map(boardCard).join(''):'<div class="board-empty">조건에 맞는 과제가 없습니다.</div>')+'</section>';}).join('')+'</div>';
}
function renderBoard(){
  const active=state.tasks.filter(t=>!t.archived),archived=state.tasks.filter(t=>t.archived);
  const overdue=active.filter(t=>deadlineInfo(t,dateKST()).kind==='overdue').length,todayCount=active.filter(t=>deadlineInfo(t,dateKST()).kind==='today').length;
  $('#main').innerHTML=heading('FROM INSIGHT TO ACTION',boardMode==='archived'?'보관한 과제도 다시 이어가세요.':'다음 한 걸음에 집중하세요.','과제 제목과 메모를 검색하고, 목표일과 등록 순서로 정리하세요.',`<button class="button" data-board-mode="${boardMode==='archived'?'active':'archived'}">${boardMode==='archived'?'실행 보드로':'보관함 ('+archived.length+')'}</button><button class="button primary" data-new-task>${icon('plus')}과제 추가</button>`)+
  `<div class="board-searchbar"><div class="search-field">${icon('search')}<input type="search" id="board-search" aria-label="실행 과제 검색" placeholder="과제 제목·메모 검색" value="${E(boardFilters.search)}"></div><select id="board-sort" class="select" aria-label="실행 과제 정렬">${[['due','목표일 빠른순'],['recent','최근 등록순'],['title','이름순']].map(([v,l])=>'<option value="'+v+'" '+(boardFilters.sort===v?'selected':'')+'>'+l+'</option>').join('')}</select><button class="button" id="board-reset">조건 초기화</button></div>
  <div class="board-toolbar"><div class="board-due-summary"><span class="deadline overdue">기한 경과 ${overdue}</span><span class="deadline today">오늘 마감 ${todayCount}</span><span id="board-result-count" class="helper" role="status"></span></div><div class="board-filter-controls"><select class="select" id="board-axis" aria-label="실행 과제 영역">${[['all','모든 영역'],['research','연구'],['strategy','전략'],['operations','운영']].map(([v,l])=>'<option value="'+v+'" '+(boardFilters.axis===v?'selected':'')+'>'+l+'</option>').join('')}</select><select class="select" id="board-deadline" aria-label="실행 과제 목표일">${[['all','모든 목표일'],['overdue','기한 경과'],['today','오늘 마감'],['upcoming','예정된 과제'],['none','목표일 없음']].map(([v,l])=>'<option value="'+v+'" '+(boardFilters.deadline===v?'selected':'')+'>'+l+'</option>').join('')}</select></div></div><div id="board-results"></div><p class="catalog-note">검색은 과제 제목과 메모에 적용됩니다. 보관한 과제는 보관함에서 검색하고 다시 복원할 수 있습니다.</p>`;
  $('#board-search').addEventListener('input',e=>{boardFilters.search=e.target.value;renderBoardResults();});
  for(const [id,key] of [['board-axis','axis'],['board-deadline','deadline'],['board-sort','sort']])$('#'+id).addEventListener('change',e=>{boardFilters[key]=e.target.value;renderBoardResults();});
  $('#board-reset').addEventListener('click',()=>{boardFilters={axis:'all',deadline:'all',search:'',sort:'due'};renderBoard();$('#board-search').focus();});
  renderBoardResults();
}

const channels=[
  {title:'스타게이트 홈페이지',sub:'stargateedu.co.kr',logo:'✳',color:'',description:'교육·연구·전략 프로젝트를 연결하는 대표 포털입니다.',url:'https://stargateedu.co.kr/',action:'홈페이지 열기',source:'연구 64개 · 전략 44개 목록 반영'},
  {title:'스타게이트 앱',sub:'ANDROID · GOOGLE PLAY',logo:'S',color:'',description:'정보올림피아드·수학·연구 포털. 구글 플레이의 실제 등록 정보를 확인했습니다.',url:'https://play.google.com/store/apps/details?id=kr.co.stargateedu.twa',action:'Google Play에서 보기',source:'패키지 kr.co.stargateedu.twa · 확인 2026.10.30'},
  {title:'스타게이트 블로그',sub:'blog.stargateedu.co.kr',logo:'B.',color:'dark',description:'부동산·경제, 수학·AI, 정치·데이터를 잇는 지식·연구 아카이브입니다.',url:'https://blog.stargateedu.co.kr/',action:'블로그 열기',source:'웹 채널 확인 · 별도 블로그 앱 스토어 주소 미확인'},
  {title:'교육 쇼핑몰',sub:'shop.stargateedu.co.kr',logo:'E',color:'amber',description:'강의·교재·라이브 수업과 컨설팅 상품을 확인합니다.',url:'https://shop.stargateedu.co.kr/',action:'쇼핑몰 열기',source:'공식 홈페이지 연결 채널'},
  {title:'고객관리 · 문자',sub:'STARGATE CRM',logo:'C',color:'dark',description:'기존 운영자 고객관리 콘솔에서 상담과 문자 업무를 이어갑니다.',url:'https://stargate.stargate8225.workers.dev/sms/',action:'기존 관리 콘솔 열기',source:'콘솔 자체 인증 필요 · 발송 작업은 해당 서비스에서'},
  {title:'네이버 카페',sub:'COMMUNITY',logo:'N',color:'amber',description:'스타게이트 에듀 커뮤니티의 공지와 학습 콘텐츠를 살펴봅니다.',url:'https://cafe.naver.com/stargateedu',action:'카페 열기',source:'공식 블로그 연결 채널'}
];
function renderChannels(){
  $('#main').innerHTML=heading('ONE CONNECTED STARGATE','채널은 여럿, 시작점은 하나.','앱, 블로그, 교육과 고객 업무를 한곳에서 이어갑니다.',`<button class="button mobile-only" data-page="settings">${icon('settings')}설정</button>`)+`<section class="channels-grid" aria-label="스타게이트 서비스">${channels.map(c=>`<article class="channel-card"><div class="channel-card-head"><span class="channel-logo ${c.color}">${c.logo}</span><div><h2>${c.title}</h2><small>${c.sub}</small></div></div><p>${c.description}</p><div class="source-info">${c.source}</div>${external(c.url,c.action,'button')}</article>`).join('')}</section><section class="panel"><div class="panel-head"><div><h2>최근 블로그 콘텐츠 <span class="count">${catalog.posts.length}</span></h2><p class="panel-sub">목록 수집 ${E(catalog.blogCollectedAt)} · 원문은 각 채널에서 열립니다.</p></div>${external(catalog.sources.blog,'전체 블로그')}</div><div class="post-list">${catalog.posts.map(p=>`<article class="post-row"><time class="post-date" datetime="${E(p.date)}">${formatDate(p.date)}</time><div class="post-content">${external(p.url,E(p.title),'post-link')}<span class="tag">${E(p.channel)}</span></div></article>`).join('')}</div></section>`;
}
function exportData(){
  const blob=new Blob([JSON.stringify({app:'STARGATE Admin',exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='stargate-admin-backup-'+dateKST()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('메모·즐겨찾기·실행 과제를 백업했습니다.');
}
function renderSettings(){
  const reviewed=Object.values(state.projects).filter(m=>m.status!=='unreviewed').length;
  $('#main').innerHTML=heading('YOUR WORKSPACE, YOUR DATA','편하게 쓰고, 안전하게 보관하세요.','관리 기록과 원본 콘텐츠의 연결 방식을 확인합니다.')+`<div class="notice">${icon('info')}<div>즐겨찾기·메모·검토 상태·실행 과제는 <strong>현재 브라우저에 저장</strong>됩니다. 다른 기기로 옮길 때 JSON 백업과 복원을 사용하세요. 홈페이지와 블로그의 원문 수정·발행은 기존 서비스에서 진행합니다.</div></div><div class="settings-grid"><section class="panel"><div class="panel-head"><h2>내 관리 데이터</h2>${icon('layers')}</div><div class="settings-body"><div class="settings-row"><span>프로젝트 목록</span><strong>고유 ${catalog.projects.length}개</strong></div><div class="settings-row"><span>직접 등록한 프로젝트</span><strong>${state.customProjects.length}개</strong></div><div class="settings-row"><span>즐겨찾기</span><strong>${state.favorites.length}개</strong></div><div class="settings-row"><span>검토한 프로젝트</span><strong>${reviewed}개</strong></div><div class="settings-row"><span>실행 과제</span><strong>${state.tasks.length}개</strong></div><div class="settings-row"><span>저장 위치</span><strong>${storageWarning?'브라우저 저장 실패':'현재 브라우저 · localStorage'}</strong></div><div class="settings-actions"><button class="button primary" id="export-data">${icon('download')}JSON 백업</button><button class="button" id="import-data">${icon('upload')}파일로 복원</button><button class="button" id="paste-backup">백업 붙여넣기</button>${restoreAvailable()?'<button class="button" id="undo-restore">복원 전으로 되돌리기</button>':''}</div><p class="helper" style="margin-top:15px;margin-bottom:0">브라우저 데이터 삭제 시 관리 기록이 지워집니다. 정기적으로 백업해 보관하세요. 백업을 복원하면 직전 관리 기록을 자동 보관해 한 번 되돌릴 수 있습니다.</p></div></section><section class="panel"><div class="panel-head"><h2>자료와 연결 범위</h2>${icon('globe')}</div><div class="settings-body"><p>홈페이지에서 연구 64개, 전략 44개를 가져왔습니다. 두 허브에서 겹치는 링크 2개를 합쳐 원본 프로젝트는 ${baseProjects.length}개입니다. 원본에 표시된 출처와 설명을 함께 보관합니다.</p><div class="source-list">${external(catalog.sources.research,'연구 대시보드 원본')}${external(catalog.sources.strategy,'전략 대시보드 원본')}${external(catalog.sources.blog,'블로그 원본')}${external('https://play.google.com/store/apps/details?id=kr.co.stargateedu.twa','Google Play 등록 앱')}</div><div class="helper">목록 확인 ${catalog.sourceDate} · 실시간 API 상태, 조회 수, 매출, 원문 발행 기능은 연결되지 않았습니다. 목록은 이번 제작 시점의 저장본입니다.</div></div></section><section class="panel"><div class="panel-head"><h2>화면과 앱 사용</h2>${icon('phone')}</div><div class="settings-body"><div class="settings-row"><span>현재 테마</span><strong>${state.theme==='dark'?'다크':'라이트'} 모드</strong></div><div class="settings-row"><span>모바일</span><strong>하단 5개 메뉴 · 반응형</strong></div><p class="helper" style="margin-top:14px">지원 브라우저의 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 이용할 수 있습니다. 이 결과물은 웹 관리자 앱이며 Android 스토어 등록본은 아닙니다.</p><label class="form-label" for="reading-size">글자 크기</label><select class="form-input" id="reading-size"><option value="normal" ${state.preferences.textSize==='normal'?'selected':''}>기본</option><option value="large" ${state.preferences.textSize==='large'?'selected':''}>크게</option></select><button class="button" id="settings-theme" style="margin-top:14px">${icon(state.theme==='dark'?'sun':'moon')}테마 바꾸기</button><button class="button primary" data-install-app style="margin-top:14px">앱 설치 · 홈 화면 추가</button><button class="button" data-check-update style="margin-top:14px">새 버전 확인</button><div class="helper" id="install-hint">로그인 없이 사용할 수 있습니다. 관리 기록은 현재 기기의 브라우저에 저장됩니다.</div></div></section><section class="panel"><div class="panel-head"><h2>단순한 관리 구조</h2>${icon('research')}</div><div class="settings-body"><div class="settings-row"><span>오늘</span><strong>즐겨찾기와 실행 과제</strong></div><div class="settings-row"><span>연구</span><strong>관측 · 연구 · 교육 · 운영</strong></div><div class="settings-row"><span>전략</span><strong>기업 · 시장 · 실행 · 관측</strong></div><div class="settings-row"><span>실행</span><strong>할 일 → 진행 중 → 완료</strong></div><div class="settings-row"><span>채널</span><strong>홈페이지 · 앱 · 블로그 · 업무</strong></div></div></section></div>`;
}
function openSearch(){
  const dialog=$('#search-dialog');dialog.innerHTML=`<div class="search-field">${icon('search')}<input type="search" id="quick-search" aria-label="전체 프로젝트 검색어" placeholder="전체 프로젝트 ${catalog.projects.length}개에서 검색..."></div><div class="search-results" id="quick-results"></div><div class="search-help"><span>제목 · 설명 · 관리 메모 검색</span><button data-close-dialog>Esc 닫기</button></div>`;
  function results(){const q=$('#quick-search').value.trim().toLowerCase();const found=catalog.projects.filter(p=>(q?`${p.title} ${p.description} ${p.source} ${projectMeta(p).note}`.toLowerCase().includes(q):isFavorite(p))).slice(0,12);$('#quick-results').innerHTML=found.length?found.map(p=>`<button class="search-result" data-search-project="${p.id}">${projectSymbol(p)}<span><strong>${E(p.title)}</strong><small>${p.axes.map(axisLabel).join(' · ')} · ${E(Object.values(p.groups).join(' / '))}</small></span></button>`).join(''):'<div class="empty">검색 결과가 없습니다.</div>';}
  $('#quick-search').addEventListener('input',results);results();dialog.showModal();
}
function render(){nav();if(page==='today')renderToday();else if(['research','strategy','favorites'].includes(page))renderCatalog();else if(page==='board')renderBoard();else if(page==='channels')renderChannels();else renderSettings();}
function go(next){if(!Object.hasOwn(pages,next))next='today';if(page!==next)filters={search:'',group:'전체',status:'all',favorite:false,view:filters.view,page:1};page=next;if(location.hash.slice(1)!==page)location.hash=page;render();$('#main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
document.addEventListener('click',event=>{
  const el=event.target.closest('button,a');if(!el||!state)return;
  if(el.classList.contains('skip')){event.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});return;}
  if(el.dataset.page){go(el.dataset.page);return;}
  if(el.hasAttribute('data-close-dialog')){el.closest('dialog').close();return;}
  if(el.dataset.project){openProject(el.dataset.project);return;}
  if(el.dataset.searchProject){$('#search-dialog').close();openProject(el.dataset.searchProject);return;}
  if(el.dataset.favorite){const id=el.dataset.favorite;if(mutateState(next=>{next.favorites=next.favorites.includes(id)?next.favorites.filter(x=>x!==id):[...next.favorites,id];})){if(el.closest('#project-dialog'))el.innerHTML=icon('star')+(state.favorites.includes(id)?'즐겨찾기 해제':'즐겨찾기 추가');render();toast(state.favorites.includes(id)?'즐겨찾기에 추가했습니다.':'즐겨찾기에서 해제했습니다.');}return;}
  if(el.hasAttribute('data-new-task')){openTask();return;}
  if(el.hasAttribute('data-new-project')){openCustomProject();return;}
  if(el.dataset.editCustom){$('#project-dialog').close();openCustomProject(el.dataset.editCustom);return;}
  if(el.dataset.editTask){openTask(el.dataset.editTask);return;}
  if(el.dataset.taskFromProject){const p=catalog.projects.find(p=>p.id===el.dataset.taskFromProject);$('#project-dialog').close();openTask(null,p);return;}
  if(el.dataset.pinTab){pinTab=el.dataset.pinTab;renderToday();return;}
  if(el.dataset.taskTab){taskTab=el.dataset.taskTab;renderToday();return;}
  if(el.dataset.group){filters.group=el.dataset.group;filters.page=1;renderCatalog();return;}
  if(el.dataset.view){filters.view=el.dataset.view;renderCatalog();return;}
  if(el.dataset.pagination){filters.page+=Number(el.dataset.pagination);renderCatalogResults();$('#main').scrollIntoView({block:'start'});return;}
  if(el.hasAttribute('data-reset-filters')){filters={...filters,search:'',group:'전체',status:'all',favorite:false,page:1};renderCatalog();return;}
  if(el.id==='favorite-filter'){filters.favorite=!filters.favorite;filters.page=1;renderCatalog();return;}
  if(el.id==='theme-toggle'||el.id==='settings-theme'){if(mutateState(next=>{next.theme=next.theme==='dark'?'light':'dark';})){setTheme(state.theme);if(page==='settings')renderSettings();}return;}
  if(el.id==='export-data'){exportData();return;}
  if(el.id==='import-data'){$('#import-file').click();return;}
  if(el.id==='global-search'){openSearch();return;}
  if(el.id==='paste-backup'){openPasteBackup();return;}
  if(el.id==='undo-restore'){try{const previous=dataStore.restorePoint();if(previous)openRestoreConfirm(previous,'복원 전 자동 보관 기록',true);else toast('되돌릴 기록이 없습니다.');}catch{toast('되돌릴 기록을 읽지 못했습니다.');}return;}
  if(el.dataset.boardMode){boardMode=el.dataset.boardMode;boardFilters={axis:'all',deadline:'all',search:'',sort:'due'};renderBoard();return;}
  if(el.dataset.archiveTask||el.dataset.unarchiveTask){const id=el.dataset.archiveTask||el.dataset.unarchiveTask;const archived=!!el.dataset.archiveTask;if(mutateState(next=>{const t=next.tasks.find(x=>x.id===id);if(t)t.archived=archived;})){render();toast(archived?'과제를 보관했습니다. 보관함에서 복원할 수 있습니다.':'과제를 실행 보드로 복원했습니다.');}return;}
});
document.addEventListener('change',event=>{
  if(event.target.id==='reading-size'){const size=event.target.value;if(mutateState(next=>{next.preferences.textSize=size;})){setTheme(state.theme);renderSettings();$('#reading-size').focus();}return;}
  if(event.target.dataset.taskCheck){const id=event.target.dataset.taskCheck,status=event.target.checked?'done':'todo';const saved=mutateState(next=>{const t=next.tasks.find(x=>x.id===id);if(t)t.status=status;});render();if(saved)toast(status==='done'?'과제를 완료했습니다.':'과제를 할 일로 옮겼습니다.');}
  if(event.target.dataset.taskStatus){const id=event.target.dataset.taskStatus,status=event.target.value;mutateState(next=>{const t=next.tasks.find(x=>x.id===id);if(t)t.status=status;});renderBoard();}
});
function openRestoreConfirm(restored,label,undo=false){
  const dialog=$('#task-dialog');
  dialog.innerHTML=`<div class="dialog-head"><h2 id="task-title">${undo?'복원 전으로 되돌리기':'백업 복원 확인'}</h2><button class="icon-button" data-close-dialog aria-label="닫기">${icon('close')}</button></div><div class="dialog-content"><p class="description">${undo?'직전 백업 복원 이전의 관리 기록으로 돌아갑니다.':'현재 기록을 이 백업의 기록으로 교체합니다. 교체 전 기록은 자동 보관되어 설정에서 한 번 되돌릴 수 있습니다.'}</p><div class="restore-preview">${E(label)}<br>즐겨찾기 ${restored.favorites.length}개 · 프로젝트 기록 ${Object.keys(restored.projects).length}개 · 과제 ${restored.tasks.length}개</div><div class="dialog-actions"><button class="button" data-close-dialog>취소</button><button class="button primary" id="restore-confirm" type="button">${undo?'이전 기록으로 되돌리기':'이 백업으로 복원'}</button></div></div>`;
  $('#restore-confirm').addEventListener('click',()=>{
    try{adopted(undo?dataStore.undoRestore(state.revision):dataStore.restore(restored,state));setTheme(state.theme);dialog.close();render();toast(undo?'복원 전 관리 기록으로 되돌렸습니다.':'백업을 복원했습니다. 설정에서 되돌릴 수 있습니다.');}
    catch(error){saveFailed(error);}
  });
  if(!dialog.open)dialog.showModal();
}
function openPasteBackup(){
  const dialog=$('#task-dialog');dialog.innerHTML=`<div class="dialog-head"><h2 id="task-title">백업 붙여넣기</h2><button class="icon-button" data-close-dialog aria-label="닫기">${icon('close')}</button></div><div class="dialog-content"><form id="paste-backup-form"><label class="form-label" for="backup-json">백업 JSON 내용</label><textarea class="form-input backup-textarea" id="backup-json" required spellcheck="false" placeholder="JSON 백업 파일의 전체 내용을 붙여넣으세요."></textarea><p class="helper">이 브라우저 안에서 검사합니다. 확인 버튼을 누르기 전에는 현재 기록이 바뀌지 않습니다.</p><div class="dialog-actions"><button class="button" data-close-dialog type="button">취소</button><button class="button primary" type="submit">내용 검사</button></div></form></div>`;
  $('#paste-backup-form').addEventListener('submit',e=>{e.preventDefault();try{openRestoreConfirm(parseBackup($('#backup-json').value,baseProjects.map(p=>p.id)),'붙여넣은 백업');}catch(error){toast(error.message);}});dialog.showModal();
}
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>5*1024*1024)throw Error('5MB 이하의 JSON 백업을 사용해 주세요.');openRestoreConfirm(parseBackup(await file.text(),baseProjects.map(p=>p.id)),file.name);}
  catch(error){toast(error.message||'백업 파일을 읽을 수 없습니다.');}
  finally{event.target.value='';}
});

$('#search-dialog').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();$('#search-dialog').close();}
},true);
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(state&&!$$('dialog[open]').length)openSearch();}});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(page!==next)go(next);});
window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY&&event.newValue){try{state=validateState(JSON.parse(event.newValue));rebuildCatalog();setTheme(state.theme);if(!$$('dialog[open]').length)render();}catch{toast('다른 탭의 기록을 읽지 못했습니다.');}}});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();window.stargateInstallPrompt=event;});
async function init(){
  icons(document);
  try{const response=await fetch('./catalog.json');if(!response.ok)throw Error('목록을 읽지 못했습니다.');catalog=await response.json();baseProjects=[...catalog.projects];state=validateState(initialState());draftStore=createDraftStore(sessionStorage);dataStore=createDataStore(localStorage,baseProjects.map(p=>p.id));try{const saved=dataStore.load();if(saved)state=saved;}catch{toast('기존 저장 기록을 읽지 못했습니다. 설정에서 백업을 복원해 주세요.');}rebuildCatalog();setTheme(state.theme);go(location.hash.slice(1)||'today');}
  catch(error){$('#main').innerHTML=`<div class="empty"><h1>목록을 불러오지 못했습니다.</h1><p>${E(error.message)} 페이지를 새로 열어주세요.</p></div>`;}
}
init();

async function installAdminApp(){
  if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone){toast('이미 앱 모드로 실행 중입니다.');return;}
  const prompt=window.stargateInstallPrompt;
  if(prompt){try{await prompt.prompt();const choice=await prompt.userChoice;window.stargateInstallPrompt=null;toast(choice.outcome==='accepted'?'앱 설치를 요청했습니다.':'브라우저 메뉴에서도 앱을 설치할 수 있습니다.');return;}catch{window.stargateInstallPrompt=null;}}
  const dialog=document.querySelector('#task-dialog');
  dialog.innerHTML='<div class="dialog-head"><h2 id="task-title">앱 설치 · 홈 화면 추가</h2><button class="icon-button" data-close-dialog aria-label="닫기">'+icon('close')+'</button></div><div class="dialog-content"><p class="description">주소를 일반 Chrome 또는 Safari에서 열어 설치하세요.</p><div class="source-box"><strong>안드로이드 · Chrome</strong><p>오른쪽 위 ⋮ 메뉴 → 설치 및 바로가기 만들기 → 설치 또는 홈 화면에 추가</p><strong>아이폰 · Safari</strong><p>공유 → 홈 화면에 추가 → 웹 앱으로 열기 → 추가</p><strong>PC · Chrome / Edge</strong><p>주소창의 앱 설치 아이콘 또는 브라우저 메뉴의 앱 설치를 선택하세요.</p></div><p class="helper">관리 기록은 기기마다 따로 저장됩니다. 다른 기기로 옮길 때는 설정의 JSON 백업·복원을 사용하세요.</p></div>';
  dialog.showModal();
}
document.addEventListener('click',event=>{if(event.target.closest('[data-install-app]'))installAdminApp();});
window.addEventListener('appinstalled',()=>{window.stargateInstallPrompt=null;toast('스타게이트 관리자 앱을 설치했습니다.');});
let appRegistration,applyingUpdate=false;
function connectionStatus(){const el=$('#connection-state');el.textContent=navigator.onLine?'온라인':'오프라인 · 저장된 앱 사용';el.classList.toggle('offline',!navigator.onLine);}
connectionStatus();window.addEventListener('online',connectionStatus);window.addEventListener('offline',connectionStatus);
function showAppUpdate(){if(appRegistration?.waiting)$('#update-notice').hidden=false;}
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applyingUpdate)location.reload();});
  window.addEventListener('load',async()=>{try{appRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});showAppUpdate();appRegistration.addEventListener('updatefound',()=>{const worker=appRegistration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showAppUpdate();});});}catch{}});
}
$('#apply-update').addEventListener('click',()=>{if($('dialog[open]')){toast('작성 중인 창을 닫은 뒤 업데이트를 적용해 주세요. 작성 초안은 보관됩니다.');return;}if(!appRegistration?.waiting)return;applyingUpdate=true;appRegistration.waiting.postMessage({type:'SKIP_WAITING'});});
document.addEventListener('click',async event=>{if(!event.target.closest('[data-check-update]'))return;if(!navigator.onLine){toast('인터넷에 연결한 뒤 새 버전을 확인해 주세요.');return;}if(!appRegistration){toast('앱 준비가 끝난 뒤 다시 확인해 주세요.');return;}try{await appRegistration.update();showAppUpdate();toast(appRegistration.waiting?'새 버전이 준비됐습니다. 업데이트 적용을 눌러주세요.':appRegistration.installing?'업데이트 파일을 준비하고 있습니다.':'현재 앱이 최신 버전입니다.');}catch{toast('새 버전을 확인하지 못했습니다. 인터넷 연결을 확인해 주세요.');}});
