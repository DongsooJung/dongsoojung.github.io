(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const state={contacts:[],templates:[],history:[],selected:new Set(),unlocked:false};
  const token=$('admin-token'),notice=$('crm-status');
  const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function tell(message,error=false){notice.textContent=message;notice.classList.toggle('error',error);}
  async function api(path,options={}) {
    const auth=token.value;
    const response=await fetch('/api/sms/'+path,{...options,headers:{'X-Admin-Token':auth,'Content-Type':'application/json'},cache:'no-store'});
    const data=await response.json();
    if(auth!==token.value)throw new Error('인증값이 변경됐습니다. 다시 연결해 주세요.');
    if(!response.ok||!data.ok)throw new Error(data.message||'요청을 처리하지 못했습니다.');
    return data;
  }
  function tab(name){
    document.querySelectorAll('[data-crm-tab]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.crmTab===name)));
    document.querySelectorAll('[data-crm-pane]').forEach(el=>el.hidden=el.dataset.crmPane!==name);
    $('sms-form').hidden=name!=='compose';
  }
  document.querySelectorAll('[data-crm-tab]').forEach(el=>el.addEventListener('click',()=>tab(el.dataset.crmTab)));
  function requireLogin(){if(!state.unlocked){tell('상단에 관리자 인증값을 입력하고 연결해 주세요.',true);return false;}return true;}
  function lock(){state.unlocked=false;state.contacts=[];state.templates=[];state.history=[];state.selected.clear();resetContact();resetTemplate();$('report-list').replaceChildren();render();tell('관리자 연결 후 고객 목록과 문구를 불러옵니다.');}
  token.addEventListener('input',lock);
  async function load(){
    const [contacts,templates,history]=await Promise.all([api('contacts'),api('templates'),api('history')]);
    state.contacts=contacts.contacts;state.templates=templates.templates;state.history=history.history;state.unlocked=true;render();
  }
  $('connect-account').addEventListener('click',async()=>{try{await load();tell('고객관리 서버에 연결됐습니다. 고객과 문구는 다른 기기에서도 같은 인증값으로 불러올 수 있습니다.');}catch(error){lock();tell(error.message,true);}});
  function renderContacts(){
    const query=$('contact-search').value.trim().toLowerCase();
    const list=state.contacts.filter(v=>[v.name,v.phone,v.category,v.notes].some(x=>String(x).toLowerCase().includes(query)));
    $('contact-count').textContent=`전체 ${state.contacts.length}명 · 선택 ${state.selected.size}명 / 최대 10명`;
    $('contact-list').innerHTML=list.length?list.map(v=>`<article class="crm-item"><div class="crm-item-head"><label><input type="checkbox" data-select-contact="${escape(v.id)}" ${state.selected.has(v.id)?'checked':''} aria-label="${escape(v.name)} 선택"><span>${escape(v.name)} <small>${escape(v.category)}</small></span></label><span class="status">${v.consent?'수신 동의 기록':'동의 확인 필요'}</span></div><p>${escape(v.phone)}</p>${v.notes?`<p>${escape(v.notes)}</p>`:''}<div class="crm-actions"><button type="button" class="mini-btn" data-edit-contact="${escape(v.id)}">수정</button><button type="button" class="mini-btn" data-contact-history="${escape(v.phone)}">발송 기록</button><button type="button" class="mini-btn" data-delete-contact="${escape(v.id)}">삭제</button></div></article>`).join(''):`<div class="crm-empty">${state.unlocked?'저장된 고객이 없습니다. 왼쪽에서 첫 고객을 등록하세요.':'관리자 연결 후 고객 목록을 표시합니다.'}</div>`;
  }
  function renderTemplates(){
    $('template-list').innerHTML=state.templates.length?state.templates.map(v=>`<article class="crm-item"><h3>${escape(v.title)}</h3><p>${escape(v.text)}</p><div class="crm-actions"><button class="mini-btn" type="button" data-use-template="${escape(v.id)}">이 문구로 작성</button><button class="mini-btn" type="button" data-edit-template="${escape(v.id)}">수정</button><button class="mini-btn" type="button" data-delete-template="${escape(v.id)}">삭제</button></div></article>`).join(''):'<div class="crm-empty">관리자 연결 후 자주 쓰는 문구를 표시합니다.</div>';
    const select=$('quick-template');select.replaceChildren(new Option('자주 쓰는 문구 선택',''),...state.templates.map(v=>new Option(v.title,v.id)));
  }
  function renderHistory(){
    const query=$('history-search').value.replace(/\D/g,'');
    const list=state.history.filter(v=>!query||v.recipients.some(r=>r.phone.includes(query)));
    $('history-list').innerHTML=list.length?list.map(v=>`<article class="crm-item"><div class="crm-item-head"><h3>${escape(v.recipients.map(r=>r.name).join(', '))}</h3><span class="status">${v.result.state==='processing'?'결과 확인 필요':v.result.ok?'솔라피 접수':'실패 · 확인 필요'}</span></div><small>${escape(new Date(v.createdAt).toLocaleString('ko-KR'))} · ${v.recipients.length}명</small><p>${escape(v.result.message)}</p><details><summary>고객별 내용과 접수 번호</summary>${v.recipients.map(r=>`<p><strong>${escape(r.name)} · ${escape(r.phone)}</strong></p><pre>${escape(v.message.replaceAll('{이름}',r.name))}</pre>`).join('')}<small>접수 번호 ${escape(v.result.groupId||'없음')}<br>요청 번호 ${escape(v.id)}</small></details></article>`).join(''):'<div class="crm-empty">이 화면을 통해 발송한 기록이 없습니다. 실제 전송 결과는 솔라피 내역에서 확인할 수 있습니다.</div>';
  }
  function render(){renderContacts();renderTemplates();renderHistory();}
  $('contact-search').addEventListener('input',renderContacts);$('history-search').addEventListener('input',renderHistory);
  function resetContact(){$('contact-form').reset();$('contact-id').value='';$('contact-version').value='';$('contact-save').textContent='고객 저장';}
  function resetTemplate(){$('template-form').reset();$('template-id').value='';$('template-version').value='';}
  $('contact-new').addEventListener('click',resetContact);$('template-new').addEventListener('click',resetTemplate);
  $('contact-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!requireLogin())return;
    const body={name:$('contact-name').value,phone:$('contact-phone').value,category:$('contact-category').value,notes:$('contact-notes').value,consent:$('contact-consent').checked};
    if($('contact-id').value){body.id=$('contact-id').value;body.version=Number($('contact-version').value);}
    try{await api('contacts',{method:'POST',body:JSON.stringify(body)});resetContact();await load();tell('고객을 저장했습니다.');}catch(error){tell(error.message,true);}
  });
  $('template-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!requireLogin())return;
    const body={title:$('template-title').value,text:$('template-text').value};
    if($('template-id').value){body.id=$('template-id').value;body.version=Number($('template-version').value);}
    try{await api('templates',{method:'POST',body:JSON.stringify(body)});resetTemplate();await load();tell('문구를 저장했습니다.');}catch(error){tell(error.message,true);}
  });
  $('contact-list').addEventListener('change',event=>{
    const id=event.target.dataset.selectContact;if(!id)return;
    if(event.target.checked){if(state.selected.size>=10){event.target.checked=false;tell('한 번에 최대 10명을 선택할 수 있습니다.',true);return;}state.selected.add(id);}else state.selected.delete(id);
    renderContacts();
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    const data=button.dataset;
    if(data.editContact){const v=state.contacts.find(v=>v.id===data.editContact);$('contact-id').value=v.id;$('contact-version').value=v.version;$('contact-name').value=v.name;$('contact-phone').value=v.phone;$('contact-category').value=v.category;$('contact-notes').value=v.notes;$('contact-consent').checked=v.consent;$('contact-save').textContent='수정 저장';$('contact-name').focus();}
    if(data.editTemplate){const v=state.templates.find(v=>v.id===data.editTemplate);$('template-id').value=v.id;$('template-version').value=v.version;$('template-title').value=v.title;$('template-text').value=v.text;$('template-title').focus();}
    if(data.contactHistory){$('history-search').value=data.contactHistory;renderHistory();tab('history');}
    if(data.useTemplate)useTemplate(data.useTemplate);
    const kind=data.deleteContact?'contacts':data.deleteTemplate?'templates':null;
    if(kind){const v=state[kind].find(v=>v.id===(data.deleteContact||data.deleteTemplate));if(!confirm((v.name||v.title)+' 항목을 삭제할까요?'))return;try{await api(kind,{method:'DELETE',body:JSON.stringify({id:v.id,version:v.version})});state.selected.delete(v.id);await load();tell('삭제했습니다. 기존 발송 기록은 유지됩니다.');}catch(error){tell(error.message,true);}}
  });
  function useTemplate(id){const value=state.templates.find(v=>v.id===id);if(!value)return;$('message').value=value.text;$('message').dispatchEvent(new Event('input',{bubbles:true}));tab('compose');$('message').focus();tell('문구를 반영했습니다. [날짜]·[시간] 등 대괄호 안의 내용을 실제 정보로 바꿔 주세요.');}
  $('quick-template').addEventListener('change',event=>useTemplate(event.target.value));
  $('selected-compose').addEventListener('click',()=>{
    if(!requireLogin())return;const selected=state.contacts.filter(v=>state.selected.has(v.id));
    if(!selected.length){tell('발송할 고객을 선택해 주세요.',true);return;}
    const names=[...document.querySelectorAll('[data-name]')],phones=[...document.querySelectorAll('[data-phone]')];
    names.forEach((input,i)=>{input.value=selected[i]?.name||'';phones[i].value=selected[i]?.phone||'';});
    $('message').dispatchEvent(new Event('input',{bubbles:true}));$('consent').checked=false;$('confirmation').value='';tab('compose');
    tell(`${selected.length}명을 발송 목록에 넣었습니다. 수신 동의를 다시 확인해 주세요.`);
  });
  $('refresh-history').addEventListener('click',async()=>{if(!requireLogin())return;try{state.history=(await api('history')).history;renderHistory();tell('발송 기록을 새로 불러왔습니다.');}catch(error){tell(error.message,true);}});
  $('solapi-reports').addEventListener('click',async()=>{
    if(!requireLogin())return;const button=$('solapi-reports');button.disabled=true;
    try{const {reports}=await api('reports');$('report-list').innerHTML=reports.length?reports.map(v=>`<article class="crm-item"><h3>${escape(v.to)}</h3><p>${escape(v.statusMessage||'상태 코드 '+v.statusCode)}</p><small>코드 ${escape(v.statusCode)} · ${escape(v.dateCreated)}</small><details><summary>문자 내용</summary><pre>${escape(v.text)}</pre></details></article>`).join(''):'<div class="crm-empty">솔라피 발송 내역이 없습니다.</div>';tell('솔라피 최근 50건을 조회했습니다. 접수와 전송 완료 상태를 구분해 확인하세요.');}catch(error){tell(error.message,true);}finally{button.disabled=false;}
  });
  window.addEventListener('sms-submitted',async()=>{try{state.history=(await api('history')).history;renderHistory();}catch{}});
  $('logout-crm').addEventListener('click',()=>{token.value='';token.dispatchEvent(new Event('input'));$('account-info').textContent='';$('report-list').replaceChildren();resetContact();resetTemplate();document.querySelectorAll('[data-name],[data-phone]').forEach(v=>v.value='');$('message').value='';$('message').dispatchEvent(new Event('input'));tab('compose');});
  lock();
})();
