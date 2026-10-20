const fs = require('node:fs');
const {createHash} = require('node:crypto');
const path = require('node:path');
const koreaDay = iso => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
const {catalogFile,render} = require('./research-catalog.cjs');
const snapshots={
 '/exchange-rate/':'/exchange-rate/data.json',
 '/trade/':'/trade/data.json',
 '/korea-tourism/':'/korea-tourism/data.json',
 '/research/airport-congestion/':'/research/airport-congestion/data/latest.json',
 '/research/gimpo-airport-congestion/':'/research/gimpo-airport-congestion/data/latest.json',
 '/naver-cafe-research/':'/naver-cafe-research/data/latest.json',
 '/google-trends/':'/google-trends/data.json',
 '/airbnb/':'/airbnb/candidates.json'
};
function inspectSnapshot(key,d,checkedAt){
 const result={dataAsOf:null,dataPeriod:null,snapshotUpdatedAt:d.updatedAt||d.fetchedAt||d.generated_at||null,collectedAt:d.collectedAt||d.fetchedAt||d.generated_at||null,checkedAt,reviewStatus:'snapshot_checked',freshness:'unverified',issues:[],source:{label:d.source||null,url:d.sourceUrl||d.source_url||null,verification:'declared'}};
 if(d.status==='error')throw Error('Snapshot reports collection error');
 if(key==='/exchange-rate/'){
  result.dataAsOf=d.observedAt||null;result.dataPeriod=d.series?.at(-1)?.ym||null;
  result.issues.push('10월은 진행 중인 월의 부분 집계입니다. 환율 외 금리·물가·비트코인·시장 지표는 별도 원출처 대조가 필요합니다.');
 }else if(key==='/trade/'){
  result.dataPeriod=d.latestYm||null;result.source={label:'관세청 · 월별 총계/국가별 통계',url:'https://unipass.customs.go.kr/ets/',verification:'declared'};
  if(d.countryLatestYm!==d.latestYm)result.issues.push(`국가별 기준 ${d.countryLatestYm||'미확인'}와 총계 기준 ${d.latestYm||'미확인'}가 다릅니다.`);
  const last=d.series?.at(-1);
  if(last&&Math.abs(Number(last.exp)-Number(last.imp)-Number(last.bal))>1)result.issues.push('최신 월 수출−수입과 무역수지가 백만 달러 반올림 허용 범위(1)를 넘어 원표 대조가 필요합니다.');
  if(d.aggregateSource)result.issues.push('총계 출처 표기: '+d.aggregateSource);
  result.reviewStatus='needs_review';
 }else if(key==='/korea-tourism/'){
  result.dataPeriod=d.series?.at(-1)?.ym||null;
  if(result.dataPeriod<'2026-09')result.issues.push(`${result.dataPeriod} 게시본입니다. ${d.nextPublication?`${d.nextPublication.dataPeriod} 자료 ${d.nextPublication.scheduledAt} 공표 예정`:'후속 공식 공표 자료 확인이 필요합니다.'}`);
 }else if(key==='/google-trends/'){
  result.source={label:'Google Trends 공개 Trending Now',url:'https://trends.google.com/trending?geo=KR&hl=ko&hours=48',verification:'declared'};
  result.issues.push('48시간 이동창 게시본입니다. 파일 updatedAt을 관측 기준일이나 공식 재대조일로 사용하지 않습니다.');
 }else if(key==='/airbnb/'){
  result.snapshotUpdatedAt=d.checked_at_kst||null;result.collectedAt=d.checked_at_kst||null;
  result.source={label:'당근부동산 공개 매물 수집본',url:'https://realty.daangn.com',verification:'declared'};
  result.issues.push('수집 시각은 매물의 실제 관측일·계약 가능일이 아닙니다. 후보·점수 변경은 개별 원문 재대조가 필요합니다.');
 }else if(key==='/naver-cafe-research/'){
  result.issues.push('API 응답 일부이며 조회수 순위·월간 전수 통계가 아닙니다. 집계코드 '+String(d.sourceStatDate||'미확인')+'를 원문대로 보존하며 시간 의미를 추정하지 않습니다. 주제는 자체 제목 키워드 규칙입니다.');
  const date=String(d.sourceStatDate||'');
  if(/^\d{8}/.test(date))result.dataAsOf=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
 }else if(key==='/research/airport-congestion/'){
  result.issues.push('일별 예상 승객·대기 관측의 게시본입니다. 완성된 월간 실적이 아니며 혼잡 등급은 화면 자체 상대 산정입니다.');
  const date=String(d.forecast_dates?.today||'');
  if(/^\d{8}$/.test(date))result.dataAsOf=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  result.source={label:d.source||'인천국제공항공사',url:d.source_urls?.forecast||null,verification:'declared'};
 }else if(key==='/research/gimpo-airport-congestion/'){
  result.issues.push('원자료 observed_at은 시각만 제공하므로 관측 기준일의 원출처 대조가 필요합니다.');
  result.dataAsOf=null;
 }
 if(!result.dataPeriod&&result.dataAsOf)result.dataPeriod=result.dataAsOf.slice(0,7);
 const checkedDay=koreaDay(checkedAt);
 if(result.dataPeriod&&result.dataPeriod>checkedDay.slice(0,7))throw Error('Future data period rejected');
 if(result.dataPeriod)result.freshness=result.dataPeriod>='2026-09'?'target_period_in_snapshot':'older_than_target';
 for(const date of [result.dataAsOf,result.snapshotUpdatedAt,result.collectedAt].filter(Boolean)){
  const future=/^\d{4}-\d{2}-\d{2}$/.test(date)?date>checkedDay:!Number.isFinite(Date.parse(date))||Date.parse(date)>Date.parse(checkedAt)+300000;
  if(future)throw Error('Future date rejected');
 }
 return result;
}
function snapshotFingerprint(data){
 return createHash('sha256').update(JSON.stringify({series:data.series,countries:data.countries,latestYm:data.latestYm,countryLatestYm:data.countryLatestYm,sourceMode:data.sourceMode,sourceUrl:data.sourceUrl,cafeId:data.cafeId,sourceStatDate:data.sourceStatDate,articles:data.articles,forecast_dates:data.forecast_dates,forecast:data.forecast,waiting:data.waiting,airport:data.airport,observed_at:data.observed_at,overall:data.overall,zones:data.zones,items:data.items,geo:data.geo,hours:data.hours,candidates:data.candidates,filters:data.filters})).digest('hex');
}
function reconcileSnapshot(entry,key,data,checkedAt,url){
 const inspected=inspectSnapshot(key,data,checkedAt),fingerprint=snapshotFingerprint(data);
 const preserve=['verified','awaiting_publication'].includes(entry.reviewStatus)&&entry.verifiedDataHash===fingerprint;
 const prior={reviewStatus:entry.reviewStatus,source:entry.source,issues:entry.issues||[],freshness:entry.freshness,evidence:entry.evidence||[],checkedAt:entry.checkedAt};
 if(preserve){for(const field of ['dataAsOf','dataPeriod','snapshotUpdatedAt','collectedAt'])if(entry[field]===undefined&&inspected[field]!==null)entry[field]=inspected[field];return entry;}
 Object.assign(entry,inspected);
 entry.source={...prior.source,...inspected.source,label:inspected.source.label||prior.source?.label,url:inspected.source.url||prior.source?.url,verification:'declared'};
 entry.previousReview={checkedAt:prior.checkedAt,reviewStatus:prior.reviewStatus,source:prior.source,issues:prior.issues};
 entry.issues=[...inspected.issues];
 if(prior.reviewStatus==='needs_review')entry.reviewStatus='needs_review';
 if(prior.reviewStatus==='verified'){
  entry.previousVerification={checkedAt:prior.checkedAt,dataHash:entry.verifiedDataHash,issues:prior.issues,scope:'과거 원출처 대조 이력. 현재 변경 게시본의 대조 완료를 뜻하지 않음.'};
  entry.issues.push('자동 수집으로 대조 당시의 게시 값이 바뀌었습니다. 과거 원출처 근거를 보존하며 현재 값은 재대조 대기입니다.');
 }
 entry.evidence=[...prior.evidence.filter(e=>e.kind!=='published-snapshot'||e.sha256),{kind:'published-snapshot',url,checkedAt,sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex'),dataHash:fingerprint,scope:'현재 게시본의 기간·수집 필드와 값 변경만 점검. 공식 원출처 재대조가 아님.',fields:{dataPeriod:entry.dataPeriod,dataAsOf:entry.dataAsOf,snapshotUpdatedAt:entry.snapshotUpdatedAt}}];
 return entry;
}
function publicationDue(data,checkedAt){
 const date=data.nextPublication?.scheduledAt;
 return !date||koreaDay(checkedAt)>=date;
}
async function main(){
 const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
 const results=await Promise.allSettled(Object.entries(snapshots).map(async([key,file])=>{
  const entry=catalog.projects.find(p=>p.key===key);if(!entry)throw Error('Missing project '+key);
  if(entry.reviewStatus==='awaiting_publication'){
   const published=JSON.parse(fs.readFileSync(path.join(__dirname,'..',file.slice(1)),'utf8'));
   if(!publicationDue(published,new Date().toISOString()))return {key,skipped:'publication_not_due',nextEligibleDate:published.nextPublication.scheduledAt};
  }
  const url='https://www.stargateedu.co.kr'+file;
  const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}});
  if(!response.ok)throw Error(`${key}: HTTP ${response.status}`);
  const data=await response.json(),checkedAt=new Date().toISOString();
  reconcileSnapshot(entry,key,data,checkedAt,url);
  return {key,reviewStatus:entry.reviewStatus,dataPeriod:entry.dataPeriod,issues:entry.issues};
 }));
 fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+'\n');render(catalog);
 results.forEach(r=>console.log(JSON.stringify(r.status==='fulfilled'?r.value:{error:String(r.reason)})));
 if(results.some(r=>r.status==='rejected'))process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={inspectSnapshot,snapshotFingerprint,reconcileSnapshot,publicationDue};
