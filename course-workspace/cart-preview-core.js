/* Display transforms only. Camera rotation never changes WGS84 data. */
(function(root,factory){const api=factory(typeof module==='object'?require('../holemap-gps/point-workspace.js'):root.HolePointWorkspace,typeof module==='object'?require('../holemap-gps/registration.js'):root.HoleRegistration);if(typeof module==='object')module.exports=api;else root.CourseCartCore=api;})(typeof globalThis==='undefined'?this:globalThis,function(P,R){
  'use strict';
  function camera(width,height,imageWidth,imageHeight,angle=0,zoom=1,pan={x:0,y:0},frame={left:0,top:0,width:imageWidth,height:imageHeight}){
    if(![width,height,imageWidth,imageHeight,zoom,frame.width,frame.height].every(n=>Number.isFinite(n)&&n>0)||![angle,pan.x,pan.y,frame.left,frame.top].every(Number.isFinite))throw Error('Invalid preview dimensions');
    const c=Math.cos(angle),s=Math.sin(angle),bw=Math.abs(c)*frame.width+Math.abs(s)*frame.height,bh=Math.abs(s)*frame.width+Math.abs(c)*frame.height,ix=frame.left+frame.width/2,iy=frame.top+frame.height/2;
    const scale=Math.min(width/bw,height/bh)*.92*zoom,cx=width/2+pan.x,cy=height/2+pan.y;
    return {scale,angle,screen(p){const u=p.x-ix,v=p.y-iy;return {x:cx+scale*(c*u-s*v),y:cy+scale*(s*u+c*v)};},pixel(p){const u=(p.x-cx)/scale,v=(p.y-cy)/scale;return {x:ix+c*u+s*v,y:iy-s*u+c*v};}};
  }
  function metrics(from,target,hole){
    const dist=c=>from&&c?P.distanceMeters(from,c):null;
    // Use the same geographic targets as the editor; missing edges stay unknown.
    const points=P.buildCatalog({holes:[hole]}).points,hasGreen=Array.isArray(hole.green)&&hole.green.length>0;
    const geo=role=>hole.green_targets?.[role]||(hasGreen?points.find(p=>p.role===role)?.coordinate:null);
    const middle=geo('middle')||hole.pins?.mid||hole.flag;
    return {front:dist(hole.pins?.front||geo('front')),middle:dist(middle),back:dist(hole.pins?.back||geo('back')),middleLabel:geo('middle')||hole.pins?.mid?'至果岭中心':'至旗杆',toTarget:dist(target),targetToFlag:target&&hole.flag?P.distanceMeters(target,hole.flag):null};
  }
  function dragPoint(start,pointer,anchor){return {x:anchor.x+pointer.x-start.x,y:anchor.y+pointer.y-start.y};}
  function registeredImage(v){
    if(!v||![v.width,v.height].every(n=>Number.isFinite(n)&&n>0)||v.width*v.height>50000000)return null;
    if(!Array.isArray(v.controls)||v.controls.some(p=>!p?.pixel||p.pixel.x<0||p.pixel.y<0||p.pixel.x>v.width||p.pixel.y>v.height))return null;
    const model=R.fit(v.controls,{checkpoints:v.checkpoints||[]});
    return model.valid?model:null;
  }
  async function artwork(h,name,{hd,source}){
    const v=h.visual,registered=v&&!v.generator&&registeredImage(v);let note;
    if(registered){
      try{return {blob:await source(v),model:registered,plan:{width:v.width,height:v.height,frame:{left:0,top:0,width:v.width,height:v.height}},note:'项目高清图 · 已配准，实地精度待核验'};}
      catch(e){note='高清图资源不可用，已回退坐标制图：'+e.message;}
    }
    const result=await hd.render(h,name,3072,{presentation:true}),plan=hd.layout(h,3072);
    return {blob:result.blob,model:R.fit(plan.controls),plan,note:note||(v&&!v.generator?'原图片尚未有效配准 · 当前使用坐标制图':'坐标制图 · 材质示意，非实测影像')};
  }
  function format(m,unit='m'){return Number.isFinite(m)?(m/(unit==='yd'?.9144:1)).toFixed(0):'--';}
  return {camera,metrics,format,dragPoint,registeredImage,artwork};
});
