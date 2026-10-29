import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const geometry=JSON.parse(readFileSync(new URL('../assets/korea-district-boundaries.json',import.meta.url),'utf8'));
const script=readFileSync(new URL('../assets/visitor-regions.js',import.meta.url),'utf8');
class Element{constructor(){this.children=[];this.style={};this.textContent='';this.listeners={}}append(...n){this.children.push(...n)}replaceChildren(...n){this.children=n}setAttribute(name,value){(this.attributes ||= {})[name]=value}removeAttribute(name){delete this.attributes?.[name]}addEventListener(name,fn){this.listeners[name]=fn}}
async function browser(data,ok=true,location={origin:'https://stargate.stargate8225.workers.dev',pathname:'/admin/visitors/'},status=200){const nodes=new Map();const get=n=>{if(!nodes.has(n))nodes.set(n,new Element());return nodes.get(n)};const root=new Element();root.querySelector=get;const requests=[];runInNewContext(script,{document:{querySelector:()=>root,getElementById:get,createElement:()=>new Element(),createElementNS:()=>new Element()},location,Intl,AbortSignal,fetch:async(url,options)=>{if(url.startsWith('/assets/korea-district-boundaries.json'))return {ok:true,status:200,json:async()=>geometry};requests.push({url,options});return {ok,status,json:async()=>data}}});await new Promise(r=>setImmediate(r));return {get,requests}}
test('renders regional ranking safely and explains unknown coverage',async()=>{const {get,requests}=await browser({source:'cloudflare',total_clicks:4,located_clicks:3,unknown_clicks:1,started_at:'2026-10-29T06:00:00Z',districts:[{code:'11680',province_name:'서울특별시',name:'강남구',clicks:2,share:50},{code:'11110',province_name:'서울특별시',name:'종로구',clicks:1,share:25}],regions:[]});assert.equal(get('[data-region-list]').children.length,2);assert.match(get('[data-region-list]').children[0].children[0].children[0].textContent,/서울특별시 강남구/);assert.match(get('[data-region-status]').textContent,/미확인·해외 1회/);assert.equal(requests[0].url,'/api/admin/analytics/get_site_region_stats');assert.equal(requests[0].options.credentials,'same-origin');assert.equal(requests[0].options.redirect,'manual');assert.equal(JSON.parse(requests[0].options.body).p_days,30);get('period-days').value='90';await get('period-days').listeners.change();assert.equal(JSON.parse(requests.at(-1).options.body).p_days,90)});
test('empty data and network failure are distinguishable',async()=>{const b=await browser({source:'cloudflare',total_clicks:0,located_clicks:0,unknown_clicks:0,regions:[]});assert.match(b.get('[data-region-status]').textContent,/아직 없습니다/);const failed=await browser({},false);assert.match(failed.get('[data-region-status]').textContent,/연결하지 못했습니다/)});

test('public pages never request private regional data and expired login clears results',async()=>{const publicPage=await browser({},true,{origin:'https://stargateedu.co.kr',pathname:'/'});assert.equal(publicPage.requests.length,0);const expired=await browser({},false,undefined,401);assert.match(expired.get('[data-region-status]').textContent,/로그인이 필요/);assert.equal(expired.get('[data-region-list]').children.length,0)});


test('district map supports province zoom and district selection with only verified aggregates',async()=>{
 const data={source:'cloudflare',total_clicks:10,located_clicks:8,unknown_clicks:2,districts:[{code:'11680',province_name:'서울특별시',name:'강남구',clicks:2,share:20},{code:'11110',province_name:'서울특별시',name:'종로구',clicks:3,share:30}],regions:[{country:'US',region:'California',clicks:2,share:20}],hourly:[{hour:14,clicks:2}]};
 const b=await browser(data);let svg=b.get('[data-region-map]').children[0];
 assert.equal(svg.children.length,geometry.districts.length);const gangnam=svg.children.find(p=>p.attributes['data-district-code']==='11680');
 assert.match(gangnam.attributes['aria-label'],/강남구: 2회/);gangnam.listeners.click();assert.match(b.get('[data-region-map-detail]').textContent,/서울특별시 강남구\n2회 클릭/);
 assert.match(b.get('[data-region-map-summary]').textContent,/시군구 확인 5회/);assert.match(b.get('[data-region-map-summary]').textContent,/미확인·해외 5회/);
 b.get('[data-province-select]').value='11';await b.get('[data-province-select]').listeners.change();await new Promise(r=>setImmediate(r));
 svg=b.get('[data-region-map]').children[0];assert.equal(svg.children.length,geometry.districts.filter(d=>d.province_code==='11').length);
 b.get('[data-district-select]').value='11680';await b.get('[data-district-select]').listeners.change();await new Promise(r=>setImmediate(r));assert.match(b.get('[data-region-map-detail]').textContent,/강남구/);
 assert.equal(b.get('[data-hourly-chart]').children.length,24);
 const expired=await browser({},false,undefined,401);assert.equal(expired.get('[data-region-map]').children.length,0);assert.equal(expired.get('[data-hourly-chart]').children.length,0);
});

test('public visitor report uses only the anonymous aggregate API',async()=>{
 const b=await browser({source:'cloudflare',total_clicks:0,located_clicks:0,unknown_clicks:0,regions:[]},true,{origin:'https://stargateedu.co.kr',pathname:'/visitors/'});
 assert.equal(b.requests[0].url,'https://stargate.stargate8225.workers.dev/api/analytics/get_site_region_summary');assert.equal(b.requests[0].options.credentials,'omit');
 assert.ok(!b.requests.some(r=>r.url.includes('/api/admin/')));
 b.get('period-days').value='7';await b.get('period-days').listeners.change();assert.equal(JSON.parse(b.requests.at(-1).options.body).p_days,7);
});

