/* STARGATE IPO alert feed; local read-state only, no remote subscriber tracking. */
(function(){
"use strict";
const $=id=>document.getElementById(id), KEY="stargate_ipo_read_ids_v1";
let events=[], status="not_initialized", checked=null;
const recentLimit=7*86400000;
const create=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
function readIds(){try{const v=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(v)?v.filter(x=>typeof x==="string"):[]}catch(e){return []}}
let read=new Set(readIds());
function save(){try{localStorage.setItem(KEY,JSON.stringify([...read].slice(-500)))}catch(e){$("ipoAlertStatus").textContent+=" · 브라우저 읽음 상태 저장 불가";}}
function humanTime(iso){if(!iso)return "일시 미확인";const d=new Date(iso);return Number.isFinite(+d)?d.toLocaleString("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"일시 미확인";}
const stages={review_applied:"예비심사 청구",review_approved:"예비심사 승인",review_rejected:"예비심사 미승인",review_withdrawn:"예비심사 철회",listed:"상장 완료"};
function scope(){
  const filter=$("ipoAlertFilter").value, threshold=Date.now()-recentLimit;
  return events.filter(event=>{
    if(filter==="unread" && read.has(event.id))return false;
    if(filter==="week" && !(Date.parse(event.detected_at)>=threshold))return false;
    return true;
  });
}
function label(e){
 if(e.type==="new_filing")return "신규 지분증권 신고";
 if(e.type==="schedule_changed")return "기존 신고서 일정·조건 변경";
 if(e.type==="review_event")return "KRX "+(stages[e.stage]||"예비심사 변경");
 return "공시 변경";
}
function render(){
 const unread=events.filter(x=>!read.has(x.id)).length;
 const statusNode=$("ipoAlertStatus");
 statusNode.textContent=status==="ok" ?
    "최근 변경: "+events.length+"건 · 미확인: "+unread+"건 · 최종 갱신 "+humanTime(checked):
    "알림 데이터 초기화 전 · 이후 확인된 신규 공시부터 기록됩니다.";
 $("ipoUnreadCount").textContent=String(unread);
 const root=$("ipoAlertItems");root.replaceChildren();
 const list=scope();
 if(!list.length){root.appendChild(create("p",events.length?"선택한 조건에 해당하는 변경 알림이 없습니다.":"최근 새 공시·일정 변경 알림이 없습니다.","help"));return;}
 for(const item of list.slice(0,35)){
   const row=create("article",undefined,"ipo-alert-card"+(read.has(item.id)?" read":""));
   const top=create("div",undefined,"ipo-alert-top");
   top.append(create("strong",item.name||"회사명 미확인"),create("span",label(item),"ipo-alert-type"));
   row.appendChild(top);
   const date = item.received_at ? "공시 발표/접수 "+item.received_at+" · " : "";
   row.appendChild(create("p",date+"변경 감지 "+humanTime(item.detected_at),"help"));
   if(item.subscription_start){
     row.appendChild(create("p","신고서 청약 시작: "+item.subscription_start+" · IPO 확정 아님","ipo-alert-meta"));
   }
   const a=create("a","원문 확인 ↗","btn");
   if(item.source==="OpenDART" && /^\d{14}$/.test(item.rcept_no||"")){
     a.href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo="+item.rcept_no;
   }else if(item.source==="KRX KIND licensed feed" && typeof item.source_url==="string" &&
     /^https:\/\/(?:kind\.krx\.co\.kr|listing\.krx\.co\.kr|www\.krx\.co\.kr|krx\.co\.kr)\//.test(item.source_url)){
     a.href=item.source_url;
   }else{continue}
   a.target="_blank";a.rel="noopener noreferrer";
   const mark=create("button",read.has(item.id)?"읽음":"읽음 표시","btn");
   mark.type="button";mark.addEventListener("click",()=>{
     if(read.has(item.id))read.delete(item.id);else read.add(item.id);
     save();render();
   });
   const actions=create("div",undefined,"ipo-alert-actions");actions.append(a,mark);row.appendChild(actions);root.appendChild(row);
 }
}
async function load(){
  try{
    const res=await fetch("./data/ipo-alerts.json",{cache:"no-store"});
    if(!res.ok)throw new Error("unavailable");
    const data=await res.json();
    if(data.schema!==1 || !["ok","not_initialized"].includes(data.status) || !Array.isArray(data.events))throw Error("invalid data");
    status=data.status;checked=data.updated_at;
    events=data.status==="ok"?data.events.filter(x=>x&&typeof x.id==="string" &&
      ["new_filing","schedule_changed","review_event"].includes(x.type)).slice(0,180):[];
  }catch(e){status="unavailable";events=[];checked=null}
  render();
}
$("ipoAlertFilter").addEventListener("change",render);
$("ipoAlertReload").addEventListener("click",load);
$("ipoAlertReadAll").addEventListener("click",()=>{for(const item of events)read.add(item.id);save();render();});
load();
})();
