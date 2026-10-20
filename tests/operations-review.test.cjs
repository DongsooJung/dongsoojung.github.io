const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const s=fs.readFileSync(path.join(__dirname,'../onenote-notion-status/app.js'),'utf8');
const start=s.indexOf('  function summarizeProbes('),end=s.indexOf('  async function probeClient(');assert.ok(start>0&&end>start);
const fn=vm.runInNewContext(s.slice(start,end)+'\n({summarizeProbes,rollup})');
test('missing status is never reported as operational or a confirmed outage',()=>{
 assert.equal(fn.summarizeProbes([]).state,'unknown');
 assert.equal(fn.summarizeProbes([{ok:false,state:'unknown',latencyMs:50}]).state,'unknown');
 assert.equal(fn.summarizeProbes([{ok:true,state:'operational',latencyMs:12},{ok:false,state:'unknown'}]).state,'unknown');
 assert.equal(fn.rollup('unknown','unknown'),'unknown');assert.equal(fn.rollup('operational','unknown'),'unknown');
});
test('confirmed failures remain visible and latency excludes absent or invalid values',()=>{
 assert.equal(fn.rollup('unknown','down'),'down');assert.equal(fn.rollup('degraded','operational'),'degraded');
 const result=fn.summarizeProbes([{ok:true,state:'operational',latencyMs:100},{ok:true,state:'operational',latencyMs:null},{ok:true,state:'operational',latencyMs:NaN},{ok:false,state:'unknown',latencyMs:999}]);assert.equal(result.avgLatencyMs,100);assert.equal(result.state,'unknown');
 assert.equal(fn.summarizeProbes([{ok:false,state:'down'}]).state,'down');
});
