const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../course-workspace/registration-guide.js');
// Synthetic affine controls test software consistency, not surveyed accuracy.
const point=(x,y)=>({pixel:{x,y},coordinate:[120+x/100000,32+y/100000],source:'manual_map'});
const visual=()=>({width:1000,height:1000,controls:[point(100,100),point(900,100),point(900,900),point(100,900),point(500,500)],checkpoints:[]});
test('guide handles missing image and malformed control list without a false fit',()=>{
 assert.equal(G.assess(null).action,'上传本洞图片');
 assert.equal(G.assess({width:100,height:100,controls:{}}).valid,false);
 const v=visual();v.controls=v.controls.slice(0,2);
 assert.equal(G.assess(v).kind,'controls');assert.equal(G.assess(v).valid,false);
});
test('fit coverage is explicit and never certifies field accuracy',()=>{
 const r=G.assess(visual());assert.equal(r.valid,true);assert.equal(r.kind,'checkpoints');
 assert.ok(Math.abs(r.coverage-64)<1e-6);assert.equal(r.field_verified,false);assert.equal(r.checkCount,0);
});
test('three points allow editing but guide asks for better spread before checks',()=>{
 const v=visual();v.controls=v.controls.slice(0,3);assert.equal(G.assess(v).valid,true);assert.equal(G.assess(v).kind,'controls');
 v.generator='test';assert.equal(G.assess(v).kind,'checkpoints');
});
test('out-of-image controls invalidate image mapping',()=>{
 const v=visual();v.width=800;assert.equal(G.assess(v).valid,false);
});
test('checkpoints are independent and undo cannot remove controls',()=>{
 const v=visual(),next=G.append(v,'checkpoints',point(350,350));
 assert.equal(v.checkpoints.length,0);assert.equal(next.controls,v.controls);
 assert.equal(G.assess(next).checkCount,1);assert.equal(G.assess(next).field_verified,false);
 const undone=G.undo(next,'checkpoints');assert.equal(undone.checkpoints.length,0);assert.equal(undone.controls.length,5);
 assert.equal(next.checkpoints.length,1);
 const controlUndo=G.undo(next,'controls');assert.equal(controlUndo.controls.length,4);assert.equal(controlUndo.checkpoints.length,1);
});
test('duplicate and invalid point inputs are rejected without mutating source',()=>{
 const v=visual();assert.throws(()=>G.append(v,'checkpoints',point(100,100)),/已用于/);
 assert.throws(()=>G.append(v,'controls',point(-1,0)),/图片内/);
 assert.throws(()=>G.append(v,'controls',{pixel:{x:200,y:200},coordinate:[200,90]}),/WGS84/);
 assert.throws(()=>G.append({...v,width:0},'controls',point(0,100)),/图片内/);
 assert.equal(v.controls.length,5);
});
test('imported duplicate and out-of-coverage checks are disclosed',()=>{
 const v=visual();v.checkpoints=[point(100,100),point(50,500),point(400,400)];
 const r=G.assess(v);assert.equal(r.excludedChecks,1);assert.equal(r.outsideChecks,1);assert.equal(r.checkCount,2);
 assert.equal(r.field_verified,false);
});
