const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('RAG route selection exposes unmeasured evidence and supports keyboard tabs',()=>{
 const html=fs.readFileSync(require.resolve('../rag-graphrag/index.html'),'utf8');
 const fields=new Map();
 const element=()=>({textContent:'',tabIndex:0,attrs:{},handlers:{},classList:{toggle(){},add(){}},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.handlers[k]=fn;},focus(){this.focused=true;}});
 const tabs=['fact','entity','multihop','global'].map(mode=>Object.assign(element(),{dataset:{mode}}));
 const context={window:{},document:{querySelectorAll:s=>s==='.query-tab'?tabs:[],getElementById:id=>{if(!fields.has(id))fields.set(id,element());return fields.get(id);}}};
 const script=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
 vm.runInNewContext(script,context);
 assert.equal(tabs[0].attrs['aria-selected'],'true');
 tabs[3].handlers.click();assert.equal(fields.get('mode-title').textContent,'GraphRAG Global');
 assert.match(fields.get('out-cost').textContent,/Map.*Reduce/);
 assert.match(fields.get('out-latency').textContent,/미측정/);
 assert.equal(fields.get('mode-panel').attrs['aria-labelledby'],'tab-global');
 let prevented=false;tabs[3].handlers.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});
 assert.ok(prevented);assert.ok(tabs[0].focused);assert.equal(fields.get('mode-title').textContent,'표준 RAG');
 for(const tab of tabs){tab.handlers.click();assert.match(fields.get('out-latency').textContent,/미측정/);assert.ok(!/^\d+(?:\.\d+)?%?$/.test(fields.get('out-cost').textContent));assert.equal(tabs.filter(t=>t.attrs['aria-selected']==='true').length,1);}
});
