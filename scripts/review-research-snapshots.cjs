const fs = require('node:fs');
const {createHash} = require('node:crypto');
const {catalogFile,render} = require('./research-catalog.cjs');
const snapshots={
 '/exchange-rate/':'/exchange-rate/data.json',
 '/trade/':'/trade/data.json',
 '/korea-tourism/':'/korea-tourism/data.json',
 '/research/airport-congestion/':'/research/airport-congestion/data/latest.json',
 '/research/gimpo-airport-congestion/':'/research/gimpo-airport-congestion/data/latest.json',
 '/naver-cafe-research/':'/naver-cafe-research/data/latest.json'
};
function inspectSnapshot(key,d,checkedAt){
 const result={dataAsOf:null,dataPeriod:null,snapshotUpdatedAt:d.updatedAt||d.fetchedAt||d.generated_at||null,collectedAt:d.collectedAt||d.fetchedAt||d.generated_at||null,checkedAt,reviewStatus:'snapshot_checked',freshness:'unverified',issues:[],source:{label:d.source||null,url:d.sourceUrl||d.source_url||null,verification:'declared'}};
 if(d.status==='error')throw Error('Snapshot reports collection error');
 if(key==='/exchange-rate/'){
  result.dataAsOf=d.observedAt||null;result.dataPeriod=d.series?.at(-1)?.ym||null;
  result.issues.push('10월은 진행 중인 월의 부분 집계입니다.');
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
 }else if(key==='/naver-cafe-research/'){
  const date=String(d.sourceStatDate||'');
  if(/^\d{8}/.test(date))result.dataAsOf=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
 }else if(key==='/research/airport-congestion/'){
  const date=String(d.forecast_dates?.today||'');
  if(/^\d{8}$/.test(date))result.dataAsOf=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  result.source={label:d.source||'인천국제공항공사',url:d.source_urls?.forecast||null,verification:'declared'};
 }else if(key==='/research/gimpo-airport-congestion/'){
  result.issues.push('원자료 observed_at은 시각만 제공하므로 관측 기준일의 원출처 대조가 필요합니다.');
  result.dataAsOf=null;
 }
 if(!result.dataPeriod&&result.dataAsOf)result.dataPeriod=result.dataAsOf.slice(0,7);
 if(result.dataPeriod&&result.dataPeriod>checkedAt.slice(0,7))throw Error('Future data period rejected');
 if(result.dataPeriod)result.freshness=result.dataPeriod>='2026-09'?'target_period_in_snapshot':'older_than_target';
 for(const date of [result.dataAsOf,result.snapshotUpdatedAt,result.collectedAt].filter(Boolean))if(date.slice(0,10)>checkedAt.slice(0,10))throw Error('Future date rejected');
 return result;
}
function snapshotFingerprint(data){
 return createHash('sha256').update(JSON.stringify({series:data.series,countries:data.countries,latestYm:data.latestYm,countryLatestYm:data.countryLatestYm,sourceMode:data.sourceMode,sourceUrl:data.sourceUrl})).digest('hex');
}
function reconcileSnapshot(entry,key,data,checkedAt,url){
 const inspected=inspectSnapshot(key,data,checkedAt),fingerprint=snapshotFingerprint(data);
 const preserve=['verified','awaiting_publication'].includes(entry.reviewStatus)&&entry.verifiedDataHash===fingerprint;
 const original=preserve?{reviewStatus:entry.reviewStatus,source:entry.source,issues:entry.issues,freshness:entry.freshness}:{};
 const official=(entry.evidence||[]).filter(e=>e.kind==='official-source');
 Object.assign(entry,inspected,original);
 entry.evidence=[...official,{kind:'published-snapshot',url,checkedAt,fields:{dataPeriod:entry.dataPeriod,dataAsOf:entry.dataAsOf,snapshotUpdatedAt:entry.snapshotUpdatedAt}}];
 return entry;
}
async function main(){
 const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
 const results=await Promise.allSettled(Object.entries(snapshots).map(async([key,file])=>{
  const url='https://www.stargateedu.co.kr'+file;
  const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}});
  if(!response.ok)throw Error(`${key}: HTTP ${response.status}`);
  const data=await response.json(),checkedAt=new Date().toISOString();
  const entry=catalog.projects.find(p=>p.key===key);if(!entry)throw Error('Missing project '+key);
  reconcileSnapshot(entry,key,data,checkedAt,url);
  return {key,reviewStatus:entry.reviewStatus,dataPeriod:entry.dataPeriod,issues:entry.issues};
 }));
 fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+'\n');render(catalog);
 results.forEach(r=>console.log(JSON.stringify(r.status==='fulfilled'?r.value:{error:String(r.reason)})));
 if(results.some(r=>r.status==='rejected'))process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={inspectSnapshot,snapshotFingerprint,reconcileSnapshot};
