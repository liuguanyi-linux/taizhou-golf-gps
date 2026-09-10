/* Kingswan workspace geometry. No storage, network or device access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.KingswanGeo=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const coordinate=c=>Array.isArray(c)&&c.length===2&&c.every(finite)&&Math.abs(c[0])<=180&&Math.abs(c[1])<=90;
  const pixel=p=>p&&finite(p.x)&&finite(p.y);
  const R=6371008.8,rad=Math.PI/180;
  function distance(a,b){if(!coordinate(a)||!coordinate(b))return null;const t=Math.sin((b[1]-a[1])*rad/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin((b[0]-a[0])*rad/2)**2;return 2*R*Math.asin(Math.sqrt(Math.min(1,t)));}
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  function hull(points){const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),a=[],b=[];for(const p of sorted){while(a.length>1&&cross(a.at(-2),a.at(-1),p)<=0)a.pop();a.push(p);}for(const p of sorted.reverse()){while(b.length>1&&cross(b.at(-2),b.at(-1),p)<=0)b.pop();b.push(p);}return a.slice(0,-1).concat(b.slice(0,-1));}
  function covered(poly,p){if(!pixel(p)||poly.length<3)return false;let sign=0;for(let i=0;i<poly.length;i++){const c=cross(poly[i],poly[(i+1)%poly.length],p);if(Math.abs(c)<1e-6)continue;if(sign&&Math.sign(c)!==sign)return false;sign=Math.sign(c);}return true;}
  function fit(controls){
    const fail=reason=>({valid:false,reason});
    if(!Array.isArray(controls)||controls.length<3)return fail('至少需要 3 个不共线的对应点；建议 5 个以上分布于两侧及首尾');
    if(controls.some(c=>!pixel(c.pixel)||!coordinate(c.coordinate)))return fail('控制点坐标无效');
    if(new Set(controls.map(c=>c.pixel.x+','+c.pixel.y)).size!==controls.length)return fail('控制点像素位置重复');
    const n=controls.length,origin=controls.reduce((a,c)=>[a[0]+c.coordinate[0]/n,a[1]+c.coordinate[1]/n],[0,0]);
    if(Math.abs(origin[1])>85)return fail('不支持极区配准');
    const scale=[R*rad*Math.cos(origin[1]*rad),R*rad];
    const center=controls.reduce((a,c)=>({x:a.x+c.pixel.x/n,y:a.y+c.pixel.y/n}),{x:0,y:0});
    let xx=0,xy=0,yy=0;const local=controls.map(c=>{const x=c.pixel.x-center.x,y=c.pixel.y-center.y;xx+=x*x;xy+=x*y;yy+=y*y;return {x,y,e:(c.coordinate[0]-origin[0])*scale[0],n:(c.coordinate[1]-origin[1])*scale[1]};});
    const det=xx*yy-xy*xy;
    if(det<=1e-5*(xx+yy)**2)return fail('控制点近乎共线或分布过窄，请补充两侧点');
    if(local.some(p=>Math.hypot(p.e,p.n)>10000))return fail('控制点跨度超过本地球场范围');
    function solve(k){const mean=local.reduce((s,p)=>s+p[k]/n,0),sx=local.reduce((s,p)=>s+p.x*p[k],0),sy=local.reduce((s,p)=>s+p.y*p[k],0);return [(yy*sx-xy*sy)/det,(xx*sy-xy*sx)/det,mean];}
    const e=solve('e'),north=solve('n'),d=e[0]*north[1]-e[1]*north[0];
    if(Math.abs(d)<1e-10)return fail('地理控制点重合或无法反算');
    const model={valid:true,origin,center,scale,e,n:north,hull:hull(controls.map(c=>c.pixel)),quality:'calibrated_unverified',field_verified:false};
    const errors=controls.map(c=>distance(toGeo(model,c.pixel,true),c.coordinate));
    model.rms_m=Math.sqrt(errors.reduce((s,x)=>s+x*x,0)/n);model.max_m=Math.max(...errors);return model;
  }
  function toGeo(m,p,extrapolate=false){if(!m?.valid||!pixel(p)||(!extrapolate&&!covered(m.hull,p)))return null;const x=p.x-m.center.x,y=p.y-m.center.y,c=[m.origin[0]+(m.e[0]*x+m.e[1]*y+m.e[2])/m.scale[0],m.origin[1]+(m.n[0]*x+m.n[1]*y+m.n[2])/m.scale[1]];return coordinate(c)?c:null;}
  function toPixel(m,c,extrapolate=false){if(!m?.valid||!coordinate(c))return null;const e=(c[0]-m.origin[0])*m.scale[0]-m.e[2],n=(c[1]-m.origin[1])*m.scale[1]-m.n[2],d=m.e[0]*m.n[1]-m.e[1]*m.n[0],p={x:m.center.x+(e*m.n[1]-n*m.e[1])/d,y:m.center.y+(n*m.e[0]-e*m.n[0])/d};return extrapolate||covered(m.hull,p)?p:null;}
  function route(line){if(!Array.isArray(line)||line.length<2||!line.every(coordinate))return null;const cumulative=[0];for(let i=1;i<line.length;i++)cumulative.push(cumulative.at(-1)+distance(line[i-1],line[i]));return {line,cumulative,length:cumulative.at(-1)};}
  function along(r,meters){if(!r)return null;const m=Math.max(0,Math.min(r.length,meters));for(let i=1;i<r.line.length;i++)if(m<=r.cumulative[i]){const d=r.cumulative[i]-r.cumulative[i-1],t=d?(m-r.cumulative[i-1])/d:0;return r.line[i-1].map((v,k)=>v+(r.line[i][k]-v)*t);}return r.line.at(-1).slice();}
  function project(line,c){const r=route(line);if(!r||!coordinate(c))return null;const sx=R*rad*Math.cos(c[1]*rad),sy=R*rad;let best=null;for(let i=1;i<line.length;i++){const a=[(line[i-1][0]-c[0])*sx,(line[i-1][1]-c[1])*sy],b=[(line[i][0]-c[0])*sx,(line[i][1]-c[1])*sy],v=[b[0]-a[0],b[1]-a[1]],d=v[0]**2+v[1]**2,t=d?Math.max(0,Math.min(1,-(a[0]*v[0]+a[1]*v[1])/d)):0,offset=Math.hypot(a[0]+v[0]*t,a[1]+v[1]*t);if(!best||offset<best.offset)best={offset,progress:r.cumulative[i-1]+t*(r.cumulative[i]-r.cumulative[i-1]),length:r.length};}return {...best,remaining:best.length-best.progress};}
  function validateFeature(f){
    if(!f||f.type!=='Feature'||typeof f.id!=='string'||!f.id.trim())throw Error('要素需要非空字符串 ID');
    if(!f.properties||!Number.isInteger(f.properties.hole)||f.properties.hole<1||f.properties.hole>18)throw Error('洞号必须是 1–18');
    const g=f.geometry;if(!g)throw Error('无 GPS 的像素草稿不可作为 GeoJSON 地理要素导入');
    if(!['Point','LineString','Polygon'].includes(g.type))throw Error('仅支持 Point、LineString、Polygon');
    const points=g.type==='Point'?[g.coordinates]:g.type==='LineString'?g.coordinates:g.coordinates?.[0];
    if(!Array.isArray(points)||!points.every(coordinate))throw Error('WGS84 必须为有效 [经度, 纬度]');
    if(g.type==='LineString'&&(points.length<2||new Set(points.map(p=>p.join(','))).size<2))throw Error('线路至少两个不同点');
    if(g.type==='Polygon'&&(!Array.isArray(g.coordinates)||g.coordinates.length!==1||points.length<4||points[0].some((v,i)=>v!==points.at(-1)[i])))throw Error('区域必须为闭合单外环，至少三个顶点');
    if(g.type==='Polygon'){
      const ring=points.slice(0,-1);if(new Set(ring.map(p=>p.join(','))).size!==ring.length)throw Error('区域顶点不能重复');
      const xy=ring.map(p=>({x:p[0]-ring[0][0],y:p[1]-ring[0][1]})),area=xy.reduce((s,p,i)=>s+p.x*xy[(i+1)%xy.length].y-xy[(i+1)%xy.length].x*p.y,0);if(Math.abs(area)<1e-14)throw Error('区域面积为零或退化');
      const on=(a,b,p)=>Math.abs(cross(a,b,p))<1e-14&&p.x>=Math.min(a.x,b.x)-1e-14&&p.x<=Math.max(a.x,b.x)+1e-14&&p.y>=Math.min(a.y,b.y)-1e-14&&p.y<=Math.max(a.y,b.y)+1e-14;
      for(let i=0;i<xy.length;i++)for(let j=i+1;j<xy.length;j++){if(j===i+1||(i===0&&j===xy.length-1))continue;const a=xy[i],b=xy[(i+1)%xy.length],c=xy[j],d=xy[(j+1)%xy.length];if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw Error('区域边界不能自相交');}
    }
    return true;
  }
  function telemetry(entries){
    if(!Array.isArray(entries))throw Error('positions 必须为数组');const ids=new Set();
    return entries.map(p=>{if(!p||typeof p.id!=='string'||!p.id.trim()||ids.has(p.id))throw Error('球车 ID 缺失或重复');ids.add(p.id);
      if(!coordinate(p.coordinate)||!Number.isInteger(p.hole)||p.hole<1||p.hole>18)throw Error('球车坐标或洞号无效');
      const t=p.timestamp??p.updated_at,parts=typeof t==='string'&&t.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/);
      if(!parts||!Number.isFinite(Date.parse(t)))throw Error('球车时间必须为含时区的 ISO 8601');
      const year=+parts[1],month=+parts[2],day=+parts[3],days=[31,(year%4===0&&(year%100!==0||year%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];if(month<1||month>12||day<1||day>days[month-1]||+parts[4]>23||+parts[5]>59||+parts[6]>59||+(parts[8]||0)>23||+(parts[9]||0)>59)throw Error('球车时间日期无效');
      if(p.accuracy_m!=null&&(!finite(p.accuracy_m)||p.accuracy_m<0))throw Error('GPS 精度须为非负数或 null');
      return {id:p.id,hole:p.hole,coordinate:p.coordinate.slice(),timestamp:t,accuracy_m:p.accuracy_m??null};});
  }
  return {coordinate,pixel,distance,fit,toGeo,toPixel,covered,route,along,project,validateFeature,telemetry};
});
