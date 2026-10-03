(() => {
  'use strict';

  const REPO = 'DongsooJung/dongsoojung.github.io';
  const API = 'https://api.github.com/repos/' + REPO;
  const COMMITS_API = API + '/commits?per_page=60';
  const PAGES_RUNS_API = API + '/actions/workflows/242321278/runs?branch=main&per_page=100';
  const VERCEL_RUNS_API = API + '/actions/workflows/vercel-production.yml/runs?branch=main&per_page=100';
  const FULL_LIMIT = 45;
  const PREVIEW_LIMIT = 6;
  const META_TTL = 1000 * 60 * 60 * 24 * 14;
  const DEPLOY_TTL = 1000 * 60 * 5;

  const fallback = [
    {sha:'fe90ace4d05c15c0b6ee76fc348e1a8512ac3757',message:'chore(sitemap): add developer work log',date:'2026-10-03T06:20:12Z'},
    {sha:'022491d99f6ec4fd2787712f292c8c08387d4401',message:'feat(home): show recent developer log on main',date:'2026-10-03T06:20:10Z'},
    {sha:'a9259ec05b790b354f4d4b668159316daa682e0b',message:'feat(dev-log): upgrade work log to live developer log',date:'2026-10-03T06:20:07Z'},
    {sha:'f955dd619ff983d1f336aecb9a40489e9c488b84',message:'feat(dev-log): add live GitHub log renderer',date:'2026-10-03T06:20:04Z'},
    {sha:'724a58ea16293044d0b3e317439be7a7ef1cbbea',message:'feat: add main and list dashboard view toggle',date:'2026-10-03T06:18:20Z'},
    {sha:'7393519758d022a2b60b945d7bad6063c539c5a6',message:'chore(google-trends): 급상승 검색어 상위 100 자동 갱신',date:'2026-10-03T06:11:00Z'},
    {sha:'47c6cb6bbc353e1f8671b98e4b187c872b3caba4',message:'data: update Naver Cafe popular articles',date:'2026-10-03T05:42:18Z'},
    {sha:'f71d31ed9e9888703ae63f4468373e027ff1ab61',message:'data: update daily used-car market',date:'2026-10-03T05:38:39Z'}
  ].map(x=>({...x,html_url:'https://github.com/'+REPO+'/commit/'+x.sha}));

  const labels={HOME:'HOME',RESEARCH:'RESEARCH',STRATEGY:'STRATEGY',DATA:'DATA',OPS:'OPS'};

  function injectStyle(){
    if(document.getElementById('developer-log-style')) return;
    const style=document.createElement('style');
    style.id='developer-log-style';
    style.textContent=\`
      .devlog-panel{border:1px solid var(--line,#263452);background:linear-gradient(180deg,var(--panel2,#111c33),var(--panel,#0f172a));border-radius:18px;padding:20px;overflow:hidden}
      .devlog-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:12px}
      .devlog-head h3{margin:0;font-size:1.08rem;letter-spacing:-.02em}.devlog-head p{margin:4px 0 0;color:var(--sub,#9aa7b8);font-size:12px}
      .devlog-live{display:inline-flex;align-items:center;gap:7px;color:var(--good,#63d6a0);font:700 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
      .devlog-live::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
      .devlog-list{display:grid}
      .devlog-entry{border-top:1px solid var(--line,#263452)}.devlog-entry:first-child{border-top:0}
      .devlog-row{display:grid;grid-template-columns:105px 82px minmax(170px,1fr) 126px 136px 112px;gap:9px;align-items:center;padding:11px 0}
      .devlog-row:first-child{border-top:0}.devlog-date{color:var(--muted,#6b7a90);font:600 10.5px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}
      .devlog-kind{justify-self:start;border:1px solid var(--line2,#263452);border-radius:999px;padding:4px 7px;color:var(--acc,#7aa2ff);font:800 9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em}
      .devlog-message{min-width:0;color:var(--ink,#e6edf3);font-size:12.5px;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .devlog-stats{display:flex;gap:6px;align-items:center;justify-content:flex-end;white-space:nowrap;font:700 9.5px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace}
      .devlog-files{color:var(--sub,#9aa7b8)}.devlog-add{color:var(--good,#63d6a0)}.devlog-del{color:#ff7a8a}
      .devlog-deploys{display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      .devlog-deploy{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line2,#263452);border-radius:999px;padding:4px 6px;color:var(--muted,#6b7a90);font:800 8.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;text-decoration:none}
      .devlog-deploy:hover{text-decoration:none;border-color:var(--acc,#7aa2ff)}
      .devlog-deploy.success{color:var(--good,#63d6a0);border-color:rgba(99,214,160,.28)}
      .devlog-deploy.failure{color:#ff7a8a;border-color:rgba(255,122,138,.28)}
      .devlog-deploy.pending{color:#ffb86b;border-color:rgba(255,184,107,.28)}
      .devlog-actions{display:flex;justify-content:flex-end;align-items:center;gap:6px}.devlog-sha{color:var(--muted,#6b7a90);font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace}.devlog-sha:hover{color:var(--acc,#7aa2ff)}
      .devlog-expand{border:1px solid var(--line2,#263452);border-radius:7px;background:rgba(122,162,255,.06);color:var(--acc,#7aa2ff);padding:5px 7px;font:800 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}.devlog-expand:hover,.devlog-expand[aria-expanded="true"]{border-color:var(--acc,#7aa2ff);background:rgba(122,162,255,.14)}
      .devlog-detail{padding:0 0 14px 187px}.devlog-detail[hidden]{display:none}
      .devlog-file{border:1px solid var(--line,#263452);border-radius:10px;margin:7px 0;background:rgba(0,0,0,.12);overflow:hidden}
      .devlog-file-head{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 10px;font:700 10px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}.devlog-file-path{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink,#e6edf3)}.devlog-file-meta{white-space:nowrap;color:var(--sub,#9aa7b8)}
      .devlog-file-status{display:inline-flex;min-width:18px;justify-content:center;border:1px solid var(--line2,#263452);border-radius:5px;padding:2px 4px;color:var(--acc,#7aa2ff);font-size:8px}
      .devlog-patch{margin:0;border-top:1px solid var(--line,#263452);padding:9px 10px;overflow:auto;max-height:260px;background:rgba(0,0,0,.22);font:500 9.5px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--sub,#9aa7b8);white-space:pre}.devlog-patch .add{color:var(--good,#63d6a0)}.devlog-patch .del{color:#ff8b98}.devlog-patch .hunk{color:var(--acc,#7aa2ff)}
      .devlog-detail-foot{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:8px;color:var(--muted,#6b7a90);font-size:10px}.devlog-detail-foot a{font-weight:700}
      .devlog-more{display:inline-flex;margin-top:12px;font-size:12px;font-weight:700}
      .devlog-toolbar{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 16px}.devlog-filter{border:1px solid var(--line2,#263452);border-radius:999px;background:var(--panel,#0f172a);color:var(--sub,#9aa7b8);padding:7px 10px;font:700 11px/1 inherit;cursor:pointer}
      .devlog-filter[aria-pressed="true"]{border-color:var(--acc,#7aa2ff);color:var(--ink,#e6edf3);background:rgba(122,162,255,.12)}
      .devlog-day{margin:22px 0 8px;color:var(--ink,#e6edf3);font-size:14px;font-weight:800}.devlog-day small{color:var(--muted,#6b7a90);font:600 10px ui-monospace,SFMono-Regular,Menlo,monospace;margin-left:7px}
      .devlog-empty{padding:16px 0 4px;color:var(--muted,#6b7a90);text-align:center;font-size:12px}
      .devlog-loading{opacity:.72}
      @media(max-width:980px){.devlog-row{grid-template-columns:88px 76px minmax(0,1fr) 116px 102px}.devlog-deploys{grid-column:3/5;justify-content:flex-start}.devlog-actions{grid-column:5}.devlog-detail{padding-left:164px}}
      @media(max-width:720px){.devlog-row{grid-template-columns:82px 74px minmax(0,1fr)}.devlog-sha{display:none}.devlog-message{white-space:normal}.devlog-stats{grid-column:2/4;justify-content:flex-start}.devlog-deploys{grid-column:2/4;justify-content:flex-start}.devlog-actions{grid-column:2/4;justify-content:flex-start}.devlog-detail{padding-left:0}.devlog-head{align-items:flex-start}.devlog-file-head{align-items:flex-start;flex-direction:column}}
    \`;
    document.head.appendChild(style);
  }

  function messageKind(message){
    const m=String(message||'').toLowerCase();
    if(/research|연구|airport|aviation|climate|quantum|disease|urban|gis|tourism|kmo|math|science/.test(m)) return 'RESEARCH';
    if(/strategy|전략|commerce|financial|market|job|tutoring|airbnb|used-car|monetization|rest-area|auction|bid/.test(m)) return 'STRATEGY';
    if(/homepage|home page|main|portal|language|mobile|aphorism|busan|travel|guide|nav|dashboard view/.test(m)) return 'HOME';
    if(/^data[:(]|archive|collector|snapshot|sync|crawl|refresh|update daily/.test(m)) return 'DATA';
    return 'OPS';
  }

  function pathKind(paths,message){
    const ps=paths||[];
    if(ps.some(p=>p.startsWith('research/'))) return 'RESEARCH';
    if(ps.some(p=>p.startsWith('strategy/'))) return 'STRATEGY';
    if(ps.some(p=>p==='index.html'||p.startsWith('en/')||p.startsWith('busan-guide/')||p.startsWith('gangnam-guide/')||p.startsWith('dumulmeori/'))) return 'HOME';
    if(ps.some(p=>/^(data|scripts|supabase)\//.test(p))) return 'DATA';
    return messageKind(message);
  }

  function normalize(item){
    const commit=item.commit||{};
    const message=String(commit.message||item.message||'').split('\n')[0].trim();
    return {
      sha:item.sha||'',message,
      date:commit.committer?.date||commit.author?.date||item.date||item.created_at||new Date().toISOString(),
      html_url:item.html_url||('https://github.com/'+REPO+'/commit/'+(item.sha||'')),
      kind:item.kind||messageKind(message),
      files_changed:item.files_changed??null,
      additions:item.additions??null,
      deletions:item.deletions??null,
      paths:item.paths||[],
      file_details:item.file_details||[],
      deploy:item.deploy||{}
    };
  }

  function kstParts(date){
    const d=new Date(date);
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
    const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
    return {day,time};
  }

  function esc(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}

  function cacheGet(key,ttl){
    try{
      const raw=localStorage.getItem(key); if(!raw) return null;
      const obj=JSON.parse(raw); if(!obj||Date.now()-obj.savedAt>ttl) return null;
      return obj.value;
    }catch(_){return null;}
  }
  function cacheSet(key,value){try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),value}));}catch(_){}}

  async function jsonFetch(url){
    const r=await fetch(url,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
    if(!r.ok) throw new Error('github_'+r.status);
    return r.json();
  }

  async function loadCommits(){
    try{
      const p=await jsonFetch(COMMITS_API);
      if(!Array.isArray(p)||!p.length) throw new Error('github_empty');
      return {items:p.filter(x=>!String(x.commit?.message||'').includes('[devlog-data]')).map(normalize),source:'github'};
    }catch(e){
      console.warn('Developer log list fallback:',e);
      return {items:fallback.map(normalize),source:'fallback'};
    }
  }

  function runState(run){
    if(!run) return null;
    if(run.status!=='completed') return {state:'pending',text:'…',url:run.html_url};
    if(run.conclusion==='success') return {state:'success',text:'✓',url:run.html_url};
    return {state:'failure',text:'×',url:run.html_url};
  }

  async function loadDeployments(){
    const cached=cacheGet('stargate:devlog:deployments',DEPLOY_TTL);
    if(cached) return cached;
    const map={};
    const attach=(runs,key)=>{
      for(const run of runs||[]){
        if(!run.head_sha||map[run.head_sha]?.[key]) continue;
        map[run.head_sha]=map[run.head_sha]||{};
        map[run.head_sha][key]=runState(run);
      }
    };
    try{
      const [pages,vercel]=await Promise.allSettled([jsonFetch(PAGES_RUNS_API),jsonFetch(VERCEL_RUNS_API)]);
      if(pages.status==='fulfilled') attach(pages.value.workflow_runs,'pages');
      if(vercel.status==='fulfilled') attach(vercel.value.workflow_runs,'vercel');
      cacheSet('stargate:devlog:deployments',map);
    }catch(e){console.warn('Deployment status unavailable:',e);}
    return map;
  }

  async function commitMeta(sha){
    const key='stargate:devlog:meta:v2:'+sha;
    const cached=cacheGet(key,META_TTL); if(cached) return cached;
    const p=await jsonFetch(API+'/commits/'+encodeURIComponent(sha));
    const files=Array.isArray(p.files)?p.files:[];
    const value={
      files_changed:files.length,
      additions:files.reduce((s,f)=>s+Number(f.additions||0),0),
      deletions:files.reduce((s,f)=>s+Number(f.deletions||0),0),
      paths:files.map(f=>f.filename).filter(Boolean),
      file_details:files.slice(0,12).map(f=>({
        filename:f.filename||'',
        status:f.status||'modified',
        additions:Number(f.additions||0),
        deletions:Number(f.deletions||0),
        patch:typeof f.patch==='string'?f.patch.slice(0,3200):''
      }))
    };
    cacheSet(key,value);
    return value;
  }

  async function mapLimit(list,limit,worker){
    const out=new Array(list.length); let next=0;
    async function run(){while(true){const i=next++;if(i>=list.length)break;try{out[i]=await worker(list[i],i);}catch(e){out[i]=null;}}}
    await Promise.all(Array.from({length:Math.min(limit,list.length)},run));
    return out;
  }

  async function enrich(items,deployments){
    const metas=await mapLimit(items,4,c=>commitMeta(c.sha));
    items.forEach((c,i)=>{
      const m=metas[i];
      if(m){Object.assign(c,m);c.kind=pathKind(m.paths,c.message);}
      c.deploy=deployments[c.sha]||{};
    });
    return items;
  }

  function deployBadge(label,d){
    if(!d) return '';
    return '<a class="devlog-deploy '+esc(d.state)+'" href="'+esc(d.url||'#')+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' '+esc(d.text||'')+'</a>';
  }

  function statusCode(status){return ({added:'A',removed:'D',renamed:'R',modified:'M',changed:'M',copied:'C'}[status]||'M');}

  function patchHtml(patch){
    if(!patch) return '<div class="devlog-patch">patch preview unavailable (binary, large file, or GitHub omitted it)</div>';
    const lines=String(patch).split('\n').slice(0,24);
    return '<pre class="devlog-patch">'+lines.map(line=>{
      const cls=line.startsWith('@@')?'hunk':(line.startsWith('+')&&!line.startsWith('+++'))?'add':(line.startsWith('-')&&!line.startsWith('---'))?'del':'';
      return '<span class="'+cls+'">'+esc(line)+'</span>';
    }).join('\n')+'</pre>';
  }

  function detailHtml(c){
    const files=Array.isArray(c.file_details)?c.file_details:[];
    if(!files.length) return '<div class="devlog-empty">상세 diff를 불러오지 못했습니다.</div>';
    const shown=files.slice(0,8);
    const body=shown.map(f=>'<div class="devlog-file"><div class="devlog-file-head"><span class="devlog-file-path"><span class="devlog-file-status">'+statusCode(f.status)+'</span> '+esc(f.filename)+'</span><span class="devlog-file-meta"><span class="devlog-add">+'+Number(f.additions||0).toLocaleString('en-US')+'</span> · <span class="devlog-del">-'+Number(f.deletions||0).toLocaleString('en-US')+'</span></span></div>'+patchHtml(f.patch)+'</div>').join('');
    const more=Number(c.files_changed||0)>shown.length?'외 '+(Number(c.files_changed)-shown.length)+'개 파일':'표시 '+shown.length+'개 파일';
    return body+'<div class="devlog-detail-foot"><span>'+esc(more)+' · 핵심 diff 최대 24줄/파일</span><a href="'+esc(c.html_url)+'" target="_blank" rel="noopener noreferrer">GitHub에서 전체 diff 보기 ↗</a></div>';
  }

  const commitIndex=new Map();

  async function toggleDetail(button){
    const entry=button.closest('.devlog-entry');if(!entry)return;
    const sha=entry.dataset.sha,detail=entry.querySelector('.devlog-detail');
    const open=button.getAttribute('aria-expanded')==='true';
    if(open){button.setAttribute('aria-expanded','false');button.textContent='DIFF ▾';detail.hidden=true;return;}
    button.setAttribute('aria-expanded','true');button.textContent='DIFF ▴';detail.hidden=false;
    let c=commitIndex.get(sha);
    if(!c){detail.innerHTML='<div class="devlog-empty">커밋 정보를 찾지 못했습니다.</div>';return;}
    if(!Array.isArray(c.file_details)||!c.file_details.length){
      detail.innerHTML='<div class="devlog-empty">diff 불러오는 중…</div>';
      try{const m=await commitMeta(sha);Object.assign(c,m);c.kind=pathKind(c.paths,c.message);}catch(e){detail.innerHTML='<div class="devlog-empty">GitHub diff를 불러오지 못했습니다.</div>';return;}
    }
    detail.innerHTML=detailHtml(c);
  }

  function bindDiffEvents(){
    if(document.documentElement.dataset.devlogDiffBound)return;
    document.documentElement.dataset.devlogDiffBound='1';
    document.addEventListener('click',e=>{
      const button=e.target.closest?.('.devlog-expand');if(!button)return;
      e.preventDefault();toggleDetail(button);
    });
  }

  function rowHtml(c,showDay=true){
    const t=kstParts(c.date);
    const hasStats=Number.isFinite(c.files_changed);
    const stats=hasStats
      ? '<div class="devlog-stats"><span class="devlog-files">'+c.files_changed+' files</span><span class="devlog-add">+'+Number(c.additions||0).toLocaleString('en-US')+'</span><span class="devlog-del">-'+Number(c.deletions||0).toLocaleString('en-US')+'</span></div>'
      : '<div class="devlog-stats devlog-loading"><span class="devlog-files">stats…</span></div>';
    const deploys='<div class="devlog-deploys">'+deployBadge('PAGES',c.deploy?.pages)+deployBadge('VERCEL',c.deploy?.vercel)+'</div>';
    commitIndex.set(c.sha,c);
    return '<div class="devlog-entry" data-sha="'+esc(c.sha)+'" data-kind="'+esc(c.kind)+'"><div class="devlog-row">'+
      '<div class="devlog-date">'+(showDay?t.day+'<br>':'')+t.time+' KST</div>'+
      '<span class="devlog-kind">'+esc(labels[c.kind]||c.kind)+'</span>'+
      '<div class="devlog-message" title="'+esc(c.message)+'">'+esc(c.message)+'</div>'+
      stats+deploys+
      '<div class="devlog-actions"><a class="devlog-sha" href="'+esc(c.html_url)+'" target="_blank" rel="noopener noreferrer">'+esc(c.sha.slice(0,7))+' ↗</a><button class="devlog-expand" type="button" data-sha="'+esc(c.sha)+'" aria-expanded="false">DIFF ▾</button></div>'+
      '</div><div class="devlog-detail" hidden></div></div>';
  }

  let fullSelected='ALL';
  function renderPreview(items,source){
    let section=document.getElementById('developer-log-preview');
    if(!section){
      const target=document.getElementById('intelligence')||document.querySelector('.hero');
      if(!target||!target.parentNode)return;
      section=document.createElement('section');section.className='sec';section.id='developer-log-preview';
      target.insertAdjacentElement('afterend',section);
    }
    section.innerHTML='<div class="devlog-panel"><div class="devlog-head"><div><h3>개발자 로그 · Developer Log</h3><p>변경 파일·라인 증감·Pages/Vercel 배포 상태와 핵심 diff까지 실제 GitHub 이력으로 표시합니다.</p></div><span class="devlog-live">'+(source==='github'?'LIVE · GITHUB':'RECENT CACHE')+'</span></div><div class="devlog-list">'+items.slice(0,PREVIEW_LIMIT).map(c=>rowHtml(c,true)).join('')+'</div><a class="devlog-more" href="/work-log/">전체 작업 로그 보기 →</a></div>';
  }

  function renderFull(items,source){
    const root=document.getElementById('developer-log-full');if(!root)return;
    root.innerHTML='<div class="devlog-toolbar" role="group" aria-label="작업 로그 필터">'+['ALL','HOME','RESEARCH','STRATEGY','DATA','OPS'].map(k=>'<button class="devlog-filter" type="button" data-filter="'+k+'" aria-pressed="'+(k===fullSelected?'true':'false')+'">'+k+'</button>').join('')+'</div><div id="developer-log-list"></div><div class="devlog-empty" id="developer-log-status"></div>';
    const list=root.querySelector('#developer-log-list'),status=root.querySelector('#developer-log-status');
    const draw=()=>{
      const filtered=items.filter(c=>fullSelected==='ALL'||c.kind===fullSelected).slice(0,FULL_LIMIT);
      let lastDay='',html='';
      for(const c of filtered){const t=kstParts(c.date);if(t.day!==lastDay){lastDay=t.day;html+='<div class="devlog-day">'+esc(t.day)+'<small>KST</small></div>';}html+=rowHtml(c,false);}
      list.innerHTML=html||'<div class="devlog-empty">해당 분류의 기록이 없습니다.</div>';
      status.textContent=(source==='github'?'GitHub main 자동 반영':'최근 캐시 표시')+' · 최근 '+filtered.length+'건 · 변경량/배포 상태 자동 조회 · Asia/Seoul';
    };
    root.querySelectorAll('.devlog-filter').forEach(btn=>btn.addEventListener('click',()=>{fullSelected=btn.dataset.filter;root.querySelectorAll('.devlog-filter').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));draw();}));
    draw();
  }

  async function init(){
    injectStyle();
    bindDiffEvents();
    const {items,source}=await loadCommits();
    const isFull=document.body.hasAttribute('data-devlog-page');
    if(isFull) renderFull(items,source); else renderPreview(items,source);

    const deployments=await loadDeployments();
    const targetItems=items.slice(0,isFull?FULL_LIMIT:PREVIEW_LIMIT);
    await enrich(targetItems,deployments);

    if(isFull) renderFull(items,source); else renderPreview(items,source);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();