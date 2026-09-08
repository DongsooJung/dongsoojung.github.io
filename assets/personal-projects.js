(() => {
  'use strict';
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  const KEY = 'stargate-personal-projects-v1';
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().trim();
  const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  function safeURL(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return /^(https?:)$/.test(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch (_) { return null; }
  }
  function classify(value) {
    const s = normalize(value);
    const topic = /교육|수학|교재|독서|reading|koi|kmo|강의|학습|알고리즘/.test(s) ? '교육'
      : /사업|매출|수익|판매|쇼핑|구독|견적|마케팅|상담|문자|commerce|shop|monetization|ads|sms/.test(s) ? '사업'
      : /생활|숙소|스테이|여행|발자취|도시 지도|stay|cities|kakao/.test(s) ? '생활' : '연구';
    const type = /관리|수집|모니터링|콘솔|상태판|operations|collector/.test(s) ? '관리도구'
      : /대시보드|지도|관측|dashboard|map|허브/.test(s) ? '대시보드'
      : /보고서|문서|블로그|서평|독서|교재|리서치|report|blog|reading/.test(s) ? '문서' : '앱';
    const aliases = [
      [/실거래|경매|부동산|주택|아파트|real.estat|auction|집값/, '집값 주거 주택 부동산 실거래 경매'],
      [/수학|koi|kmo|알고리즘|교재/, '공부 교육 수업 문제 풀이'],
      [/환율|금리|물가|거시|exchange/, '경제 돈 금융 달러'],
      [/관광|숙박|숙소|여행|stay|tourism/, '여행 숙소 관광'],
      [/매출|재무|수익|사업|commerce/, '사업 수입 매출 돈'],
    ].filter(([pattern]) => pattern.test(s)).map(([, words]) => words).join(' ');
    return {topic, type, aliases};
  }
  let persistent = true;
  let state = {pins: [], recent: [], custom: []};
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      state.pins = Array.isArray(saved.pins) ? [...new Set(saved.pins.filter(v => typeof v === 'string'))].slice(0, 100) : [];
      state.recent = Array.isArray(saved.recent) ? saved.recent.filter(v => v && typeof v.id === 'string' && Number.isFinite(v.at) && v.at > 0).slice(0, 10) : [];
      state.custom = Array.isArray(saved.custom) ? saved.custom.filter(v => v && text(v.title) && safeURL(v.url)).slice(0, 200).map(v => ({url: safeURL(v.url), title: text(v.title, 180), tags: text(v.tags, 200)})) : [];
    }
  } catch (_) { persistent = false; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); persistent = true; }
    catch (_) { persistent = false; }
    updateNote();
  }
  const catalog = [...grid.querySelectorAll(':scope > .proj')].map(card => {
    const url = safeURL(card.getAttribute('href'));
    const title = text(card.querySelector('.ttl')?.textContent, 180);
    const description = text(card.querySelector('.sub')?.textContent);
    const tags = text(card.querySelector('.tag')?.textContent, 200);
    return {id: url, url, title, description, tags, ...classify(`${title} ${description} ${tags} ${url}`)};
  }).filter(v => v.url && v.title);
  const uniqueCatalog = [...new Map(catalog.map(v => [v.id, v])).values()];
  let active = false;
  let query = '', topic = '', kind = '';
  const openedDetails = new Set();
  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function button(label, action, id) {
    const node = element('button', 'project-toggle', label);
    node.type = 'button';
    node.dataset.analyticsIgnore = '';
    node.dataset.personalAction = action;
    if (id) node.dataset.personalId = id;
    return node;
  }
  const panel = element('div', 'personal-projects');
  panel.id = 'personal-projects';
  panel.hidden = true;
  grid.before(panel);
  const toolbar = element('div', 'pp-toolbar');
  const searchLabel = element('label', '', '전체 통합 검색');
  const search = element('input');
  search.id = 'personal-search'; search.type = 'search';
  search.placeholder = '제목·설명·태그 검색 (예: 집값, 수학)';
  searchLabel.append(search); toolbar.append(searchLabel);
  const filters = element('div', 'pp-filters');
  function filter(label, id, values) {
    const wrap = element('label', '', label);
    const select = element('select'); select.id = id;
    for (const value of ['', ...values]) {
      const option = element('option', '', value || '전체'); option.value = value; select.append(option);
    }
    wrap.append(select); filters.append(wrap); return select;
  }
  const topicSelect = filter('주제', 'personal-topic', ['연구','교육','사업','생활']);
  const typeSelect = filter('종류', 'personal-type', ['대시보드','문서','앱','관리도구']);
  filters.append(button('검색 초기화', 'reset'));
  toolbar.append(filters);
  const note = element('p', 'pp-note');
  const status = element('p', 'pp-note'); status.id = 'personal-status'; status.setAttribute('role','status');
  const lists = element('div'); lists.id = 'personal-lists';
  panel.append(toolbar, note, status, lists);
  function updateNote() {
    note.textContent = persistent ? '고정 순서·최근 사용·추가 링크는 이 브라우저에만 저장됩니다. 다른 기기와 동기화되지 않습니다.' : '브라우저 저장을 사용할 수 없어 현재 화면에서만 유지됩니다. 저장 설정을 확인해 주세요.';
  }
  updateNote();
  const add = element('details','pp-add');
  add.append(element('summary','','내 링크 추가'));
  const form = element('form'); form.id = 'personal-add-form';
  function field(label, name, type, placeholder, max) {
    const wrap = element('label','',label);
    const input = element('input'); input.name=name; input.type=type; input.placeholder=placeholder; input.maxLength=max;
    input.required = name !== 'tags'; wrap.append(input); form.append(wrap); return input;
  }
  const titleInput = field('제목','title','text','예: 우리 동네 집값',180);
  const urlInput = field('주소','url','url','https://…',2000);
  const tagsInput = field('태그','tags','text','예: 부동산, 실거래, 대시보드',200);
  const submit = button('추가하기','add'); submit.type='submit'; form.append(submit);
  const addMessage = element('p','pp-note'); addMessage.setAttribute('role','status');
  add.append(form,addMessage); panel.append(add);
  function entries() {
    const ids = new Set(uniqueCatalog.map(v => v.id));
    const custom = state.custom.filter(v => !ids.has(v.url)).map(v => ({...v,id:v.url,description:v.tags || '직접 추가한 링크',custom:true,...classify(`${v.title} ${v.tags} ${v.url}`)}));
    return [...uniqueCatalog,...custom];
  }
  function matches(item) {
    const haystack = normalize(`${item.title} ${item.description} ${item.tags} ${item.aliases} ${item.topic} ${item.type}`);
    return (!topic || item.topic === topic) && (!kind || item.type === kind) && normalize(query).split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
  }
  function lastTime(id) { return state.recent.find(v => v.id === id)?.at || 0; }
  function row(item) {
    const node = element('article','pp-row'); node.dataset.personalId = item.id;
    const body = element('div','pp-content');
    const link = element('a','pp-title',item.title); link.href=item.url; link.dataset.personalId=item.id;
    if (item.custom) link.dataset.analyticsIgnore='';
    body.append(link,element('p','pp-meta',`${item.topic} · ${item.type} · ${lastTime(item.id) ? '최근 사용 '+ new Date(lastTime(item.id)).toLocaleDateString('ko-KR') : '사용 기록 없음'}`));
    body.append(element('p','pp-summary',item.description.slice(0,90)+(item.description.length>90?'…':'')));
    const detail = element('details','pp-detail');
    detail.dataset.personalDetail=item.id;
    detail.open=openedDetails.has(item.id);
    detail.append(element('summary','','자세히'),element('p','',item.description),element('p','pp-meta',item.tags));
    detail.addEventListener('toggle',()=>{ if(detail.open) openedDetails.add(item.id); else openedDetails.delete(item.id); });
    body.append(detail);
    const actions = element('div','pp-actions');
    const pinIndex = state.pins.indexOf(item.id);
    const pin = button(pinIndex >= 0 ? '★ 고정 해제' : '☆ 고정','pin',item.id);
    pin.setAttribute('aria-pressed',String(pinIndex >= 0)); pin.setAttribute('aria-label',item.title+' '+(pinIndex>=0?'고정 해제':'고정'));
    actions.append(pin);
    if (pinIndex >= 0) {
      for (const [label, action, disabled] of [['↑','up',pinIndex===0],['↓','down',pinIndex===state.pins.length-1]]) {
        const move=button(label,action,item.id); move.disabled=disabled;
        move.setAttribute('aria-label',`${item.title} ${action==='up'?'위로':'아래로'} 이동`); actions.append(move);
      }
    }
    if(item.custom) actions.append(button('삭제','delete',item.id));
    node.append(body,actions); return node;
  }
  function render() {
    if (!active) return;
    const all=entries(); const byId=new Map(all.map(v=>[v.id,v]));
    state.pins=state.pins.filter(id=>byId.has(id));
    const pinned=state.pins.map(id=>byId.get(id));
    const pinSet=new Set(state.pins);
    const recentIds=[...new Set(state.recent.slice().sort((a,b)=>b.at-a.at).map(v=>v.id))].filter(id=>byId.has(id)&&!pinSet.has(id)).slice(0,10);
    const recent=recentIds.map(id=>byId.get(id));
    const used=new Set([...state.pins,...recentIds]);
    const rest=all.filter(v=>!used.has(v.id)).sort((a,b)=>a.title.localeCompare(b.title,'ko',{numeric:true}));
    const fragment=document.createDocumentFragment(); let count=0;
    for(const [heading,items,empty] of [['내가 고정한 바로가기',pinned,'자주 쓰는 항목의 ☆ 고정을 눌러 주세요.'],['최근 사용한 항목',recent,'링크를 열면 최근 사용한 항목이 여기에 표시됩니다. 고정 항목은 위에서 볼 수 있습니다.'],['전체 목록 · 나머지 항목',rest,'표시할 항목이 없습니다.']]) {
      const visible=items.filter(matches); count+=visible.length;
      const section=element('section','pp-section'); section.dataset.personalSection=heading;
      section.append(element('h3','',`${heading} · ${visible.length}`));
      if(visible.length) visible.forEach(item=>section.append(row(item)));
      else section.append(element('p','pp-empty',query||topic||kind?'조건에 맞는 항목이 없습니다.':empty));
      fragment.append(section);
    }
    lists.replaceChildren(fragment);
    status.textContent=`${count}개 표시 · 고정 순서 → 최근 사용 → 나머지 가나다순`;
  }
  search.addEventListener('input',()=>{query=search.value;render();});
  topicSelect.addEventListener('change',()=>{topic=topicSelect.value;render();});
  typeSelect.addEventListener('change',()=>{kind=typeSelect.value;render();});
  panel.addEventListener('click',event=>{
    const control=event.target.closest('button[data-personal-action]'); if(!control)return;
    const action=control.dataset.personalAction; const id=control.dataset.personalId;
    if(action==='add')return;
    if(action==='reset'){query=topic=kind='';search.value=topicSelect.value=typeSelect.value='';render();search.focus();return;}
    const index=state.pins.indexOf(id);
    if(action==='pin'){if(index<0)state.pins.push(id);else state.pins.splice(index,1);}
    if(action==='up'&&index>0)[state.pins[index-1],state.pins[index]]=[state.pins[index],state.pins[index-1]];
    if(action==='down'&&index>=0&&index<state.pins.length-1)[state.pins[index+1],state.pins[index]]=[state.pins[index],state.pins[index+1]];
    if(action==='delete'){state.custom=state.custom.filter(v=>v.url!==id);state.pins=state.pins.filter(v=>v!==id);state.recent=state.recent.filter(v=>v.id!==id);}
    save();render();
    const replacement=[...panel.querySelectorAll('button[data-personal-id]')].find(v=>v.dataset.personalId===id&&v.dataset.personalAction===action&&!v.disabled);
    (replacement||search).focus();
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const url=safeURL(urlInput.value); const title=text(titleInput.value,180); const tags=text(tagsInput.value,200);
    if(!url||!title){addMessage.textContent='제목과 http 또는 https 주소를 입력해 주세요.';return;}
    if(entries().some(v=>v.url===url)){addMessage.textContent='이미 목록에 있는 주소입니다. 검색해서 고정해 주세요.';return;}
    if(state.custom.length>=200){addMessage.textContent='추가 링크는 최대 200개입니다. 사용하지 않는 링크를 정리해 주세요.';return;}
    state.custom.push({url,title,tags}); save();
    query=topic=kind='';search.value=topicSelect.value=typeSelect.value='';render();form.reset();
    const labels=classify(`${title} ${tags} ${url}`);
    addMessage.textContent=`추가했습니다: ${labels.topic} · ${labels.type}. 목록에서 고정할 수 있습니다.`;
  });
  function record(event) {
    if(event.type==='auxclick'&&event.button!==1)return;
    const link=event.target.closest?.('a[href]'); if(!link)return;
    if(!grid.contains(link)&&!panel.contains(link))return;
    const id=safeURL(link.href);if(!id)return;
    state.recent=[{id,at:Date.now()},...state.recent.filter(v=>v.id!==id)].slice(0,10);save();
    setTimeout(render,0);
  }
  document.addEventListener('click',record,true);
  document.addEventListener('auxclick',record,true);
  window.addEventListener('pageshow',render);
  window.StargatePersonalProjects={setActive(value){active=Boolean(value);panel.hidden=!active;if(active)render();}};
})();
