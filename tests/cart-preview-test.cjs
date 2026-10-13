const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../course-workspace/cart-preview-core.js'),H=require('../course-workspace/hd-map.js'),R=require('../holemap-gps/registration.js');
const base=require('../holemap-data/cn0000385-codex.json');
test('camera inverse survives portrait, landscape, zoom, pan and off-centre image framing',()=>{
  for(const [w,h] of [[1280,720],[430,740],[640,320]])for(const angle of [0,.95,-.8])for(const zoom of [.6,1,6]){
    const cam=C.camera(w,h,1024,2048,angle,zoom,{x:81,y:-93},{left:210,top:160,width:630,height:1700});
    for(let i=0;i<100;i++){const p={x:i*10,y:i*20},q=cam.pixel(cam.screen(p));assert.ok(Math.hypot(q.x-p.x,q.y-p.y)<1e-9);}
  }
});
test('fit contains all rotated frame corners without cropping its head or tail',()=>{
  const frame={left:300,top:70,width:320,height:1300};
  for(const angle of [0,.95,Math.PI/2]){const cam=C.camera(600,480,1024,2048,angle,1,{x:0,y:0},frame);
    for(const x of [300,620])for(const y of [70,1370]){const p=cam.screen({x,y});assert.ok(p.x>=0&&p.x<=600&&p.y>=0&&p.y<=480);}
  }
});
test('invalid camera input rejected',()=>{assert.throws(()=>C.camera(0,10,10,10));assert.throws(()=>C.camera(10,10,10,10,0,1,{x:NaN,y:0}));assert.throws(()=>C.camera(10,10,10,10,0,1,{x:0,y:0},{left:0,top:0,width:0,height:1}));});
test('distances and unit display do not invent missing front/back or alter source data',()=>{
  const hole={flag:[120,32.001]},before=JSON.stringify(hole),d=C.metrics([120,32],[120,32.0005],hole);
  assert.equal(d.front,null);assert.equal(d.back,null);assert.ok(Math.abs(d.middle-d.toTarget-d.targetToFlag)<.001);
  assert.equal(C.format(91.44,'yd'),'100');assert.equal(C.format(null),'--');assert.equal(C.metrics(null,null,hole).middle,null);assert.equal(JSON.stringify(hole),before);
});
test('18-hole geographic projection round trip remains unchanged by preview rotation',()=>{
  for(const hole of base.holes){const plan=H.layout(hole,2048),model=R.fit(plan.controls),cam=C.camera(600,480,plan.width,plan.height,.95,2,{x:50,y:20});
    for(const control of plan.controls){const pixel=R.geoToPixel(model,control.coordinate),geo=R.pixelToGeo(model,cam.pixel(cam.screen(pixel)));assert.ok(geo);assert.ok(Math.abs(geo[0]-control.coordinate[0])<1e-8);assert.ok(Math.abs(geo[1]-control.coordinate[1])<1e-8);}
  }
});
test('preview uses shared green geometry while explicit pins take precedence',()=>{
  const P=require('../holemap-gps/point-workspace.js');
  for(const hole of base.holes){const origin=hole.tees.black,points=P.buildCatalog({holes:[hole]}).points,d=C.metrics(origin,null,hole);
    for(const role of ['front','middle','back']){const target=role==='middle'?points.find(p=>p.role===role)?.coordinate:hole.pins?.[role]||points.find(p=>p.role===role)?.coordinate;if(target)assert.ok(Math.abs(d[role]-P.distanceMeters(origin,target))<1e-8);}
  }
  const h={n:1,flag:[120,32.001],green_targets:{front:[120,32.0008],middle:[120,32.001],back:[120,32.0012]},pins:{front:[120,32.0007]}};
  assert.equal(C.metrics([120,32],null,h).front,P.distanceMeters([120,32],h.pins.front));
});
test('opening or closing a GeoJSON green ring never changes the reference distances',()=>{
  const G=require('../holemap-gps/gps-core.js'),h={n:1,tees:{black:[120,32]},green:[[120,32.001],[120.0002,32.001],[120.0002,32.0014],[120,32.0014]]};
  const before=JSON.stringify(h),closed={...h,green:[...h.green,h.green[0]]};
  assert.deepEqual(G.greenTargets(h),G.greenTargets(closed));
  assert.deepEqual(C.metrics(h.tees.black,null,h),C.metrics(h.tees.black,null,closed));
  assert.equal(JSON.stringify(h),before);
});
test('finger grip offset does not shift the dragged coordinate, at any camera scale',()=>{
  for(const zoom of [.6,1,6]){const cam=C.camera(600,480,1024,2048,.95,zoom),anchor=cam.screen({x:500,y:1000}),start={x:anchor.x+17,y:anchor.y-12};
    assert.deepEqual(C.dragPoint(start,start,anchor),anchor);
    const p=C.dragPoint(start,{x:start.x+30,y:start.y-20},anchor),q=cam.pixel(p),expected=cam.pixel({x:anchor.x+30,y:anchor.y-20});
    assert.deepEqual(q,expected);
  }
});
test('only dimensionally valid registered artwork can drive preview coordinates',()=>{
  const plan=H.layout(base.holes[0],2048),v={width:plan.width,height:plan.height,controls:plan.controls};
  assert.ok(C.registeredImage(v)?.valid);
  assert.equal(C.registeredImage({...v,controls:[]}),null);
  assert.equal(C.registeredImage({...v,width:10}),null);
  assert.equal(C.registeredImage({...v,width:100000,height:100000}),null);
  assert.equal(C.registeredImage(null),null);
});
test('registered artwork reuses its exact coordinates; missing or unregistered art falls back explicitly',async()=>{
  const hole=structuredClone(base.holes[0]),plan=H.layout(hole,2048),blob=new Blob(['synthetic asset, not a field map']);
  hole.visual={width:plan.width,height:plan.height,controls:plan.controls,src:'test'};
  let renders=0,reads=0;
  const hd={layout:H.layout,render:async(h,n,size,options)=>{renders++;assert.equal(size,3072);assert.equal(options.presentation,true);return {blob};}};
  const source=async()=>{reads++;return blob;},before=JSON.stringify(hole);
  const art=await C.artwork(hole,'QA',{hd,source});assert.equal(art.blob,blob);assert.equal(renders,0);assert.equal(reads,1);assert.equal(art.plan.width,plan.width);
  for(const p of plan.controls){const c=R.pixelToGeo(art.model,p.pixel);assert.ok(Math.abs(c[0]-p.coordinate[0])<1e-8);assert.ok(Math.abs(c[1]-p.coordinate[1])<1e-8);}
  assert.equal(JSON.stringify(hole),before);
  const missing=await C.artwork(hole,'QA',{hd,source:async()=>{throw Error('missing image');}});assert.match(missing.note,/资源不可用.*回退/);assert.equal(renders,1);
  hole.visual.controls=[];const invalid=await C.artwork(hole,'QA',{hd,source});assert.match(invalid.note,/尚未有效配准/);assert.equal(reads,1);assert.equal(renders,2);
  hole.visual.generator='coordinate-hd/2';await C.artwork(hole,'QA',{hd,source});assert.equal(renders,3);assert.equal(reads,1);
});
