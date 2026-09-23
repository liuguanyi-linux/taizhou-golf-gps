/* Same-page cart display. No customer services, slope or precision is simulated as real. */
(function(root){'use strict';
root.createCourseCartPreview=function(host,api){
  const H=CourseHD,R=HoleRegistration,P=HolePointWorkspace,C=CourseCartCore;
  host.className='cart-preview';host.hidden=true;host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.setAttribute('aria-label','球车端预览');
  host.innerHTML=`<header><div class="cart-course"><strong id="cart-course-name"></strong><small id="cart-hole-info"></small></div><label><span>球洞</span><select id="cart-hole" aria-label="预览球洞"></select></label><button id="cart-exit">返回编辑</button></header>
  <main class="cart-main"><aside class="cart-left"><div><div class="cart-metric-label">至果岭中心</div><div class="cart-main-distance"><span id="cart-middle">--</span><small class="cart-unit">m</small></div><div class="cart-green-edges"><div><span>前沿</span><b id="cart-front">--</b></div><div><span>后沿</span><b id="cart-back">--</b></div></div></div><label class="cart-origin">测距起点<select id="cart-origin" aria-label="球车预览测距起点"></select></label><div id="cart-source" class="cart-source-status" role="status"></div></aside>
  <section class="cart-stage"><canvas id="cart-canvas" aria-label="球车预览地图，可拖动白色测距点"></canvas><div id="cart-render-status" class="cart-render-status" role="status">正在准备高清球洞…</div><div id="cart-map-hint" class="cart-map-hint">拖动白色目标点测距 · 滚轮缩放 · 拖动空白平移</div></section>
  <aside class="cart-right"><section class="cart-readout"><h3>拖点测距</h3><div class="cart-leg"><span>起点 → 目标</span><b id="cart-leg-one">--</b></div><div class="cart-leg"><span>目标 → 旗杆</span><b id="cart-leg-two">--</b></div><button id="cart-save-target">保存目标点</button><div id="cart-target-status" role="status">临时测距点，不自动修改地图</div></section><div class="cart-gps"><button id="cart-gps-start" class="cart-primary">使用实时 GPS</button><button id="cart-route-start">车道模拟</button><button id="cart-track-stop">停止定位/模拟</button></div><details><summary>坐标与精度</summary><p id="cart-coordinate"></p><p id="cart-accuracy"></p><p>直线距离不是沿车道距离。材质与阴影为示意，不代表实测坡度。源数据和现场精度仍需核验。</p></details></aside></main>
  <footer><button id="cart-place">放置球车</button><button id="cart-target-reset">重置测距点</button><div class="cart-toolbar-group"><button id="cart-fit">全图</button><button id="cart-zoom-out" aria-label="预览缩小">−</button><button id="cart-zoom-in" aria-label="预览放大">＋</button></div><button id="cart-unit" aria-label="切换米码">m / yd</button><div class="cart-footnote">坐标驱动的球车端预览<br>非实测车辆轨迹 · 不含虚构坡度</div></footer>`;
  const $=id=>host.querySelector('#'+id),canvas=$('cart-canvas'),ctx=canvas.getContext('2d');
  const layoutButton=document.createElement('button');layoutButton.textContent='竖屏预览';layoutButton.setAttribute('aria-pressed','false');$('cart-exit').before(layoutButton);
  layoutButton.onclick=()=>{const portrait=host.classList.toggle('cart-portrait');layoutButton.textContent=portrait?'横屏预览':'竖屏预览';layoutButton.setAttribute('aria-pressed',String(portrait));};
  let previousFocus=null,inertSiblings=[];
  let active=false,sequence=0,image=null,plan=null,model=null,key='',holeNumber=null,camera=null,zoom=1,pan={x:0,y:0},unit='m',target=null,originId='',followLive=false,placing=false,drag=null,lastMetrics=null,lastOrigin=null,targetScreen=null,originScreen=null,width=1,height=1;
  function status(text){$('cart-target-status').textContent=text;}
  function currentOrigin(){return followLive?api.live?.():api.allPoints().find(p=>p.id===originId);}
  function resetTarget(){const from=currentOrigin()?.coordinate,to=api.hole().flag;target=from&&to?[(from[0]+to[0])/2,(from[1]+to[1])/2]:null;}
  function geometryKey(){return api.hole().n+'|'+H.signature(api.hole());}
  function resize(){const b=canvas.parentElement.getBoundingClientRect();width=Math.max(1,b.width);height=Math.max(1,b.height);const dpr=Math.min(2,root.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
  function project(c){if(!model||!camera)return null;const px=R.geoToPixel(model,c);return px?camera.screen(px):null;}
  function unproject(p){return model&&camera?R.pixelToGeo(model,camera.pixel(p)):null;}
  function point(e){const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
  function options(){
    const h=api.hole(),all=api.allPoints();
    $('cart-course-name').textContent=api.course().name;
    $('cart-hole-info').textContent='第 '+h.n+' 洞'+(Number.isFinite(h.par)?' · PAR '+h.par:' · PAR 待核对');
    const holes=api.course().holes;$('cart-hole').replaceChildren(...holes.map(h=>new Option('第 '+h.n+' 洞',String(h.n))));$('cart-hole').value=String(h.n);
    const choices=all.filter(p=>p.hole===h.n&&(/cart/.test(p.kind)||p.type==='tee'||p.type==='device'));
    if(!followLive&&!choices.some(p=>p.id===originId))originId=(choices.find(p=>/cart/.test(p.kind))||choices[0])?.id||'';
    $('cart-origin').replaceChildren(new Option('选择起点',''),new Option('设备 GPS / 车道模拟','live'),...choices.map(p=>new Option(p.name,p.id)));
    $('cart-origin').value=followLive?'live':originId;
  }
  function label(text,p,color='#143c42'){
    if(!p||p.x<0||p.x>width||p.y<0||p.y>height)return;
    ctx.font='600 13px system-ui';const w=ctx.measureText(text).width+20,l=Math.min(width-w-4,Math.max(4,p.x-w/2)),top=Math.min(height-32,Math.max(4,p.y-18));ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(l,top,w,30,7);ctx.fill();ctx.strokeStyle='#c8e7e873';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#f4f8ee';ctx.fillText(text,l+10,top+20);
  }
  function polyline(points,color,dash=[]){const ps=points.map(project);if(ps.some(p=>!p))return;ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  function marker(p,color,r=6){ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.shadowColor='#091e25aa';ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#f3f7e9';ctx.lineWidth=2;ctx.stroke();}
  function draw(){
    if(!active)return;
    ctx.clearRect(0,0,width,height);const bg=ctx.createLinearGradient(0,0,width,height);bg.addColorStop(0,'#244d3b');bg.addColorStop(.55,'#254738');bg.addColorStop(1,'#102f31');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    if(!image||!plan){for(const id of ['cart-front','cart-middle','cart-back','cart-leg-one','cart-leg-two'])$(id).textContent='--';$('cart-save-target').disabled=true;return;}
    const angle=!host.classList.contains('cart-portrait')&&host.clientWidth>700&&width>height*1.05?.95:0;
    const shapePixels=plan.items.flatMap(s=>s.coordinates.map(plan.pixel)),xs=shapePixels.map(p=>p.x),ys=shapePixels.map(p=>p.y),left=Math.min(...xs)-20,top=Math.min(...ys)-40;
    const frame={left,top,width:Math.max(...xs)-left+20,height:Math.max(...ys)-top+20};
    camera=C.camera(width,height,plan.width,plan.height,angle,zoom,pan,frame);
    // Decorative backdrop uses the same rendered map, blurred; it is not another data layer.
    const center=camera.screen({x:plan.width/2,y:plan.height/2});ctx.save();ctx.translate(center.x,center.y);ctx.rotate(angle);ctx.globalAlpha=.23;ctx.filter='blur(25px)';ctx.scale(camera.scale*1.28,camera.scale*1.28);ctx.drawImage(image,-plan.width/2,-plan.height/2);ctx.restore();
    ctx.save();ctx.translate(center.x,center.y);ctx.rotate(angle);ctx.scale(camera.scale,camera.scale);ctx.drawImage(image,-plan.width/2,-plan.height/2);ctx.restore();
    const h=api.hole(),origin=currentOrigin(),from=origin?.coordinate,flag=h.flag;
    lastOrigin=origin;lastMetrics=C.metrics(from,target,h);
    for(const part of ['front','middle','back'])$('cart-'+part).textContent=C.format(lastMetrics[part],unit);
    $('cart-leg-one').textContent=C.format(lastMetrics.toTarget,unit)+' '+unit;$('cart-leg-two').textContent=C.format(lastMetrics.targetToFlag,unit)+' '+unit;
    host.querySelectorAll('.cart-unit').forEach(e=>e.textContent=unit);
    $('cart-source').textContent=followLive?(origin?origin.name:api.gpsStatus?.()||'当前没有有效定位，未使用旧点代替'):(origin?'静态起点：'+origin.name+'（非实时 GPS）':'请放置球车或选择起点');
    $('cart-accuracy').textContent=CourseGNSS.measurement(origin,flag?{coordinate:flag}:null)||'没有有效起点，无法计算当前位置的距离。';
    $('cart-coordinate').textContent=target?'临时目标 WGS84：'+target.map(n=>n.toFixed(7)).join(', '):'尚未设置临时测距点';
    $('cart-save-target').disabled=!target||!!drag;
    $('cart-route-start').disabled=!(h.cart_route?.length>=2);
    // Distance arcs are geographic metre offsets projected through the same camera.
    if(flag){const ms=R.metreScale(flag[1]);for(const metres of [100,200]){const coords=[];for(let i=0;i<=120;i++){const a=i*Math.PI*2/120;coords.push([flag[0]+Math.cos(a)*metres/ms.lng,flag[1]+Math.sin(a)*metres/ms.lat]);}const pts=coords.map(project);ctx.beginPath();let pen=false;for(const p of pts){if(!p){pen=false;continue;}pen?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);pen=true;}ctx.strokeStyle='#c1e6e35c';ctx.lineWidth=1;ctx.stroke();}}
    if(from&&target&&flag){polyline([from,target,flag],'#bcf0ff',[7,6]);const a=project(from),b=project(target),c=project(flag);if(a&&b)label(C.format(lastMetrics.toTarget,unit)+' '+unit,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},'#146791');if(b&&c)label(C.format(lastMetrics.targetToFlag,unit)+' '+unit,{x:(b.x+c.x)/2,y:(b.y+c.y)/2},'#17494f');}
    const colors={black:'#26312f',gold:'#e0bf55',blue:'#4598f0',white:'#eeeede',red:'#f36b5b'};
    for(const p of api.allPoints().filter(p=>p.hole===h.n&&(p.type==='tee'||/cart/.test(p.kind)))){const q=project(p.coordinate);if(!q)continue;marker(q,p.type==='tee'?colors[p.color]||'#faf5da':'#55b4ed',p.id===originId?8:5);}
    if(flag){const q=project(flag);if(q){ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(q.x,q.y-32);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#77cdf5';ctx.beginPath();ctx.moveTo(q.x,q.y-32);ctx.lineTo(q.x+22,q.y-25);ctx.lineTo(q.x,q.y-18);ctx.fill();}}
    originScreen=from?project(from):null;if(originScreen){marker(originScreen,'#328fe1',9);label(followLive?'当前位置':'测距起点',{x:originScreen.x,y:originScreen.y+33});}
    targetScreen=target?project(target):null;if(targetScreen){marker(targetScreen,'#fcfff1',11);ctx.strokeStyle='#4b826b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(targetScreen.x,targetScreen.y,5,0,Math.PI*2);ctx.stroke();}
  }
  async function prepare(){
    const next=geometryKey();if(image&&key===next){options();draw();return;}
    const token=++sequence;key=next;image=null;plan=null;model=null;$('cart-render-status').hidden=false;$('cart-render-status').textContent='正在准备高清球洞…';
    if(holeNumber!==api.hole().n){holeNumber=api.hole().n;originId='';target=null;zoom=1;pan={x:0,y:0};}
    options();resize();
    try{const h=structuredClone(api.hole()),result=await H.render(h,api.course().name,2048,{presentation:true});if(!active||token!==sequence)return;const url=URL.createObjectURL(result.blob);try{const img=new Image();img.src=url;await img.decode();if(!active||token!==sequence)return;image=img;plan=H.layout(h,2048);model=R.fit(plan.controls);if(!target)resetTarget();$('cart-render-status').hidden=true;resize();}finally{URL.revokeObjectURL(url);}}
    catch(e){if(token!==sequence)return;key='';target=null;$('cart-render-status').textContent='暂不能生成本洞预览：'+e.message+'。请返回编辑补充本洞地图数据。';draw();}
  }
  async function open(){previousFocus=document.activeElement;inertSiblings=[...host.parentElement.children].filter(e=>e!==host&&!e.inert);inertSiblings.forEach(e=>e.inert=true);active=true;host.hidden=false;$('cart-exit').focus();await prepare();}
  function close(){active=false;++sequence;host.hidden=true;drag=null;placing=false;$('cart-place').setAttribute('aria-pressed','false');$('cart-map-hint').textContent='拖动白色目标点测距 · 滚轮缩放 · 拖动空白平移';inertSiblings.forEach(e=>e.inert=false);inertSiblings=[];api.stopGPS();api.stopSimulation();previousFocus?.focus();}
  host.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();api.exit();}if(e.key==='Tab'){const els=[...host.querySelectorAll('button:not(:disabled),select,summary')].filter(e=>e.getClientRects().length);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  function refresh(){if(!active)return;if(key!==geometryKey()){prepare();return;}options();draw();}
  $('cart-exit').onclick=()=>{close();api.exit();};
  $('cart-hole').onchange=()=>{const next=Number($('cart-hole').value);api.stopSimulation();api.selectHole(next);refresh();};
  $('cart-origin').onchange=()=>{followLive=$('cart-origin').value==='live';originId=followLive?'':$('cart-origin').value;resetTarget();draw();};
  $('cart-gps-start').onclick=()=>{followLive=true;api.startGPS();options();draw();};
  $('cart-route-start').onclick=()=>{followLive=true;api.startSimulation();if(!target)resetTarget();options();draw();};
  $('cart-track-stop').onclick=()=>{api.stopGPS();api.stopSimulation();draw();};
  $('cart-place').onclick=()=>{placing=!placing;$('cart-place').setAttribute('aria-pressed',String(placing));$('cart-map-hint').textContent=placing?'点击地图放置球车，保存为静态编辑点':'拖动白色目标点测距 · 滚轮缩放 · 拖动空白平移';};
  $('cart-target-reset').onclick=()=>{resetTarget();status('临时测距点已重置，没有修改地图');draw();};
  $('cart-save-target').onclick=async()=>{if(!target)return;const c=target.slice();try{await api.place('reference',c,'测距目标');status('已保存目标点，可返回编辑查看 WGS84 坐标');}catch(e){status('保存失败：'+e.message);}draw();};
  function zoomBy(f){zoom=Math.min(6,Math.max(.6,zoom*f));draw();}
  $('cart-fit').onclick=()=>{zoom=1;pan={x:0,y:0};draw();};$('cart-zoom-in').onclick=()=>zoomBy(1.2);$('cart-zoom-out').onclick=()=>zoomBy(1/1.2);
  $('cart-unit').onclick=()=>{unit=unit==='m'?'yd':'m';$('cart-unit').textContent=unit==='m'?'m / yd':'yd / m';draw();};
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?1.08:1/1.08);},{passive:false});
  canvas.onpointerdown=e=>{if(!plan)return;const p=point(e),near=q=>q&&Math.hypot(q.x-p.x,q.y-p.y)<22;const kind=near(targetScreen)?'target':near(originScreen)&&!followLive&&lastOrigin?.local_id&&/cart/.test(lastOrigin.kind)?'cart':'pan';drag={kind,start:p,last:p,moved:false,original:target?.slice(),origin:lastOrigin};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(!drag)return;const p=point(e);if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>4)drag.moved=true;if(drag.kind==='target'){const c=unproject(p);if(c){target=c;status('临时目标已移动；点击保存才写入地图');}}else if(drag.kind==='pan'&&!placing){pan.x+=p.x-drag.last.x;pan.y+=p.y-drag.last.y;}drag.last=p;draw();};
  canvas.onpointercancel=()=>{if(drag?.kind==='target')target=drag.original;drag=null;draw();};
  canvas.onpointerup=async e=>{if(!drag)return;const d=drag,p=point(e),c=unproject(p);drag=null;try{if(!c){status('超出本洞制图范围，没有修改点位');draw();return;}if(placing&&!d.moved){const before=new Set(api.allPoints().map(p=>p.id));await api.place('cart',c,'预览球车');originId=api.allPoints().find(p=>!before.has(p.id))?.id||originId;followLive=false;placing=false;$('cart-place').setAttribute('aria-pressed','false');resetTarget();options();status('球车位置已保存为静态点，不是设备定位');}else if(d.kind==='cart'&&d.moved){await api.move(d.origin,c);status('静态球车位置已保存，原设备精度声明不保留');}else if(!d.moved&&d.kind==='pan'){target=c;status('临时目标已设置，点击保存才写入地图');}}catch(err){status(err.message);}draw();};
  new ResizeObserver(resize).observe(canvas.parentElement);
  return {open,close,refresh,isOpen:()=>active};
};
})(window);
