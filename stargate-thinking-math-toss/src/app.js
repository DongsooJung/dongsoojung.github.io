import "./style.css";
import { CATS, P } from "./problems.js";
import { load, save as persist } from "./storage.js";

/* ---------- storage (앱인토스 Storage API, 로컬 개발 시 localStorage) ---------- */
let S = { rec: {} };
function save() { persist(S); }
function rec(id){return S.rec[id]||(S.rec[id]={status:"new",tries:0,hints:0,stars:0,note:"",first:null,wrongs:[]});}

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const plain=h=>h.replace(/<[^>]+>/g," ");
const starHTML=n=>`<span class="stars" aria-label="난이도 ${n}">${"★".repeat(n)}<span class="off">${"★".repeat(3-n)}</span></span>`;
const norm=v=>String(v).replace(/\s|,/g,"").replace(/[°개번살일째가지초cm²]+$/,"");

/* ---------- state ---------- */
let F={cat:"all",lv:0,status:"all",sort:"no",q:""},TAB="all";

function renderStats(){
  const recs=P.map(p=>S.rec[p.id]).filter(Boolean);
  const solved=recs.filter(r=>r.status==="ok").length;
  const tried=recs.filter(r=>r.first!==null);
  $("#kSolved").textContent=`${solved}/${P.length}`;
  $("#kStars").textContent=recs.reduce((a,r)=>a+(r.stars||0),0);
  $("#kAcc").textContent=tried.length?Math.round(tried.filter(r=>r.first).length/tried.length*100)+"%":"–";
  $("#kHint").textContent=recs.reduce((a,r)=>a+(r.hints||0),0);
  $("#catBars").innerHTML=Object.entries(CATS).map(([k,c])=>{
    const ps=P.filter(p=>p.cat===k),ok=ps.filter(p=>S.rec[p.id]?.status==="ok").length;
    return `<div class="cbar"><div class="row"><span>${c.name}</span><em>${ok}/${ps.length}</em></div><div class="track"><i style="width:${ok/ps.length*100}%;background:${c.color}"></i></div></div>`;
  }).join("");
  const w=P.filter(p=>S.rec[p.id]?.status==="bad").length;
  $("#wrongN").textContent=w;
}
function renderChips(){
  const all=[["all","전체",null],...Object.entries(CATS).map(([k,c])=>[k,c.name,c.color])];
  $("#catChips").innerHTML=all.map(([k,n,col])=>`<button class="chip" type="button" data-cat="${k}" aria-pressed="${F.cat===k}">${col?`<span class="dot" style="background:${col}"></span>`:""}${n}</button>`).join("");
}
function stTag(r){if(!r||r.status==="new")return `<span class="st new">안 풀었어요</span>`;if(r.status==="ok")return `<span class="st ok">정답 · ★${r.stars}</span>`;return `<span class="st bad">다시 도전</span>`;}
function renderGrid(){
  let list=P.filter(p=>(F.cat==="all"||p.cat===F.cat)&&(!F.lv||p.lv===F.lv)&&(F.status==="all"||(S.rec[p.id]?.status||"new")===F.status)&&(!F.q||(p.title+plain(p.q)+CATS[p.cat].name).includes(F.q)));
  if(F.sort==="lvl")list.sort((a,b)=>a.lv-b.lv||a.id-b.id);
  if(F.sort==="lvlDesc")list.sort((a,b)=>b.lv-a.lv||a.id-b.id);
  $("#grid").innerHTML=list.length?list.map(p=>`<button class="card" type="button" data-open="${p.id}">
    <div class="meta"><span class="badge" style="color:${CATS[p.cat].color}">${CATS[p.cat].name}</span>${starHTML(p.lv)}</div>
    <h3>${esc(p.title)}</h3><p>${esc(plain(p.q))}</p>
    <div class="foot"><span style="font-family:var(--f-mono)">No.${String(p.id).padStart(2,"0")}</span>${stTag(S.rec[p.id])}</div></button>`).join("")
    :`<div class="empty">조건에 맞는 문제가 없어요. 필터를 바꿔 보세요.</div>`;
}
function renderWrong(){
  const list=P.filter(p=>S.rec[p.id]?.status==="bad");
  $("#wlist").innerHTML=list.length?list.map(p=>{const r=S.rec[p.id];return `<div class="witem">
    <span class="tag">No.${String(p.id).padStart(2,"0")}</span>
    <div style="min-width:0"><h3>${esc(p.title)}</h3><small>${CATS[p.cat].name} · 틀린 답: ${r.wrongs.slice(-3).map(esc).join(", ")||"–"} · 힌트 ${r.hints}개</small></div>
    <button class="ghost" type="button" data-open="${p.id}">다시 풀기</button></div>`}).join("")
    :`<div class="empty">아직 오답이 없어요. 틀린 문제는 여기에 모여서 다시 풀 수 있어요.</div>`;
}
function renderAll(){renderStats();renderChips();renderGrid();renderWrong();}

/* ---------- figures ---------- */
function fig(name){
  const st=`stroke="var(--ink)" stroke-width="1.6" fill="none"`;
  if(name==="grid43"){let s="";for(let i=0;i<=4;i++)s+=`<line x1="${10+i*40}" y1="10" x2="${10+i*40}" y2="130" ${st}/>`;for(let j=0;j<=3;j++)s+=`<line x1="10" y1="${10+j*40}" x2="170" y2="${10+j*40}" ${st}/>`;return `<svg viewBox="0 0 180 140" width="220">${s}</svg>`;}
  if(name==="dots33"){let s="";for(let i=0;i<3;i++)for(let j=0;j<3;j++)s+=`<circle cx="${20+i*50}" cy="${20+j*50}" r="5" fill="var(--ink)"/>`;return `<svg viewBox="0 0 140 140" width="150">${s}</svg>`;}
  if(name==="path33"){let s="";for(let i=0;i<=3;i++){s+=`<line x1="${15+i*40}" y1="15" x2="${15+i*40}" y2="135" ${st}/>`;s+=`<line x1="15" y1="${15+i*40}" x2="135" y2="${15+i*40}" ${st}/>`;}
    s+=`<circle cx="15" cy="135" r="7" fill="var(--accent)"/><circle cx="135" cy="15" r="7" fill="var(--star)"/><text x="26" y="132" font-size="12" fill="var(--muted)">출발</text><text x="96" y="12" font-size="12" fill="var(--muted)">도착</text>`;return `<svg viewBox="0 -4 150 150" width="190">${s}</svg>`;}
  if(name==="match"){let s="";const m=(x1,y1,x2,y2)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--star)" stroke-width="5" stroke-linecap="round"/>`;
    for(let i=0;i<3;i++){s+=m(14+i*44,12,52+i*44,12)+m(14+i*44,58,52+i*44,58);}for(let i=0;i<=3;i++)s+=m(10+i*44,16,10+i*44,54);return `<svg viewBox="0 0 150 70" width="220">${s}</svg>`;}
  return "";
}

/* ---------- solve sheet ---------- */
let cur=null,pick=null,resetArmed=false;
function openP(id){cur=P.find(p=>p.id===+id);pick=null;drawSheet();$("#sheet").hidden=false;document.body.style.overflow="hidden";setTimeout(()=>{const i=$("#ansIn");if(i)i.focus();},30);}
function closeP(){$("#sheet").hidden=true;document.body.style.overflow="";cur=null;renderAll();}
function drawSheet(fbHTML=""){
  const p=cur,r=rec(p.id),done=r.status==="ok",showSol=done||r.tries>=2;
  const idx=P.indexOf(p);
  const hints=p.hints.map((h,i)=>{const open=i<r.hints,locked=i>r.hints;return `<div class="hint${locked?" locked":""}">
    <button type="button" data-hint="${i}" ${locked||open?"disabled":""} aria-expanded="${open}"><span>${["생각 열기","결정적 단서","거의 다 왔어요"][i]}</span><span class="cost">${open?"열림":locked?"앞 힌트 먼저":"★ −1 · 열기"}</span></button>
    ${open?`<div class="body">${esc(h)}</div>`:""}</div>`}).join("");
  const input=p.type==="choice"
    ?`<div class="choices">${p.choices.map(c=>`<button type="button" class="choice" data-pick="${esc(c)}" aria-pressed="${pick===c}" ${done?"disabled":""}>${esc(c)}</button>`).join("")}</div><button class="go" id="goBtn" type="button" ${done?"disabled":""}>확인</button>`
    :`<input id="ansIn" inputmode="numeric" autocomplete="off" placeholder="답" aria-label="답 입력" ${done?`value="${esc(p.a)}" disabled`:""}><span class="unit">${p.unit||""}</span><button class="go" id="goBtn" type="button" ${done?"disabled":""}>확인</button>`;
  $("#paper").innerHTML=`
    <div class="ph"><div><div class="no">No.${String(p.id).padStart(2,"0")} · <span style="color:${CATS[p.cat].color}">${CATS[p.cat].name}</span> · ${starHTML(p.lv)}</div><h2 id="pTitle">${esc(p.title)}</h2></div><button class="x" type="button" id="xBtn" aria-label="닫기">×</button></div>
    <div class="q">${p.q}${p.fig?`<div class="fig">${fig(p.fig)}</div>`:""}</div>
    <div><div class="label"><span>내 생각 노트</span><span>그림·식·말로 자유롭게</span></div><textarea class="note" id="noteIn" placeholder="어떻게 풀지 먼저 적어 보세요. 예) 3의 배수부터 세어 볼까?">${esc(r.note||"")}</textarea></div>
    <div><div class="label"><span>힌트 사다리</span><span>지금 받을 별 ★${Math.max(1,3-r.hints)}</span></div><div class="hints">${hints}</div></div>
    <div><div class="label"><span>정답</span><span>${r.tries?`시도 ${r.tries}회`:""}</span></div><div class="ans">${input}</div></div>
    ${fbHTML}
    ${showSol?`<div class="sol"><b>풀이</b><ol>${p.sol.map(s=>`<li>${esc(s)}</li>`).join("")}</ol><div class="final">정답: ${esc(p.a)}${p.unit&&p.type!=="choice"?" "+p.unit:""}</div></div>`:(r.tries===1&&!done?`<p style="margin:0;font-size:13.5px;color:var(--muted)">한 번 더 틀리면 풀이가 열려요. 힌트를 먼저 써 보는 것도 좋아요.</p>`:"")}
    <div class="navrow"><button class="ghost" type="button" data-nav="${idx-1}" ${idx===0?"disabled":""}>← 이전 문제</button><button class="ghost" type="button" data-nav="${idx+1}" ${idx===P.length-1?"disabled":""}>다음 문제 →</button></div>`;
}
function submit(){
  const p=cur,r=rec(p.id);
  const v=p.type==="choice"?pick:$("#ansIn").value;
  if(v===null||v===undefined||String(v).trim()===""){drawSheet(`<div class="fb bad">답을 먼저 ${p.type==="choice"?"골라":"적어"} 주세요.</div>`);return;}
  r.tries++;
  const ok=p.type==="choice"?v===p.a:norm(v)===norm(p.a);
  if(r.first===null)r.first=ok;
  if(ok){r.status="ok";r.stars=Math.max(1,3-r.hints);save();drawSheet(`<div class="fb ok">★ 정답이에요! 별 ${r.stars}개를 모았어요.</div>`);}
  else{r.status="bad";r.wrongs.push(String(v).trim());save();drawSheet(`<div class="fb bad">아쉬워요. ${r.tries>=2?"아래 풀이를 보고 어디서 달라졌는지 노트에 적어 보세요.":"힌트를 하나 열어 보고 다시 도전해 보세요."}</div>`);}
}

/* ---------- events ---------- */
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-open],[data-cat],[data-tab],[data-hint],[data-pick],[data-nav],#goBtn,#xBtn,#resetBtn,#resetYes,#resetNo");
  if(!t)return;
  if(t.dataset.open)return openP(t.dataset.open);
  if(t.dataset.cat){F.cat=t.dataset.cat;renderChips();renderGrid();return;}
  if(t.dataset.tab){TAB=t.dataset.tab;document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===TAB));$("#viewAll").hidden=TAB!=="all";$("#viewWrong").hidden=TAB!=="wrong";return;}
  if(t.dataset.hint!==undefined){const r=rec(cur.id);if(+t.dataset.hint===r.hints&&r.status!=="ok"){r.hints++;save();drawSheet();}return;}
  if(t.dataset.pick!==undefined){pick=t.dataset.pick;document.querySelectorAll(".choice").forEach(b=>b.setAttribute("aria-pressed",b.dataset.pick===pick));return;}
  if(t.dataset.nav!==undefined){openP(P[+t.dataset.nav].id);return;}
  if(t.id==="goBtn")return submit();
  if(t.id==="xBtn")return closeP();
  if(t.id==="resetBtn"){$("#resetBox").innerHTML=`<span>모든 기록과 생각 노트를 지울까요?</span><button class="danger" id="resetYes" type="button">지우기</button><button class="ibtn" id="resetNo" type="button">취소</button>`;return;}
  if(t.id==="resetYes"){S.rec={};save();renderAll();}
  if(t.id==="resetYes"||t.id==="resetNo"){$("#resetBox").innerHTML=`<button class="ibtn" id="resetBtn" type="button">진도 초기화</button>`;}
});
document.addEventListener("input",e=>{
  if(e.target.id==="noteIn"&&cur){rec(cur.id).note=e.target.value;save();}
  if(e.target.id==="fQ"){F.q=e.target.value.trim();renderGrid();}
});
document.addEventListener("change",e=>{
  if(e.target.id==="fLevel"){F.lv=+e.target.value;renderGrid();}
  if(e.target.id==="fStatus"){F.status=e.target.value;renderGrid();}
  if(e.target.id==="fSort"){F.sort=e.target.value;renderGrid();}
});
document.addEventListener("keydown",e=>{
  if($("#sheet").hidden)return;
  if(e.key==="Escape")closeP();
  if(e.key==="Enter"&&e.target.id==="ansIn")submit();
});
$("#sheet").addEventListener("click",e=>{if(e.target.id==="sheet")closeP();});

/* ---------- boot ---------- */
(async () => {
  try {
    const saved = await load();
    if (saved && saved.rec) S.rec = saved.rec;
  } catch { /* 저장분이 깨졌으면 빈 상태로 시작 */ }
  renderAll();
})();
