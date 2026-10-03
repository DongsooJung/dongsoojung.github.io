(() => {
  'use strict';
  const REPO = 'DongsooJung/dongsoojung.github.io';
  const API = 'https://api.github.com/repos/' + REPO + '/commits?per_page=100';
  const FULL_LIMIT = 60;
  const PREVIEW_LIMIT = 6;
  const fallback = [
    {sha:'724a58ea16293044d0b3e317439be7a7ef1cbbea',message:'feat: add main and list dashboard view toggle',date:'2026-10-03T06:18:20Z'},
    {sha:'7393519758d022a2b60b945d7bad6063c539c5a6',message:'chore(google-trends): 급상승 검색어 상위 100 자동 갱신',date:'2026-10-03T06:11:00Z'},
    {sha:'47c6cb6bbc353e1f8671b98e4b187c872b3caba4',message:'data: update Naver Cafe popular articles',date:'2026-10-03T05:42:18Z'},
    {sha:'f71d31ed9e9888703ae63f4468373e027ff1ab61',message:'data: update daily used-car market',date:'2026-10-03T05:38:39Z'},
    {sha:'2d235a2177f05e972f9ce2ec1756939c6661997a',message:'data: archive CLASS101 recommendations 2026-10-03',date:'2026-10-03T05:35:58Z'},
    {sha:'7db9f3abe5916788b4a1b91e50bbb0e772d58270',message:'Refresh Busan Airbnb candidate ranking',date:'2026-10-03T05:33:39Z'},
    {sha:'c57a9d4293e446f029d571034e2c57bef517e5d7',message:'data: update tutoring strategy dashboard',date:'2026-10-03T05:21:11Z'},
    {sha:'6648cb01278b7830dc95dd1a4eb211c82091d9ba',message:'data(strategy): refresh expressway rest-area opportunities',date:'2026-10-03T05:16:26Z'},
    {sha:'62d166abd20429c379dde9f1a277f83a100d4d4e',message:'Add direction-over-speed maxim to aphorism dashboard',date:'2026-10-03T04:51:53Z'},
    {sha:'8e7d7fcaafefd8b594cc315b95dfc1812653cfc5',message:'fix(gh): restore notice collection, API routing and daily Supabase verification',date:'2026-10-03T03:37:47Z'},
    {sha:'3f045f73e55a8f7920f796e97a9e642e01a02706',message:'Add source-linked bilingual Busan travel guide and two-day route',date:'2026-10-03T02:36:25Z'},
    {sha:'5dd91462f113a753743179cf9cce49f377a4a8a3',message:'fix: make Korean and English language switch visible on mobile',date:'2026-10-03T02:08:50Z'}
  ].map(x => ({...x, html_url:'https://github.com/' + REPO + '/commit/' + x.sha}));
  const labels = {HOME:'HOME',RESEARCH:'RESEARCH',STRATEGY:'STRATEGY',DATA:'DATA',OPS:'OPS'};

  function injectStyle() {
    if (document.getElementById('developer-log-style')) return;
    const style = document.createElement('style');
    style.id = 'developer-log-style';
    style.textContent = \`
      .devlog-panel{border:1px solid var(--line,#263452);background:linear-gradient(180deg,var(--panel2,#111c33),var(--panel,#0f172a));border-radius:18px;padding:20px;overflow:hidden}
      .devlog-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:12px}
      .devlog-head h3{margin:0;font-size:1.08rem;letter-spacing:-.02em}.devlog-head p{margin:4px 0 0;color:var(--sub,#9aa7b8);font-size:12px}
      .devlog-live{display:inline-flex;align-items:center;gap:7px;color:var(--good,#63d6a0);font:700 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
      .devlog-live::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
      .devlog-list{display:grid}.devlog-row{display:grid;grid-template-columns:116px 88px minmax(0,1fr) 74px;gap:10px;align-items:center;padding:11px 0;border-top:1px solid var(--line,#263452)}
      .devlog-row:first-child{border-top:0}.devlog-date{color:var(--muted,#6b7a90);font:600 10.5px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}
      .devlog-kind{justify-self:start;border:1px solid var(--line2,#263452);border-radius:999px;padding:4px 7px;color:var(--acc,#7aa2ff);font:800 9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em}
      .devlog-message{min-width:0;color:var(--ink,#e6edf3);font-size:12.5px;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .devlog-sha{justify-self:end;color:var(--muted,#6b7a90);font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace}.devlog-sha:hover{color:var(--acc,#7aa2ff)}
      .devlog-more{display:inline-flex;margin-top:12px;font-size:12px;font-weight:700}
      .devlog-toolbar{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 16px}.devlog-filter{border:1px solid var(--line2,#263452);border-radius:999px;background:var(--panel,#0f172a);color:var(--sub,#9aa7b8);padding:7px 10px;font:700 11px/1 inherit;cursor:pointer}
      .devlog-filter[aria-pressed="true"]{border-color:var(--acc,#7aa2ff);color:var(--ink,#e6edf3);background:rgba(122,162,255,.12)}
      .devlog-day{margin:22px 0 8px;color:var(--ink,#e6edf3);font-size:14px;font-weight:800}.devlog-day small{color:var(--muted,#6b7a90);font:600 10px ui-monospace,SFMono-Regular,Menlo,monospace;margin-left:7px}
      .devlog-empty{padding:16px 0 4px;color:var(--muted,#6b7a90);text-align:center;font-size:12px}
      @media(max-width:720px){.devlog-row{grid-template-columns:82px 74px minmax(0,1fr)}.devlog-sha{display:none}.devlog-message{white-space:normal}.devlog-head{align-items:flex-start}}
    \`;
    document.head.appendChild(style);
  }
  function classify(message) {
    const m = message.toLowerCase();
    if (/research|연구|airport|aviation|climate|quantum|disease|urban|gis|tourism|kmo|math|science/.test(m)) return 'RESEARCH';
    if (/strategy|전략|commerce|financial|market|job|tutoring|airbnb|used-car|monetization|rest-area|auction|bid/.test(m)) return 'STRATEGY';
    if (/homepage|home page|main|portal|language|mobile|aphorism|busan|travel|guide|nav|dashboard view/.test(m)) return 'HOME';
    if (/^data[:(]|archive|collector|snapshot|sync|crawl|refresh|update daily/.test(m)) return 'DATA';
    return 'OPS';
  }
  function normalize(item) {
    const commit = item.commit || {};
    const message = String(commit.message || item.message || '').split('\n')[0].trim();
    return {
      sha:item.sha || '',
      message,
      date:commit.committer?.date || commit.author?.date || item.date || item.created_at || new Date().toISOString(),
      html_url:item.html_url || ('https://github.com/' + REPO + '/commit/' + (item.sha || '')),
      kind:classify(message)
    };
  }
  function kstParts(date) {
    const d = new Date(date);
    const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
    const time = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
    return {day,time};
  }
  function esc(value) {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function rowHtml(c, showDay=true) {
    const t = kstParts(c.date);
    return '<div class="devlog-row" data-kind="'+esc(c.kind)+'">'+
      '<div class="devlog-date">'+(showDay?t.day+'<br>':'')+t.time+' KST</div>'+
      '<span class="devlog-kind">'+esc(labels[c.kind]||c.kind)+'</span>'+
      '<div class="devlog-message" title="'+esc(c.message)+'">'+esc(c.message)+'</div>'+
      '<a class="devlog-sha" href="'+esc(c.html_url)+'" target="_blank" rel="noopener noreferrer">'+esc(c.sha.slice(0,7))+' ↗</a>'+
      '</div>';
  }
  async function load() {
    try {
      const r = await fetch(API,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
      if(!r.ok) throw new Error('github_'+r.status);
      const p = await r.json();
      if(!Array.isArray(p)||!p.length) throw new Error('github_empty');
      return {items:p.map(normalize),source:'github'};
    } catch(e) {
      console.warn('Developer log API fallback:',e);
      return {items:fallback.map(normalize),source:'fallback'};
    }
  }
  function renderPreview(items,source) {
    if(document.getElementById('developer-log-preview')) return;
    const target=document.getElementById('intelligence')||document.querySelector('.hero');
    if(!target||!target.parentNode) return;
    const section=document.createElement('section');
    section.className='sec'; section.id='developer-log-preview';
    section.innerHTML='<div class="devlog-panel"><div class="devlog-head"><div><h3>개발자 로그 · Developer Log</h3><p>메인·연구·전략 대시보드와 자동화 작업의 실제 GitHub 반영 이력입니다.</p></div><span class="devlog-live">'+(source==='github'?'LIVE · GITHUB':'RECENT CACHE')+'</span></div><div class="devlog-list">'+items.slice(0,PREVIEW_LIMIT).map(c=>rowHtml(c,true)).join('')+'</div><a class="devlog-more" href="/work-log/">전체 작업 로그 보기 →</a></div>';
    target.insertAdjacentElement('afterend',section);
  }
  function renderFull(items,source) {
    const root=document.getElementById('developer-log-full'); if(!root) return;
    let selected='ALL';
    root.innerHTML='<div class="devlog-toolbar" role="group" aria-label="작업 로그 필터">'+['ALL','HOME','RESEARCH','STRATEGY','DATA','OPS'].map((k,i)=>'<button class="devlog-filter" type="button" data-filter="'+k+'" aria-pressed="'+(i===0?'true':'false')+'">'+k+'</button>').join('')+'</div><div id="developer-log-list"></div><div class="devlog-empty" id="developer-log-status"></div>';
    const list=root.querySelector('#developer-log-list'), status=root.querySelector('#developer-log-status');
    const draw=()=>{
      const filtered=items.filter(c=>selected==='ALL'||c.kind===selected).slice(0,FULL_LIMIT);
      let lastDay='', html='';
      for(const c of filtered){const t=kstParts(c.date);if(t.day!==lastDay){lastDay=t.day;html+='<div class="devlog-day">'+esc(t.day)+'<small>KST</small></div>';}html+=rowHtml(c,false);}
      list.innerHTML=html||'<div class="devlog-empty">해당 분류의 기록이 없습니다.</div>';
      status.textContent=(source==='github'?'GitHub main 자동 반영':'최근 캐시 표시')+' · '+filtered.length+'건 · Asia/Seoul';
    };
    root.querySelectorAll('.devlog-filter').forEach(btn=>btn.addEventListener('click',()=>{selected=btn.dataset.filter;root.querySelectorAll('.devlog-filter').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));draw();}));
    draw();
  }
  async function init(){injectStyle();const {items,source}=await load();renderFull(items,source);if(!document.body.hasAttribute('data-devlog-page'))renderPreview(items,source);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();