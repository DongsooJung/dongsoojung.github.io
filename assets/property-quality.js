(function(root){
 'use strict';
 function validateMonthly(d){
  if(!Array.isArray(d.months)||!d.months.length||new Set(d.months).size!==d.months.length||!Array.isArray(d.types)||!d.types.length)throw Error('거래량 기간/유형이 비어 있거나 중복입니다.');
  if(d.total?.length!==d.months.length)throw Error('월별 합계 길이가 다릅니다.');
  for(let i=0;i<d.months.length;i++){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.months[i])||(i>0&&d.months[i]<=d.months[i-1]))throw Error('월 순서가 잘못되었습니다.');
   let sum=0;for(const type of d.types){const n=d.series?.[type]?.[i];if(!Number.isSafeInteger(n)||n<0||d.series[type].length!==d.months.length)throw Error('유형별 거래량이 유효하지 않습니다.');sum+=n;}
   if(sum!==d.total[i])throw Error('유형별 합계와 총 거래량이 다릅니다.');
  }
  const partial=new Set(d.meta?.partialMonths||[]);const reference=d.months.findLastIndex(m=>!partial.has(m));
  return {referenceIndex:reference<0?d.months.length-1:reference,partial};
 }
 function joinDistricts(features,districts){
  const keys=features.map(f=>f.properties?.name_eng);
  if(keys.length!==25||new Set(keys).size!==25||Object.keys(districts||{}).length!==25)throw Error('25개 자치구 경계/통계의 범위가 다릅니다.');
  for(const f of features){const d=districts[f.properties.name_eng];if(!d||d.ko!==f.properties.name||!['price','vol','yoy','n','previousN'].every(k=>typeof d[k]==='number'&&Number.isFinite(d[k]))||d.price<=0||d.vol<0||d.n<=0||d.previousN<=0)throw Error('자치구 지표 조인 또는 가격 표본이 유효하지 않습니다.');}
  return true;
 }
 const api={validateMonthly,joinDistricts};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PropertyQuality=api;
})(globalThis);
