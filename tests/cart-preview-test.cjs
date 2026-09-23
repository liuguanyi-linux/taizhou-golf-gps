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
