/* Display transforms only. Camera rotation never changes WGS84 data. */
(function(root,factory){const api=factory(typeof module==='object'?require('../holemap-gps/point-workspace.js'):root.HolePointWorkspace);if(typeof module==='object')module.exports=api;else root.CourseCartCore=api;})(typeof globalThis==='undefined'?this:globalThis,function(P){
  'use strict';
  function camera(width,height,imageWidth,imageHeight,angle=0,zoom=1,pan={x:0,y:0},frame={left:0,top:0,width:imageWidth,height:imageHeight}){
    if(![width,height,imageWidth,imageHeight,zoom,frame.width,frame.height].every(n=>Number.isFinite(n)&&n>0)||![angle,pan.x,pan.y,frame.left,frame.top].every(Number.isFinite))throw Error('Invalid preview dimensions');
    const c=Math.cos(angle),s=Math.sin(angle),bw=Math.abs(c)*frame.width+Math.abs(s)*frame.height,bh=Math.abs(s)*frame.width+Math.abs(c)*frame.height,ix=frame.left+frame.width/2,iy=frame.top+frame.height/2;
    const scale=Math.min(width/bw,height/bh)*.92*zoom,cx=width/2+pan.x,cy=height/2+pan.y;
    return {scale,angle,screen(p){const u=p.x-ix,v=p.y-iy;return {x:cx+scale*(c*u-s*v),y:cy+scale*(s*u+c*v)};},pixel(p){const u=(p.x-cx)/scale,v=(p.y-cy)/scale;return {x:ix+c*u+s*v,y:iy-s*u+c*v};}};
  }
  function metrics(from,target,hole){
    const dist=c=>from&&c?P.distanceMeters(from,c):null;
    return {front:dist(hole.pins?.front),middle:dist(hole.pins?.mid||hole.flag),back:dist(hole.pins?.back),toTarget:dist(target),targetToFlag:target&&hole.flag?P.distanceMeters(target,hole.flag):null};
  }
  function format(m,unit='m'){return Number.isFinite(m)?(m/(unit==='yd'?.9144:1)).toFixed(0):'--';}
  return {camera,metrics,format};
});
