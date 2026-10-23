'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function test(){
 const events={},saved=new Map();let active=false,claimed=false,deleted=false,failLookup=false;
 const source={id:'editor',url:'https://example.test/taizhou-golf-gps/holemap-editor/index.html',postMessage:msg=>messages.push(msg)},messages=[];
 let windows=[source];
 const cache={addAll:async requests=>{for(const r of requests)saved.set(r.url,new Response('cached '+r.url));},match:async u=>saved.get(u)?.clone()};
 const self={location:{href:'https://example.test/taizhou-golf-gps/sw.js'},GOLF_BUILD:{id:'test',files:['cn/map/index.html','app/client.js']},clients:{claim:async()=>{claimed=true;},matchAll:async()=>{if(failLookup)throw Error('lookup failed');return windows;}},addEventListener:(n,fn)=>events[n]=fn,skipWaiting:async()=>{active=true;}};
 const sandbox={self,URL,Request,Response,Set,importScripts:()=>{},caches:{open:async()=>cache,delete:async()=>{deleted=true;}},fetch:async()=>new Response('network')};
 vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),sandbox);
 let task;events.install({waitUntil:p=>task=p});await task;assert.equal(active,false);assert.equal(saved.size,2);
 events.activate({waitUntil:p=>task=p});await task;assert(claimed);assert.equal(deleted,false);
 let response;events.fetch({request:new Request('https://example.test/taizhou-golf-gps/cn/map/?gb=test'),respondWith:p=>response=p});assert((await(await response).text()).startsWith('cached'));
 for(const url of ['https://example.test/taizhou-golf-gps/course-source/venues','https://tiles.test/tile.png','https://example.test/other/app/client.js']){let intercepted=false;events.fetch({request:new Request(url),respondWith:()=>intercepted=true});assert.equal(intercepted,false);}
 events.message({data:{type:'OTHER'},waitUntil:p=>task=p});assert.equal(active,false);
 const activate=async s=>{task=null;events.message({source:s,data:{type:'ACTIVATE_SAVED_UPDATE'},waitUntil:p=>task=p});await task;};
 await activate(undefined);assert.equal(active,false);
 await activate({...source,url:'https://evil.test/taizhou-golf-gps/'});assert.equal(active,false);
 await activate({...source,url:'https://example.test/taizhou-golf-gps-other/'});assert.equal(active,false);
 windows=[source,{id:'second',url:'https://example.test/taizhou-golf-gps/cn/map/'}];
 await activate(source);assert.equal(active,false);assert.equal(messages.at(-1).reason,'other-windows');
 failLookup=true;await activate(source);assert.equal(active,false);assert.equal(messages.at(-1).reason,'check-failed');failLookup=false;
 windows=[source,{id:'unrelated',url:'https://example.test/other/'}];
 await activate(source);assert(active);assert.equal(deleted,false);
 console.log('PASS PWA saved activation, multi-window guard, scoped sender, failure recovery, offline navigation and no data purge. Simulated lifecycle, not iOS certification.');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
