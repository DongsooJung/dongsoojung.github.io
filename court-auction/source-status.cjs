'use strict';
const plain=v=>String(v??'').replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
function statusKey(court,date,caseNo,item){return [court,String(date).replaceAll('-',''),plain(caseNo),String(item??'')].join(':');}
function readChanges(raw){
 const d=raw?.data?.result;if(!d||!d.inputData)throw Error('Court detail correction schema changed');
 const meta=d.inputData,withdrawn=new Set(),corrections=new Map();
 for(const [kind,target]of [['rtrcnPbancLst',withdrawn],['crrctPbancLst',corrections]]){
  if(!Array.isArray(d[kind]))throw Error('Court notice status list missing');
  for(const row of d[kind]){
   const key=statusKey(meta.cortOfcCd,meta.dspslDxdyYmd,row.csNo,row.dspslSeq);
   if(!row.csNo||row.dspslSeq==null)throw Error('Court status identity incomplete');
   if(target instanceof Set)target.add(key);else target.set(key,plain(row.crrctPbancCtt||row.crrctCtt||'정정 공고 있음 · 원문 확인'));
  }
 }
 return {withdrawn,corrections};
}
function applyChanges(records,changes){
 let excluded=0,corrected=0;const result=[];
 for(let record of records){const key=statusKey(record.법원코드,record.매각기일,record.사건번호,record.물건번호);
  if(changes.withdrawn.has(key)){excluded++;continue;}
  if(changes.corrections.has(key)){record={...record,비고:record.비고+' · 정정 공고: '+changes.corrections.get(key)};corrected++;}
  result.push(record);
 }
 return {records:result,excluded,corrected};
}
module.exports={readChanges,applyChanges,statusKey};
