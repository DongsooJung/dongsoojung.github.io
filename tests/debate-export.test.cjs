const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('debate CSV exports the displayed weighted score and identifies unverified evidence',async()=>{
 const html=fs.readFileSync(require.resolve('../research/debate-analyzer/index.html'),'utf8');
 const start=html.lastIndexOf("document.querySelector('#download').onclick=function(){");
 assert.ok(start>=0);
 const handler=html.slice(start,html.indexOf('\n};',start)+3);
 let onclick,blob,clicked=false;
 const context={
  defs:[['evidence','근거·사실성'],['logic','논리·일관성']],
  v3Data:{sourceUrl:'https://example.org/transcript?q="quote"',participants:[{name:'가, "후보"',scores:{evidence:10,logic:90},total:50,weightedScore:26,confidence:75}]},
  document:{querySelector:()=>({set onclick(v){onclick=v;}}),createElement:()=>({click(){clicked=true;}})},
  Blob,URL:{createObjectURL(value){blob=value;return 'blob:test';},revokeObjectURL(){}},alert(){throw Error('unexpected empty export');}
 };
 vm.runInNewContext(handler,context);onclick();assert.ok(clicked);
 const csv=await blob.text();
 assert.match(csv,/"가중 종합","입력 충분성","분석방식","팩트체크","원문URL\(미검증\)"/);
 assert.ok(csv.includes('"가, ""후보""","10","90","26","75","키워드 규칙 v0.3","미수행"'));
 assert.ok(csv.includes('https://example.org/transcript?q=""quote""'));
});
