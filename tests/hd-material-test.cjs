const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../course-workspace/hd-map.js'),'utf8');
function renderer(loads){
  let requests=0,paint=0;
  const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),createPattern:()=>({}),drawImage(){paint++;}},{get:(o,k)=>o[k]||(()=>{})});
  const document={currentScript:{src:'http://localhost/course-workspace/hd-map.js'},createElement:()=>({getContext:()=>context,toBlob:cb=>cb(new Blob(['test'],{type:'image/png'}))})};
  class Image{set src(value){requests++;assert.equal(value,'http://localhost/course-workspace/assets/turf-material-v1.png');queueMicrotask(()=>loads?this.onload():this.onerror());}}
  const env={module:{exports:{}},require,document,Image,URL,Blob,structuredClone,setTimeout,clearTimeout};vm.runInNewContext(source,env);return {api:env.module.exports,requests:()=>requests,paint:()=>paint};
}
const hole=()=>({n:1,fairway:[[121,31],[121.001,31],[121.001,31.004],[121,31.004]],tees:{black:[121.0005,31]},flag:[121.0005,31.0039]});
test('local grass material is cached, source geometry and projection are unchanged',async()=>{
  const r=renderer(true),h=hole(),before=JSON.stringify(h),layout=r.api.layout(h,2048),result=await r.api.render(h,'Test',2048);
  assert.equal(result.visual.material,'turf-material-v1');assert.equal(result.visual.generator,'coordinate-hd/2');assert.equal(result.visual.accuracy_m,null);
  assert.equal(JSON.stringify(result.visual.controls),JSON.stringify(layout.controls));assert.equal(JSON.stringify(h),before);
  await r.api.render(h,'Test',2048);assert.equal(r.requests(),1);assert.equal(r.paint(),2);
});
test('missing material falls back without losing render or claiming field accuracy',async()=>{
  const r=renderer(false),result=await r.api.render(hole(),'Test',2048);assert.equal(result.visual.material,'procedural-fallback');assert.equal(result.visual.accuracy_m,null);assert.ok(result.blob.size);assert.equal(r.paint(),0);
});
test('empty course cannot generate geography and does not load material',async()=>{
  const r=renderer(true);await assert.rejects(r.api.render({n:1},'Empty',2048),/几何/);assert.equal(r.requests(),0);
});
test('render snapshots geometry before asynchronous material loading',async()=>{
  const r=renderer(true),h=hole(),signature=r.api.signature(h),pending=r.api.render(h,'Test',2048);h.fairway[0][0]+=.01;
  const result=await pending;assert.equal(result.visual.source_signature,signature);
});
