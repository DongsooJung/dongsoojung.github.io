/* IPO / subscription calendar, read-only public snapshots, no secrets. */
(function(){
"use strict";
const byId=(x)=>document.getElementById(x);
let offers=[],reviews=[],updated=null,reviewUpdated=null,loaded=false;
const stageNames={
  review_applied:"상장예비심사 청구",
  review_approved:"상장예비심사 승인",
  review_rejected:"상장예비심사 미승인",
  review_withdrawn:"상장예비심사 철회",
  listed:"상장 완료"
};
function elem(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e}
function isoDate(x){return typeof x==="string" && /^\d{4}-\d{2}-\d{2}$/.test(x)?x:null}
function todayKst(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function validRcp(x){return /^\d{14}$/.test(x||"")}
function sourceLink(rcp){return "https://dart.fss.or.kr/dsaf001/main.do?rcpNo="+rcp}
function link(href,label){const a=elem("a",label,"btn");a.href=href;a.target="_blank";a.rel="noopener noreferrer";return a}
function status(){
  const status=byId("ipoCalendarStatus");
  if(!loaded){status.textContent="스냅샷을 확인하고 있습니다.";return}
  status.textContent=updated ? "OpenDART 수집: "+new Date(updated).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})+
    ((Date.now()-Date.parse(updated)>10*86400000)?" · 갱신 지연":"")+
    " · 최근 90일 지분증권 신고서 기준 (조회·기업수 제한 있음)" :
    "OpenDART 일정 수집 미연결 · 확인된 청약 일정 없음";
  const kinds=byId("ipoKindStatus");
  kinds.textContent=reviewUpdated ?
    "KRX KIND 승인 데이터 공급원 동기화: "+new Date(reviewUpdated).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}) :
    "KRX KIND 상장예비심사 자동조회 미연결 · 공식 페이지에서 확인";
  byId("ipoOfferCount").textContent=offers.length.toLocaleString("ko-KR");
  byId("ipoUpcomingCount").textContent=offers.filter(x=>isoDate(x.subscription_start)&&x.subscription_start>=todayKst()).length.toLocaleString("ko-KR");
  byId("ipoReviewCount").textContent=reviews.length.toLocaleString("ko-KR");
}
function filtered(){
  const q=byId("ipoSearch").value.trim().toLowerCase();
  const filter=byId("ipoFilter").value;
  const now=todayKst();
  const list=offers.filter(x=>validRcp(x.rcept_no) &&
    (!q || (x.name||"").toLowerCase().includes(q)) &&
    (filter==="all" || filter==="upcoming" && isoDate(x.subscription_start) && x.subscription_start>=now ||
      filter==="dated" && isoDate(x.subscription_start) ||
      filter==="undated" && !isoDate(x.subscription_start)));
  list.sort((a,b)=>(b.subscription_start||b.rcept_no).localeCompare(a.subscription_start||a.rcept_no));
  return list;
}
function addMeta(item,label,value){const row=elem("div",undefined,"ipo-meta-row");row.append(elem("span",label),elem("strong",value||"공시 확인 필요"));item.append(row)}
function renderOffers(){
  const root=byId("ipoOfferItems");root.replaceChildren();
  const candidates=filtered();byId("ipoVisibleCount").textContent=candidates.length+"개 표시 · 발행공시 데이터는 IPO 확정 목록이 아닙니다.";
  if(!candidates.length){root.appendChild(elem("p",offers.length?"검색 조건에 맞는 발행 신고가 없습니다.":"수집된 지분증권 청약 정보가 없습니다.","help"));return}
  for(const row of candidates.slice(0,60)){
    const box=elem("article",undefined,"ipo-offer-card");
    const head=elem("div",undefined,"ipo-offer-head");
    head.append(elem("strong",row.name||"법인명 미확인"),elem("span","증권신고서 정보 · IPO 미확인","ipo-offer-flag"));
    box.appendChild(head);
    addMeta(box,"신고서상 청약일",row.subscription_start?
      row.subscription_start+(row.subscription_end && row.subscription_end!==row.subscription_start?" ~ "+row.subscription_end:""):
      (row.subscription_raw||"날짜 확인 필요"));
    addMeta(box,"납입기일",row.payment_date);
    addMeta(box,"신고서상 모집·매출가액",row.offering_price_raw||"미확인");
    box.appendChild(link(sourceLink(row.rcept_no),"원문 검증 ↗"));
    root.appendChild(box);
  }
}
function renderReviews(){
 const root=byId("ipoReviewItems");root.replaceChildren();
 if(!reviews.length){root.appendChild(elem("p","검증된 예비심사 자료가 없습니다. 원천 KIND 사이트에서 직접 확인하세요.","help"));return}
 for(const row of reviews.slice(0,40)){
  const box=elem("article",undefined,"ipo-review-row");
  const top=elem("div",undefined,"ipo-offer-head");
  top.append(elem("strong",row.name||"기업명 미확인"),elem("span",stageNames[row.stage]||"상태 미확인","ipo-review-tag"));
  box.append(top,elem("p",String(row.announcement_date||"")+" · "+String(row.market||"미지정"),"help"));
  if(typeof row.source_url==="string" && /^https:\/\/(kind\.krx\.co\.kr|listing\.krx\.co\.kr|www\.krx\.co\.kr|krx\.co\.kr)\//.test(row.source_url)){
    box.appendChild(link(row.source_url,"거래소 원문 ↗"));
  }
  root.appendChild(box);
 }
}
function render(){status();renderOffers();renderReviews()}
async function load(){
  const paths=["./data/ipo-calendar.json","./data/kind-verified.json"];
  const values=await Promise.all(paths.map(async path=>{
    try{const res=await fetch(path,{cache:"no-store"});if(!res.ok)throw new Error("HTTP status");const data=await res.json();
      if(data.schema!==1 || !Array.isArray(data.records))throw new Error("Invalid schema");
      return data;
    }catch(e){return {status:"unavailable",records:[],updated_at:null}}
  }));
  const a=values[0],b=values[1];
  offers=a.status==="ok"?a.records.filter(x=>x&&x.source==="OpenDART estkRs").slice(0,100):[];
  updated=a.status==="ok"?a.updated_at:null;
  reviews=b.status==="ok"?b.records.filter(x=>x && stageNames[x.stage] && typeof x.name==="string").slice(0,300):[];
  reviewUpdated=b.status==="ok"?b.updated_at:null;
  loaded=true;render();
}
byId("ipoSearch").addEventListener("input",renderOffers);
byId("ipoFilter").addEventListener("change",renderOffers);
byId("ipoRefresh").addEventListener("click",load);
byId("ipoExport").addEventListener("click",()=>{
  const cols=["name","subscription_start","subscription_end","payment_date","offering_price_raw","rcept_no","source"];
  const quote=v=>{let s=String(v==null?"":v);if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const csv="\uFEFF"+[cols.join(",")].concat(filtered().map(row=>cols.map(k=>quote(row[k])).join(","))).join("\r\n");
  const uri=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=uri;a.download="stargate-ipo-disclosures.csv";a.click();
  setTimeout(()=>URL.revokeObjectURL(uri),1000);
});
load();
})();
