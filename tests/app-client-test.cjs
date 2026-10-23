'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname,'../app/client.js'),'utf8');
function harness(desktop){
  const nodes={},events={},created=[],timers=new Map();let reloads=0,confirmed=true;
  function element(){const e={hidden:false,disabled:false,children:[],setAttribute(){},append(child){this.children.push(child);child.parentElement=this;},replaceChildren(...children){this.children=children;},showModal(){},close(){}};created.push(e);return e;}
  const $=id=>nodes[id]||(nodes[id]={...element(),hidden:['apply','install-help'].includes(id)});
  const waiting={postMessage:msg=>waiting.sent.push(msg),sent:[]};
  const registration={waiting,update:async()=>{},addEventListener(){}};
  const sw={controller:{},register:async()=>registration,addEventListener:(name,fn)=>events[name]=fn};
  const bar=element(),document={currentScript:{src:'https://example.test/tool/app/client.js'},head:element(),body:element(),createElement:element,createTextNode:text=>({text}),getElementById:id=>$(id.replace('golf-app-','')),querySelector:()=>bar};
  vm.runInNewContext(code,{document,window:{GolfDesktop:desktop,addEventListener(){}},navigator:{serviceWorker:sw,onLine:true},location:{protocol:'https:',reload:()=>reloads++},URL,MutationObserver:class{observe(){}},fetch:async()=>({json:async()=>({version:'1.0.0'})}),confirm:()=>confirmed,setTimeout:fn=>{timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id)});
  return {$,events,registration,waiting,timers,created,get reloads(){return reloads;},confirm:value=>confirmed=value};
}
(async()=>{
  let next={update:{version:'1.1.0'}},downloads=0;
  const d=harness({info:async()=>({version:'1.0.0'}),checkUpdate:async()=>{if(next instanceof Error)throw next;return next;},downloadUpdate:async()=>downloads++});
  await d.$('check').onclick();assert.equal(d.$('apply').hidden,false);
  next=new Error('offline');await d.$('check').onclick();assert.equal(d.$('apply').hidden,true);assert.match(d.$('status').textContent,/offline/);
  await d.$('apply').onclick();assert.equal(downloads,0);
  next={update:{version:'1.1.0'}};await d.$('check').onclick();d.confirm(false);await d.$('apply').onclick();assert.equal(downloads,0);d.confirm(true);await d.$('apply').onclick();assert.equal(downloads,1);assert.equal(d.reloads,0);
  next={update:null};await d.$('check').onclick();assert.equal(d.$('apply').hidden,true);
  await d.$('install').onclick();assert(d.created.some(e=>e.href==='https://github.com/liuguanyi-linux/taizhou-golf-gps/releases'));
  const p=harness();await Promise.resolve();await Promise.resolve();
  await p.$('apply').onclick();assert.equal(p.waiting.sent.length,1);assert.equal(p.$('apply').disabled,true);
  p.events.message({source:{},data:{type:'GOLF_UPDATE_BLOCKED',reason:'other-windows'}});assert.equal(p.$('apply').disabled,true);
  p.events.message({source:p.waiting,data:{type:'GOLF_UPDATE_BLOCKED',reason:'other-windows'}});assert.equal(p.$('apply').disabled,false);assert.match(p.$('status').textContent,/关闭其他/);assert.equal(p.reloads,0);assert.equal(p.timers.size,0);
  await p.$('apply').onclick();p.events.controllerchange();assert.equal(p.reloads,1);assert.equal(p.timers.size,0);
  const timeout=harness();await Promise.resolve();await timeout.$('apply').onclick();timeout.timers.get(1)();assert.equal(timeout.$('apply').disabled,false);assert.match(timeout.$('status').textContent,/超时/);timeout.events.controllerchange();assert.equal(timeout.reloads,0);
  console.log('PASS update UI: stale action reset, save confirmation, multi-window refusal/retry, timeout, trusted messages and no silent reload. Mock DOM, not device UI certification.');
})().catch(error=>{console.error(error);process.exitCode=1;});
