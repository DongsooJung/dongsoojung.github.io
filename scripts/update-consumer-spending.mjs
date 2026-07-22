import fs from 'node:fs/promises';

const OUT = new URL('../consumer-spending/data/latest.json', import.meta.url);
const providers = {
  kb: { name: 'KB국민카드 DataRoot', url: process.env.KB_CARD_API_URL, key: process.env.KB_CARD_API_KEY },
  shinhan: { name: '신한카드 DataBada', url: process.env.SHINHAN_CARD_API_URL, key: process.env.SHINHAN_CARD_API_KEY }
};
const categories = [
  ['food','외식',/외식|음식|식음|카페|주점/],['retail','유통',/유통|마트|백화점|편의점|소매/],
  ['travel','여행·숙박',/여행|숙박|관광|항공/],['mobility','교통',/교통|운송|택시|자동차|주유/],
  ['culture','문화·여가',/문화|여가|스포츠|오락|공연/],['health','의료',/의료|건강|병원|약국/],
  ['education','교육',/교육|학원|서적/],['digital','온라인',/온라인|전자상거래|통신|디지털/]
];

const value = (o, names) => names.map(n=>o?.[n]).find(v=>v!==undefined&&v!==null);
function rows(payload){
  const candidates=[payload,payload?.data,payload?.records,payload?.list,payload?.items,payload?.body?.items?.item,payload?.response?.body?.items?.item];
  const found=candidates.find(Array.isArray); if(!found) throw new Error('지원되는 레코드 배열을 찾지 못했습니다.'); return found;
}
function monthOf(r){
  const raw=String(value(r,['month','ym','baseMonth','BASE_YM','SALE_YM','STDR_YM','기준년월'])??'').replace(/[^0-9]/g,'');
  return raw.length>=6?`${raw.slice(0,4)}-${raw.slice(4,6)}`:null;
}
function categoryOf(r){
  const raw=String(value(r,['category','categoryName','CATEGORY_NM','UPJONG_NM','INDUTY_NM','업종명'])??'');
  return categories.find(([, , re])=>re.test(raw))?.[0]??null;
}
function amountOf(r){
  const n=Number(String(value(r,['amount','salesAmount','paymentAmount','AMOUNT','SALES_AMT','PAYMENT_AMT','이용금액'])??'').replace(/,/g,''));
  return Number.isFinite(n)&&n>=0?n:null;
}
async function fetchProvider(id, cfg){
  if(!cfg.url||!cfg.key) return {id,status:'awaiting_credentials',data:new Map()};
  const url=cfg.url.replaceAll('{API_KEY}',encodeURIComponent(cfg.key));
  const headers={accept:'application/json'}; if(!cfg.url.includes('{API_KEY}')) headers.authorization=`Bearer ${cfg.key}`;
  const res=await fetch(url,{headers,signal:AbortSignal.timeout(30000)}); if(!res.ok) throw new Error(`${id} API HTTP ${res.status}`);
  const grouped=new Map();
  for(const r of rows(await res.json())){const m=monthOf(r),c=categoryOf(r),a=amountOf(r);if(!m||!c||a===null)continue;const key=`${m}|${c}`;grouped.set(key,(grouped.get(key)||0)+a)}
  if(!grouped.size) throw new Error(`${id} API 응답에 유효한 월·업종·금액 레코드가 없습니다.`);
  return {id,status:'connected',data:grouped};
}
function toIndex(result, months){
  const out=new Map();
  for(const [id] of categories){const values=months.map(m=>result.data.get(`${m}|${id}`)??null);const base=values.find(v=>v>0);values.forEach((v,i)=>out.set(`${months[i]}|${id}`,v!==null&&base?+(v/base*100).toFixed(1):null))}
  return out;
}

const previous=JSON.parse(await fs.readFile(OUT,'utf8'));
const results={};
for(const [id,cfg] of Object.entries(providers)){
  try{results[id]=await fetchProvider(id,cfg)}
  catch(e){console.error(`${id}: ${e.message}`);results[id]={id,status:'error',data:new Map()}}
}
const connected=Object.values(results).filter(r=>r.status==='connected');
if(connected.length){
  const months=[...new Set(connected.flatMap(r=>[...r.data.keys()].map(k=>k.slice(0,7))))].sort().slice(-18);
  const idx=Object.fromEntries(connected.map(r=>[r.id,toIndex(r,months)]));
  const priorRows=Array.isArray(previous.monthly?.[0])?[]:previous.monthly;
  const prior=new Map(priorRows.map(r=>[r.month,r]));
  const monthly=months.map(month=>({month,values:Object.fromEntries(categories.map(([id])=>[id,{
    kb:idx.kb?.get(`${month}|${id}`)??prior.get(month)?.values?.[id]?.kb??null,
    shinhan:idx.shinhan?.get(`${month}|${id}`)??prior.get(month)?.values?.[id]?.shinhan??null
  }]))}));
  const complete=connected.length===2;
  const output={meta:{mode:complete?'live':'partial',asOf:months.at(-1),updatedAt:new Date().toISOString(),baseMonth:months[0],unit:'index',providers:Object.fromEntries(Object.entries(providers).map(([id,cfg])=>[id,{status:results[id].status,source:cfg.name}]))},categories:categories.map(([id,label])=>({id,label})),monthly};
  await fs.writeFile(OUT,JSON.stringify(output,null,2)+'\n');
  console.log(`소비 데이터 ${months.length}개월 갱신 완료 (${complete?'2개':'1개'} 제공사)`);
} else {
  console.log('연결된 카드사 API가 없어 기존 파일을 유지합니다.');
}
