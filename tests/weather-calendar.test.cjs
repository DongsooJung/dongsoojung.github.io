const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const script=[...fs.readFileSync(require.resolve('../strategy/weather-calendar/index.html'),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
async function dashboard(initiallyOnline){
 const nodes=new Map(),blobs=[],downloads=[];let online=initiallyOnline;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'서울',innerHTML:'',textContent:'',disabled:false,classList:{add(){},remove(){}},contains(){return false;}});return nodes.get(id);};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const payload={current:{time:today+'T00:00'},daily:{time:[today],weather_code:[0],temperature_2m_max:[20],temperature_2m_min:[10],apparent_temperature_max:[20],apparent_temperature_min:[10],precipitation_probability_max:[0],precipitation_sum:[0],wind_gusts_10m_max:[10]},hourly:{time:[today+'T00:00',today+'T01:00'],temperature_2m:[11,12],precipitation_probability:[0,0]}};
 const ctx={window:{},document:{getElementById:node,addEventListener(){},createElement:()=>({click(){downloads.push(this.download);}})},navigator:{geolocation:{getCurrentPosition(ok){ok({coords:{latitude:35.18,longitude:129.07}});}}},fetch:async()=>{if(!online)throw Error('offline');return {ok:true,json:async()=>payload};},URL:class extends URL{static createObjectURL(){return 'blob:test';}static revokeObjectURL(){}},URLSearchParams,Blob:class{constructor(parts){blobs.push(parts.join(''));}},Intl,Date,console,setInterval(){},clearInterval(){}};
 vm.runInNewContext(script,ctx);await new Promise(r=>setImmediate(r));
 return {node,blobs,downloads,offline(){online=false;},flush:()=>new Promise(r=>setImmediate(r))};
}
test('unavailable forecast cannot become a no-risk statement',async()=>{
 const d=await dashboard(false);assert.match(d.node('alerts').innerHTML,/위험도 확인 대기/);assert.doesNotMatch(d.node('alerts').innerHTML,/신호 없음/);assert.equal(d.node('download-weather').disabled,true);
});
test('failed new-location request clears prior forecasts and disables download',async()=>{
 const d=await dashboard(true);assert.match(d.node('calendar-grid').innerHTML,/available/);d.offline();d.node('locate').onclick();await d.flush();assert.doesNotMatch(d.node('calendar-grid').innerHTML,/day [^"]*available/);assert.match(d.node('alerts').innerHTML,/판단할 수 없습니다/);assert.equal(d.node('download-weather').disabled,true);
});
test('weather CSV preserves dates, data kind, units and actual retrieval time',async()=>{
 const d=await dashboard(true);d.node('download-weather').onclick();assert.equal(d.downloads.length,1);assert.match(d.blobs[0],/temperature_max_c/);assert.match(d.blobs[0],/collected_at/);assert.match(d.blobs[0],/forecast/);assert.match(d.blobs[0],/api.open-meteo.com/);
});
