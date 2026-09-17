'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const R=require('../course-workspace/course-recognition.js'),G=require('../course-workspace/generator.js'),S=require('../course-workspace/store.js');
// Synthetic metres-scale fixture: never used as a real course or published source.
const xy=(x,y)=>[120+x/(111195*Math.cos(Math.PI/6)),30+y/111195];
const polygon=(x,y,w=8)=>[xy(x-w,y-w),xy(x+w,y-w),xy(x+w,y+w),xy(x-w,y+w),xy(x-w,y-w)];
const site={id:'test-boundary',coordinates:[xy(-80,-80),xy(300,-80),xy(300,500),xy(-80,500),xy(-80,-80)]};
const course=()=>{const c=S.blank('合成验收数据，不用于导航',xy(0,0),3);c.holes[0].centerline=[xy(0,0),xy(0,400)];c.holes[1].centerline=[xy(200,0),xy(200,400)];return c;};
const feature=(id,x,kind='green',n=null)=>({id,name:id,kind,field:G.fields[kind],n,coordinates:polygon(x,380),geometry:'Polygon',tags:{}});
const inv=features=>({features,source:{name:'合成测试',method:'test_fixture'},sites:[site]});
test('unique corridor suggests a hole without moving vertices or changing the source course',()=>{
  const c=course(),data=inv([feature('a',5),feature('b',200)]),before=JSON.stringify({c,data}),p=R.plan(c,data,site);
  a.deepEqual(p.rows.map(r=>r.n),[1,2]);a.ok(p.rows.every(r=>r.method==='unique_corridor'));a.equal(p.accuracy_m,null);a.equal(p.field_verified,false);a.equal(JSON.stringify({c,data}),before);
});
test('adjacent equal-distance candidates stay unassigned',()=>{const p=R.plan(course(),inv([feature('a',100)]),site);a.equal(p.rows[0].n,null);a.equal(p.summary.unresolved,1);});
test('one anchor never absorbs the whole course, shared water and cart paths remain manual',()=>{
  const c=course();delete c.holes[1].centerline;const p=R.plan(c,inv([feature('a',5)]),site);a.equal(p.rows[0].n,null);
  a.equal(R.plan(course(),inv([feature('water',5,'water')]),site).rows[0].n,null);
});
test('explicit source numbers win but invalid numbers are not reassigned',()=>{
  const p=R.plan(course(),inv([feature('label',0,'green',2),feature('bad',0,'green',9)]),site);
  a.equal(p.rows[0].n,2);a.equal(p.rows[0].method,'source_label');a.equal(p.rows[1].n,null);
});
test('duplicate anchors, duplicate single fields and existing edits are flagged',()=>{
  const c=course(),anchor={id:'line',kind:'hole',field:'centerline',n:1,geometry:'LineString',coordinates:[xy(15,0),xy(15,400)]};
  a.deepEqual(R.plan(c,inv([anchor,feature('a',0)]),site).ambiguous_anchors,[1]);
  a.ok(R.plan(c,inv([feature('a',0),feature('b',5)]),site).rows.every(r=>r.conflict));
  c.holes[0].green=polygon(0,380);a.equal(R.plan(c,inv([feature('a',5)]),site).rows[0].conflict,true);
});
test('outside and crossing boundary features are excluded',()=>{const p=R.plan(course(),inv([feature('out',500),feature('cross',299)]),site);a.equal(p.accepted,0);a.equal(p.outside,2);});
test('source tagged middle lines can supply anchors for a blank course',()=>{
  const lines=[1,2].map((n,i)=>({id:'line-'+n,n,kind:'hole',field:'centerline',geometry:'LineString',coordinates:[xy(i*200,0),xy(i*200,400)]}));
  const p=R.plan(S.blank('测试',xy(0,0),2),inv([...lines,feature('g',0)]),site);a.equal(p.rows.at(-1).n,1);
});
const geo=()=>({type:'FeatureCollection',coordinate_system:'WGS84',source:{name:'本地识别输出',method:'test_only',model:'test',accuracy_m:0.01},features:[{type:'Feature',id:site.id,properties:{kind:'course'},geometry:{type:'Polygon',coordinates:[site.coordinates]}},{type:'Feature',id:'g/1',properties:{kind:'green',hole:1},geometry:{type:'Polygon',coordinates:[polygon(0,380)]}}]});
test('GeoJSON import preserves vertices, separates source provenance from unknown verified accuracy',()=>{
  const data=geo(),i=R.fromGeoJSON(data);a.deepEqual(i.features[0].coordinates,data.features[1].geometry.coordinates[0]);a.equal(i.source.accuracy_m,null);
  const result=G.generate(course(),i.sites[0],[{feature:i.features[0],n:1}],i.source).course;S.validate(result);
  a.equal(result.holes[0].map_sources[0].source,'本地识别输出');a.equal(result.holes[0].device_points[0].source,'derived_map_geometry');a.equal(result.holes[0].device_points[0].accuracy_m,null);a.equal(result.holes[0].flag,undefined);a.deepEqual(result.holes[0].tees,{});
});
test('wrong CRS, unknown types, missing source, duplicate IDs, invalid rings and holes fail closed',()=>{
  for(const change of [d=>delete d.coordinate_system,d=>d.coordinate_system='GCJ02',d=>d.crs={},d=>delete d.source,d=>d.features[1].properties.kind='tree_guess',d=>d.features[1].properties.kind='toString',d=>d.features[1].id=d.features[0].id,d=>d.features[1].geometry.coordinates.push(polygon(0,0)),d=>d.features[1].geometry.coordinates[0].pop(),d=>d.features[1].properties.hole=1.5]){const d=geo();change(d);a.throws(()=>R.fromGeoJSON(d));}
});
test('confirmed generation keeps all unselected holes and fails atomically on conflicts',()=>{
  const c=course(),before=JSON.stringify(c),i=R.fromGeoJSON(geo());const next=G.generate(c,site,[{feature:i.features[0],n:1}],i.source).course;
  a.equal(JSON.stringify(c),before);a.deepEqual(next.holes.slice(1),c.holes.slice(1));a.throws(()=>G.generate(next,site,[{feature:{...i.features[0],id:'other'},n:1}],i.source),/不覆盖/);
});
test('readiness never implies missing tee colors or flag are surveyed',()=>{const r=R.assess(course());a.ok(r[0].missing.includes('果岭轮廓'));a.equal(r[0].has_field_report,false);a.equal(r[0].accuracy_m,null);});
