const $=id=>document.getElementById(id);
const admin=location.pathname.startsWith('/admin/');
const api=admin?'/api/admin/board':'/api/board';
let auth, authSdk, config, selected, editing, nextCursor, widget, busy=false;
const form=$('post-form');
const date=value=>{const time=new Date(value);return Number.isNaN(time.getTime())?'':new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium'}).format(time);};
async function call(path='',options={}) {
  const headers=new Headers(options.headers);
  if(options.body) headers.set('Content-Type','application/json');
  if(!admin && options.method && auth?.currentUser) headers.set('Authorization','Bearer '+await auth.currentUser.getIdToken());
  const response=await fetch(api+path,{...options,headers,cache:'no-store'});
  let data; try { data=await response.json(); } catch { throw Error('게시판 서버에 연결할 수 없습니다.'); }
  if(!response.ok) throw Error(data.error||'요청을 처리하지 못했습니다.');
  return data;
}
function showError(error,target='status') { $(target).textContent=error.message||'다시 시도해 주세요.'; }
function controls() {
  $('login').hidden=admin||Boolean(auth?.currentUser);
  $('logout').hidden=admin||!auth?.currentUser;
  $('write').disabled=!config?.ready||busy||admin;
  if(selected) { const owner=auth?.currentUser?.uid===selected.authorId; $('edit').hidden=admin||!owner; $('delete').hidden=!admin&&!owner; }
}
function render(post) {
  const row=document.createElement('button'); row.className='post'; row.type='button';
  const badge=document.createElement('span'); badge.className='badge'; badge.textContent=post.category;
  const title=document.createElement('strong'); title.textContent=post.title;
  const meta=document.createElement('small'); meta.textContent=`${post.authorName} · ${date(post.createdAt)}`;
  row.append(badge);
  if(post.reply) { const tag=document.createElement('span'); tag.className='answered'; tag.textContent='답변 완료';row.append(tag); }
  row.append(title,meta); row.addEventListener('click',()=>openPost(post.id));
  return row;
}
async function load(append=false) {
  $('more').disabled=true;
  try {
    const data=await call(append&&nextCursor?'?cursor='+encodeURIComponent(nextCursor):'');
    if(!append) $('posts').replaceChildren();
    $('posts').append(...data.posts.map(render));
    nextCursor=data.nextCursor; $('more').hidden=!nextCursor;
    $('status').textContent=$('posts').children.length?'새로운 질문과 이야기를 기다립니다.':'첫 번째 이야기를 남겨 주세요.';
  } catch(error) { showError(error); } finally { $('more').disabled=false; }
}
async function openPost(id) {
  try {
    selected=(await call('/'+encodeURIComponent(id))).post;
    $('detail-title').textContent=selected.title; $('detail-category').textContent=selected.category;
    $('detail-meta').textContent=`${selected.authorName} · ${date(selected.createdAt)}${selected.updatedAt!==selected.createdAt?' · 수정됨':''}`;
    $('detail-body').textContent=selected.body; $('detail-reply').textContent=selected.reply;
    $('reply-box').hidden=!selected.reply; $('reply-form').hidden=!admin;
    $('reply-form').elements.reply.value=selected.reply; $('detail-status').textContent=''; controls();
    if(!$('detail').open) $('detail').showModal();
  } catch(error) { showError(error); }
}
function editor(post=null) {
  if(!auth?.currentUser) { $('status').textContent='Google 로그인 후 글을 작성해 주세요.'; $('login').focus(); return; }
  editing=post; form.reset();
  for(const key of ['title','body','authorName','category']) if(post) form.elements[key].value=post[key];
  $('editor-title').textContent=post?'게시글 수정':'글쓰기'; $('submit').textContent=post?'수정 저장':'게시글 등록'; $('form-status').textContent='';
  $('editor').showModal();
  if(widget!==undefined) window.turnstile.reset(widget);
}
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
$('write').addEventListener('click',()=>editor());
$('edit').addEventListener('click',()=>{ $('detail').close(); editor(selected); });
$('more').addEventListener('click',()=>load(true));
$('login').addEventListener('click',async()=>{
  try { await authSdk.signInWithPopup(auth,new authSdk.GoogleAuthProvider()); $('status').textContent='로그인되었습니다. 글쓰기를 눌러 주세요.'; }
  catch { $('status').textContent='로그인하지 못했습니다. 팝업 허용 여부를 확인해 주세요.'; }
});
$('logout').addEventListener('click',async()=>{ try {await authSdk.signOut(auth);} catch(error) {showError(error);} });
form.addEventListener('submit',async event=>{
  event.preventDefault(); if(busy) return;
  if(!auth?.currentUser || widget===undefined) { $('form-status').textContent='로그인과 스팸 방지 확인이 필요합니다.';return; }
  const turnstileToken=window.turnstile.getResponse(widget);
  if(!turnstileToken) { $('form-status').textContent='스팸 방지 확인을 완료해 주세요.';return; }
  busy=true; $('submit').disabled=true;
  try {
    const data=Object.fromEntries(new FormData(form));data.turnstileToken=turnstileToken;
    const result=await call(editing?'/'+editing.id:'',{method:editing?'PATCH':'POST',body:JSON.stringify(data)});
    $('editor').close();await load();await openPost(result.post.id);
  } catch(error) { showError(error,'form-status'); }
  finally { busy=false; $('submit').disabled=false;window.turnstile.reset(widget);controls(); }
});
$('delete').addEventListener('click',async()=>{
  if(busy || !confirm('이 게시글을 삭제할까요? 삭제 후 복구할 수 없습니다.')) return;
  busy=true; $('delete').disabled=true;
  try { await call('/'+selected.id,{method:'DELETE'});$('detail').close(); selected=null;await load(); }
  catch(error) { showError(error,'detail-status'); } finally {busy=false;$('delete').disabled=false;}
});
$('reply-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy) return;busy=true;
  const button=event.currentTarget.querySelector('button');button.disabled=true;
  try { const reply=event.currentTarget.elements.reply.value;await call('/'+selected.id,{method:'PATCH',body:JSON.stringify({reply})});await openPost(selected.id);await load();$('detail-status').textContent='답변을 저장했습니다.'; }
  catch(error) { showError(error,'detail-status'); } finally {busy=false;button.disabled=false;}
});
async function init() {
  try {
    if(admin) { $('login').hidden=true;$('write').hidden=true;document.querySelector('.hero h1').textContent='게시판 관리'; await load();return; }
    const response=await fetch('/api/board/config',{cache:'no-store'});if(!response.ok) throw Error('게시판 연결 설정을 불러오지 못했습니다.');
    config=await response.json();
    if(!config.ready) { $('status').textContent='게시판 연결을 준비하고 있습니다. 연결이 완료되면 글을 남길 수 있습니다.';return; }
    const [{initializeApp},sdk]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js')]);
    authSdk=sdk;auth=sdk.getAuth(initializeApp(config.firebase));sdk.onAuthStateChanged(auth,controls);$('login').disabled=false;controls();
    window.boardTurnstileReady=()=>{widget=window.turnstile.render('#challenge',{sitekey:config.turnstileSiteKey,action:'board_write','error-callback':()=>{$('form-status').textContent='스팸 방지 확인을 다시 시도해 주세요.';}});};
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=boardTurnstileReady&render=explicit';script.async=true;script.onerror=()=>{$('status').textContent='스팸 방지 기능을 불러오지 못했습니다. 새로고침해 주세요.';};document.head.append(script);
    await load();
  } catch(error) {showError(error);}
}
init();
