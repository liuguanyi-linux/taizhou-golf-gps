/* Deterministic cartographic raster. Texture is decorative; geometry is never invented. */
(function(root,factory){const api=factory(typeof module==='object'?require('../holemap-gps/registration.js'):root.HoleRegistration);if(typeof module==='object')module.exports=api;else root.CourseHD=api;})(typeof globalThis==='undefined'?this:globalThis,function(R){
  'use strict';
  const polygonKeys=['holeperim','rough','native','fairway','water','bunkers','teebox','fringe','green','bridges','buildings'];
  const lineKeys=['cartpaths','paths','creeks','cart_route'];
  const VERSION='coordinate-hd/2';
  const turfUrl=typeof document!=='undefined'&&document.currentScript?.src?new URL('assets/turf-material-v1.png',document.currentScript.src).href:null;
  let turfPromise;
  function loadTurf(){if(!turfUrl)return Promise.resolve(null);return turfPromise||(turfPromise=new Promise(resolve=>{const img=new Image();let settled=false;const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};const timer=setTimeout(()=>finish(null),4000);img.onload=()=>finish(img);img.onerror=()=>finish(null);img.src=turfUrl;}));}
  const rings=v=>!v?.length?[]:typeof v[0][0]==='number'?[v]:v;
  function shapes(h){return polygonKeys.flatMap(key=>rings(h[key]).map(coordinates=>({key,coordinates,polygon:true}))).concat(lineKeys.flatMap(key=>rings(h[key]).map(coordinates=>({key,coordinates,polygon:false}))));}
  function signature(h){return JSON.stringify({shapes:shapes(h),trees:h.trees||[],tees:h.tees||{},flag:h.flag||null});}
  function canonical(text){const data=JSON.parse(text);for(const shape of data.shapes||[]){const ps=shape.coordinates;if(shape.polygon&&ps.length>1&&ps[0].every((v,i)=>v===ps.at(-1)[i]))ps.pop();}return JSON.stringify(data);}
  function current(visual,h){try{return canonical(visual.source_signature)===canonical(signature(h));}catch(_){return false;}}
  function layout(h,size=3072){
    if(![2048,3072,4096].includes(size))throw Error('请选择 2048、3072 或 4096 像素');
    const items=shapes(h),coords=items.flatMap(s=>s.coordinates);
    if(!items.some(s=>s.polygon&&['fairway','green','holeperim'].includes(s.key)))throw Error('需要本洞球道、果岭或洞界几何；先读取地图或描绘区域');
    if(coords.some(p=>!R.isWgs84(p)))throw Error('存在无效 WGS84 坐标');
    const origin=coords.reduce((a,p)=>[a[0]+p[0]/coords.length,a[1]+p[1]/coords.length],[0,0]),ms=R.metreScale(origin[1]);
    if(Math.abs(origin[1])>85)throw Error('暂不支持极区球场');
    const local=p=>[(p[0]-origin[0])*ms.lng,(p[1]-origin[1])*ms.lat];
    const mean=v=>v.reduce((a,p)=>[a[0]+p[0]/v.length,a[1]+p[1]/v.length],[0,0]);
    const green=h.flag||(h.green?.length?mean(h.green):null),tee=h.tees?.black||Object.values(h.tees||{})[0]||(h.teebox?.length?mean(h.teebox):null);
    let angle=0;if(green&&tee){const a=local(tee),b=local(green);angle=Math.atan2(b[0]-a[0],b[1]-a[1]);}
    const sin=Math.sin(angle),cos=Math.cos(angle),rotate=p=>{const [e,n]=local(p);return [cos*e-sin*n,sin*e+cos*n];};
    const ps=coords.map(rotate),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]);let left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);
    const extent=Math.max(right-left,top-bottom);if(extent<1||extent>10000)throw Error('球洞范围退化或大于 10 km，请检查洞号归属');
    const pad=extent*.09;left-=pad;right+=pad;bottom-=pad;top+=pad;
    // Reserve the title and legend inside the image, never crop the map to fit a template.
    const width=Math.max(1000,Math.round(size*Math.min(1,(right-left)/(top-bottom))));const height=size;
    const scale=Math.min((width-120)/(right-left),(height-300)/(top-bottom));
    const cx=(left+right)/2,cy=(top+bottom)/2,ox=width/2,oy=150+(height-300)/2;
    const pixel=p=>{const [u,v]=rotate(p);return {x:ox+(u-cx)*scale,y:oy-(v-cy)*scale};};
    const coordinate=p=>{const u=(p.x-ox)/scale+cx,v=(oy-p.y)/scale+cy;return [origin[0]+(cos*u+sin*v)/ms.lng,origin[1]+(-sin*u+cos*v)/ms.lat];};
    const controls=[[0,0],[width,0],[width,height],[0,height]].map(([x,y],i)=>({id:'render-'+i,pixel:{x,y},coordinate:coordinate({x,y}),source:'generated_projection',accuracy_m:null}));
    return {width,height,scale,angle,origin,items,pixel,coordinate,controls,source_signature:signature(h)};
  }
  async function render(h,name,size){
    h=structuredClone(h);
    const plan=layout(h,size),{width:w,height:hgt,pixel,items}=plan,c=document.createElement('canvas');c.width=w;c.height=hgt;const x=c.getContext('2d');
    const turf=await loadTurf();let turfPattern=null;if(turf){const tile=document.createElement('canvas');tile.width=tile.height=384;tile.getContext('2d').drawImage(turf,0,0,384,384);turfPattern=x.createPattern(tile,'repeat');}
    x.fillStyle='#eee8d9';x.fillRect(0,0,w,hgt);
    let seed=7183;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const colors={holeperim:['#48653b','#304b32'],rough:['#698044','#465e30'],native:['#42653a','#233f2b'],fairway:['#86ab44','#568035'],water:['#437984','#163d50'],bunkers:['#f5e4bb','#d4bc8b'],teebox:['#92b24e','#678b3e'],fringe:['#7d9d43','#587d36'],green:['#a1bf59','#7b9e40'],bridges:['#bbaa88','#9b886b'],buildings:['#d6d2c7','#a7a59c']};
    // Reusable material tiles, not invented geographic objects. All paint is clipped
    // to the original polygon; its vertices and registration remain untouched.
    const textures=new Map();
    function material(key){if(textures.has(key))return textures.get(key);const tile=document.createElement('canvas');tile.width=tile.height=192;const t=tile.getContext('2d');
      for(let i=0;i<8500;i++){const px=random()*192,py=random()*192;t.fillStyle=i%3?'rgba(15,35,12,.10)':'rgba(240,250,206,.19)';t.fillRect(px,py,.6+random(),key==='bunkers'?.7:1+random()*2.2);}
      if(key==='water'){t.clearRect(0,0,192,192);for(let i=0;i<160;i++){const px=random()*192,py=random()*192;t.strokeStyle=i%3?'#bad5c714':'#0f32451a';t.lineWidth=.7;t.beginPath();t.moveTo(px,py);t.lineTo(px+3+random()*15,py-.5);t.stroke();}}
      const pattern=x.createPattern(tile,'repeat');textures.set(key,pattern);return pattern;
    }
    function path(s){x.beginPath();s.coordinates.forEach((p,i)=>{const q=pixel(p);i?x.lineTo(q.x,q.y):x.moveTo(q.x,q.y);});if(s.polygon)x.closePath();}
    for(const s of items){path(s);if(!s.polygon){x.strokeStyle=s.key==='creeks'?'#3b7892':'#c4b89a';x.lineWidth=Math.max(3,plan.scale*(s.key==='cart_route'?1.5:2.5));x.lineJoin='round';x.stroke();continue;}
      const palette=colors[s.key]||colors.rough,g=x.createLinearGradient(0,0,w,hgt);g.addColorStop(0,palette[0]);g.addColorStop(1,palette[1]);x.fillStyle=g;x.shadowColor='#17271855';x.shadowBlur=14;x.shadowOffsetY=6;x.fill();x.shadowBlur=0;x.shadowOffsetY=0;x.save();x.clip();
      if(['fairway','teebox','green'].includes(s.key)){const stripe=Math.max(18,plan.scale*(s.key==='green'?3:8));x.save();x.translate(w/2,hgt/2);x.rotate(-.35);for(let y=-hgt-w;y<hgt+w;y+=stripe*2){x.fillStyle='#e9f5b41b';x.fillRect(-w-hgt,y,(w+hgt)*2,stripe);}x.restore();}
      x.fillStyle=material(s.key);x.fillRect(0,0,w,hgt);
      if(turfPattern&&['holeperim','rough','native','fairway','teebox','fringe','green'].includes(s.key)){x.save();x.globalCompositeOperation='soft-light';x.globalAlpha=.65;x.fillStyle=turfPattern;x.fillRect(0,0,w,hgt);x.restore();}
      // Soft, inward-facing banks/grass edges without shifting the underlying edge.
      path(s);x.strokeStyle=s.key==='bunkers'?'#987b414d':s.key==='water'?'#142e2e66':'#183d2338';x.lineWidth=Math.max(5,plan.scale*(s.key==='water'?2:1));x.stroke();
      path(s);x.strokeStyle=s.key==='bunkers'?'#fff3d080':'#def0ad24';x.lineWidth=Math.max(2,plan.scale*.22);x.stroke();
      // Broad tonal variation gives a material surface, not a claim of measured relief.
      const pp=s.coordinates.map(pixel),lx=Math.min(...pp.map(p=>p.x)),rx=Math.max(...pp.map(p=>p.x)),ty=Math.min(...pp.map(p=>p.y)),by=Math.max(...pp.map(p=>p.y));
      for(let i=0;i<18;i++){const px=lx+random()*(rx-lx),py=ty+random()*(by-ty),r=Math.max(12,(rx-lx)*(.12+random()*.22)),shade=x.createRadialGradient(px,py,0,px,py,r);shade.addColorStop(0,i%2?'#16340d0b':'#eef2b80d');shade.addColorStop(1,'#ffffff00');x.fillStyle=shade;x.fillRect(px-r,py-r,r*2,r*2);}
      x.restore();path(s);x.strokeStyle=palette[1];x.lineWidth=1;x.stroke();
    }
    for(const p of h.trees||[]){if(!R.isWgs84(p))continue;const q=pixel(p),r=Math.max(5,plan.scale*2);x.shadowColor='#10231366';x.shadowBlur=r*.7;x.shadowOffsetX=r*.3;x.shadowOffsetY=r*.5;const g=x.createRadialGradient(q.x-r/3,q.y-r/3,0,q.x,q.y,r);g.addColorStop(0,'#91a85b');g.addColorStop(.55,'#536f35');g.addColorStop(1,'#26472a');x.fillStyle=g;x.beginPath();x.arc(q.x,q.y,r,0,Math.PI*2);x.fill();x.shadowBlur=x.shadowOffsetX=x.shadowOffsetY=0;for(let i=0;i<12;i++){const a=random()*Math.PI*2,rr=random()*r*.7;x.fillStyle=i%2?'#c1cd7030':'#18372238';x.beginPath();x.arc(q.x+Math.cos(a)*rr,q.y+Math.sin(a)*rr,r*.24,0,Math.PI*2);x.fill();}}
    for(const [color,c] of Object.entries(h.tees||{})){if(!R.isWgs84(c))continue;const p=pixel(c);x.fillStyle=({black:'#25312a',gold:'#c0a044',blue:'#367aac',white:'#fffdf2',red:'#ce5144'})[color]||'#fff';x.beginPath();x.arc(p.x,p.y,7,0,Math.PI*2);x.fill();x.strokeStyle='#fffdf0';x.lineWidth=2;x.stroke();}
    x.fillStyle='#26432d';x.font='600 25px system-ui';x.fillText(String(name).slice(0,35),48,55,w-96);x.font='700 42px system-ui';x.fillText('第 '+h.n+' 洞'+(h.par_status==='unknown'||h.par==null?'':' · PAR '+h.par),48,112);
    if(h.flag){const p=pixel(h.flag);x.strokeStyle='#f4f1d7';x.lineWidth=4;x.beginPath();x.moveTo(p.x,p.y);x.lineTo(p.x,p.y-48);x.stroke();x.fillStyle='#cf483a';x.beginPath();x.moveTo(p.x,p.y-48);x.lineTo(p.x+34,p.y-35);x.lineTo(p.x,p.y-23);x.fill();}
    x.font='20px system-ui';x.fillStyle='#3c4f3b';x.fillText('坐标驱动高清制图 · 装饰纹理不代表实景 · 实地精度待核验',48,hgt-88,w-96);x.font='17px system-ui';x.fillText('© OpenStreetMap contributors（如采用 OSM 数据） · 源坐标不因渲染而改变',48,hgt-52,w-96);
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw Error('高清图片生成失败');
    return {blob,visual:{width:w,height:hgt,controls:plan.controls,checkpoints:[],generator:VERSION,material:turf?'turf-material-v1':'procedural-fallback',generated_at:new Date().toISOString(),source_signature:plan.source_signature,accuracy_m:null,projection:'local-linear-wgs84',orientation:plan.angle}};
  }
  return {layout,render,signature,shapes,current,VERSION};
});
