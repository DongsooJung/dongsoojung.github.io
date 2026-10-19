(() => {
  const $=id=>document.getElementById(id);
  const url='https://stargate.stargate8225.workers.dev/sms/';
  const description='스타게이트 고객 메시지 관리\n문자 작성 · 고객 목록 · 발송 기록\n기본 5명, 최대 10명까지 발송\n'+url+'\n※ 운영자용 페이지입니다. 발송과 고객정보 조회에는 본인 확인이 필요합니다.';
  async function copy(value){try{await navigator.clipboard.writeText(value);$('share-status').textContent='복사했습니다. 노션 또는 카카오톡 입력창에 붙여 넣으세요.';}catch{$('share-copy-text').hidden=false;$('share-copy-text').value=value;$('share-copy-text').focus();$('share-copy-text').select();$('share-status').textContent='아래 내용을 선택해 복사해 주세요.';}}
  $('copy-page-link').addEventListener('click',()=>copy(url));
  $('copy-notion-link').addEventListener('click',()=>copy('[스타게이트 고객 메시지 관리]('+url+')'));
  $('copy-kakao-text').addEventListener('click',()=>copy(description));
  const channel=$('kakao-channel'),template=$('kakao-template'),fields=$('kakao-variables'),mode=$('delivery-mode');
  let list=[],approved=[],loaded=false,loading=false,unavailable=false,smsDraft='';
  window.smsDelivery=()=>{
    if(mode.value!=='kakao')return {delivery:'sms',ready:true};
    const chosen=approved.find(v=>v.templateId===template.value),values={};
    fields.querySelectorAll('input').forEach(input=>values[input.dataset.variable]=input.value.trim());
    return {delivery:'kakao',channelId:channel.value,templateId:template.value,kakaoVariables:values,ready:Boolean(chosen&&Object.values(values).every(Boolean))};
  };
  function update(){window.dispatchEvent(new Event('sms-delivery-changed'));}
  async function get(path){const r=await fetch('/api/sms/'+path,{cache:'no-store'}),data=await r.json();if(!r.ok||!data.ok)throw Error(data.message||'카카오 설정을 불러오지 못했습니다.');return data;}
  async function loadChannels(){
    if(!window.smsSignedIn){$('kakao-status').textContent='채널을 불러오려면 본인 확인이 필요합니다. 아래 설정 불러오기를 누르세요.';update();return;}
    if(loading)return;loading=true;
    try{const data=await get('kakao-channels');list=data.channels;loaded=true;unavailable=false;channel.replaceChildren(new Option('비즈니스 채널 선택',''),...list.map(v=>new Option(v.name,v.id)));$('kakao-status').textContent=list.length?'발송할 스타게이트 채널과 승인 템플릿을 선택하세요.':'솔라피에 연결된 채널이 없습니다. 솔라피 콘솔에서 스타게이트 비즈니스 채널을 연동한 뒤 다시 불러오세요.';}
    catch(error){unavailable=true;$('kakao-status').textContent=error.message;}
    finally{loading=false;update();}
  }
  $('load-kakao').addEventListener('click',()=>{if(!window.smsSignedIn){window.smsStartLogin();return;}loadChannels();});
  function switchMode(){
    const kakao=mode.value==='kakao';$('kakao-options').hidden=!kakao;$('message').readOnly=kakao;$('quick-template').disabled=kakao;
    if(kakao){smsDraft=$('message').value;$('message').value='';if(!loaded&&!loading)loadChannels();}
    else $('message').value=smsDraft;
    $('message').dispatchEvent(new Event('input',{bubbles:true}));update();
  }
  mode.addEventListener('change',switchMode);
  channel.addEventListener('change',async()=>{
    approved=[];fields.replaceChildren();template.replaceChildren(new Option('승인 템플릿 선택',''));$('message').value='';update();
    if(!channel.value)return;
    try{const data=await get('kakao-templates?channelId='+encodeURIComponent(channel.value));approved=data.templates;template.replaceChildren(new Option('승인 템플릿 선택',''),...approved.map(v=>new Option(v.name,v.templateId)));$('kakao-status').textContent=approved.length?'승인 템플릿과 변수를 확인하세요. 카카오 발송 실패 시 문자로 자동 전환하지 않습니다.':'이 채널에 승인된 알림톡 템플릿이 없습니다. 솔라피에서 등록·검수를 완료해 주세요.';}
    catch(error){$('kakao-status').textContent=error.message;}update();
  });
  function personalize(){const chosen=approved.find(v=>v.templateId===template.value);if(!chosen)return;const values=window.smsDelivery().kakaoVariables;$('message').value=chosen.content.replace(/#\{([^{}]+)\}/g,(_,name)=>name==='이름'?'{이름}':values[name]||'['+name+']');$('message').dispatchEvent(new Event('input',{bubbles:true}));update();}
  template.addEventListener('change',()=>{
    fields.replaceChildren();const chosen=approved.find(v=>v.templateId===template.value);if(!chosen){$('message').value='';update();return;}
    const variables=[...new Set([...JSON.stringify(chosen).matchAll(/#\{([^{}]+)\}/g)].map(v=>v[1]))].filter(v=>v!=='이름');
    for(const name of variables){const label=document.createElement('label'),input=document.createElement('input');label.textContent=name;input.dataset.variable=name;input.maxLength=1000;input.placeholder=name+' 입력';label.append(input);fields.append(label);input.addEventListener('input',personalize);}
    personalize();
  });
  if(window.smsPendingDelivery==='kakao'){mode.value='kakao';switchMode();}
  window.addEventListener('sms-auth-changed',()=>{if(window.smsSignedIn&&mode.value==='kakao'&&!loaded)loadChannels();if(!window.smsSignedIn){loaded=false;approved=[];list=[];fields.replaceChildren();channel.replaceChildren(new Option('비즈니스 채널 선택',''));template.replaceChildren(new Option('승인 템플릿 선택',''));}update();});
})();
