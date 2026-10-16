import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../board/board.js',import.meta.url),'utf8');
async function setup() {
  const elements=new Map();const timers=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',addEventListener(type,fn){this[type]=fn;}});return elements.get(id);};
  const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[]},location:{pathname:'/board/',hostname:'localhost'},Headers,fetch:async()=>({ok:true,json:async()=>({ready:false})}),setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},window:{}});
  vm.runInContext(source,context);await new Promise(resolve=>setImmediate(resolve));
  return {context,element,timers};
}
test('Google button immediately shows progress and starts same-window redirect',async()=>{
  const {context,element,timers}=await setup();let redirected=false;
  context.start=()=>{redirected=true;return new Promise(()=>{});};
  vm.runInContext('auth={};authSdk={GoogleAuthProvider:class {setCustomParameters(){}},signInWithRedirect:start};',context);
  element('login').click();assert.equal(redirected,true);assert.equal(element('login').disabled,true);assert.match(element('status').textContent,/현재 창/);
  timers[0]();assert.equal(element('login').disabled,false);assert.match(element('status').textContent,/새로고침/);
});
test('login configuration errors restore the button and explain the failure',async()=>{
  const {context,element}=await setup();context.start=async()=>{throw {code:'auth/unauthorized-domain'};};
  vm.runInContext('auth={};authSdk={GoogleAuthProvider:class {setCustomParameters(){}},signInWithRedirect:start};',context);
  await element('login').click();assert.equal(element('login').disabled,false);assert.match(element('status').textContent,/허용 도메인/);
});
