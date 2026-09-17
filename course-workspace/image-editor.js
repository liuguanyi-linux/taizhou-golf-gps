/* Course-independent image editor. Pixel edits are allowed only inside fitted control coverage. */
(function(root){'use strict';
root.createCourseImageEditor=function(host,api){
  const R=HoleRegistration,P=HolePointWorkspace;
  host.innerHTML=`<div class="image-toolbar"><strong>本洞图片与坐标配准</strong><label>上传 / 更换图片<input id="art-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="art-fit">全图</button><button id="art-minus">−</button><span id="art-scale">100%</span><button id="art-plus">＋</button><button id="art-return">返回地图编辑</button></div>
  <div class="image-workspace"><aside class="image-settings"><p>所有球场使用同一个工具。原图锁定，滚轮缩放，拖空白平移；坐标仅在配准控制点覆盖范围内可编辑。</p><button id="art-live">实时 GPS</button><button id="art-live-stop">停止定位</button><button id="art-sim">模拟本洞车道</button><button id="art-sim-stop">停止模拟</button><p id="art-live-state" role="status"></p>
  <label>图片操作<select id="art-mode"><option value="pan">移动视野 / 拖动已有点</option><option value="control">添加配准对应点</option><option value="cart">放置球车</option><option value="reference">放置目标点</option><option value="flag">设置果岭旗</option><option value="black">设置黑 Tee</option><option value="gold">设置金 Tee</option><option value="blue">设置蓝 Tee</option><option value="white">设置白 Tee</option><option value="red">设置红 Tee</option><option value="route">绘制替换球车路线</option></select></label>
  <label>点位名称<input id="art-name" placeholder="球车 A / 目标点"></label>
  <label>高清图测距起点<select id="art-from"></select></label><label>高清图测距目标（可跨洞）<select id="art-to"></select></label><output id="art-pair-distance" aria-live="polite"></output><label><input id="art-labels" type="checkbox">显示全部点位名称</label>
  <details id="art-registration"><summary>坐标校准（高级）</summary><p>先在地图选同一地物，或输入其 WGS84 坐标；再选“添加配准对应点”，点击图片上的该地物。至少 3 个不共线点，建议 5 个以上覆盖整个球洞。</p>
  <button id="art-pick-map">去地图选择对应位置</button><label>经度<input id="art-lng" type="number" step="any"></label><label>纬度<input id="art-lat" type="number" step="any"></label>
  <label><input id="art-checkpoint" type="checkbox">作为独立检验点（不参与拟合）</label><button id="art-undo">撤销最后一个配准点</button><ol id="art-controls"></ol>
  <details><summary>导入 / 备份配准点 JSON</summary><textarea id="art-controls-json" aria-label="配准点 JSON"></textarea><button id="art-controls-apply">应用配准点 JSON</button></details></details>
  <button id="art-route-finish">完成并保存路线</button><button id="art-route-cancel">取消未保存路线</button><p id="art-quality" role="status"></p><p id="art-position" role="status"></p><p id="art-distance" role="status"></p></aside>
  <section class="image-viewport"><canvas id="art-canvas" aria-label="通用球洞图片编辑画布"></canvas></section></div>`;
  const $=id=>host.querySelector('#'+id),canvas=$('art-canvas'),ctx=canvas.getContext('2d');
  const settings=host.querySelector('.image-settings'),toolbar=host.querySelector('.image-toolbar');toolbar.querySelector('strong').textContent='高清虚拟图';$('art-return').textContent='返回地图';
  const hint=settings.querySelector('p');hint.textContent='滚轮放大，拖动空白移动画面。点击按钮后，在图上放点。';
  const actions=document.createElement('div');actions.className='image-quick-actions';actions.innerHTML='<button id="art-action-pan" aria-pressed="true">移动 / 拖点</button><button id="art-action-cart" aria-pressed="false">放球车</button><button id="art-action-reference" aria-pressed="false">放目标点</button>';hint.after(actions);
  const extra=document.createElement('details');extra.className='image-extra';extra.innerHTML='<summary>更多点位 / 绘制路线</summary>';extra.append($('art-mode').parentElement,$('art-route-finish'),$('art-route-cancel'));settings.append(extra);
  const gps=document.createElement('details');gps.className='image-extra';gps.innerHTML='<summary>实时 GPS / 车道模拟</summary>';gps.append($('art-live'),$('art-live-stop'),$('art-sim'),$('art-sim-stop'),$('art-live-state'));$('art-pair-distance').after(gps);
  const accuracy=document.createElement('p');accuracy.id='art-pair-quality';accuracy.setAttribute('role','status');$('art-pair-distance').after(accuracy);
  const registration=$('art-registration');registration.append($('art-upload').parentElement);settings.append(registration);
  const coverage=document.createElement('label');coverage.innerHTML='<input id="art-coverage" type="checkbox">显示校准范围';registration.prepend(coverage);
  function setMode(mode){if(mode==='cart'||mode==='reference')followLive=false;$('art-mode').value=mode;for(const key of ['pan','cart','reference'])$('art-action-'+key).setAttribute('aria-pressed',String(key===mode));$('art-route-finish').hidden=$('art-route-cancel').hidden=mode!=='route';message(mode==='pan'?'可拖动画面或已有点位。':mode==='cart'?'在图上点击放置球车，放下后可拖动。':mode==='reference'?'在图上点击放置目标点，放下后可拖动。':'在图上点击设置位置。');}
  for(const key of ['pan','cart','reference'])$('art-action-'+key).onclick=()=>setMode(key);
  $('art-mode').onchange=()=>setMode($('art-mode').value);$('art-route-finish').hidden=$('art-route-cancel').hidden=true;
  // The primary distance output is live; hide the obsolete click-only readout.
  $('art-distance').hidden=true;
  let img=null,url=null,model=null,scale=1,x=0,y=0,baseScale=1,active=false,sequence=0,drag=null,route=[],hits=[],viewHole=null,followLive=false,measuredFrom=null,measuredTo=null;
  function updateQuality(){if(active)$('art-pair-quality').textContent=[root.CourseGNSS?.describe(measuredFrom),root.CourseGNSS?.describe(measuredTo),followLive&&!api.live?.()?api.gpsStatus?.():''].filter(Boolean).join('；');}
  const message=t=>$('art-position').textContent=t;
  const visual=()=>api.hole().visual;
  const point=e=>{const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};};
  const pixel=p=>({x:(p.x-x)/scale,y:(p.y-y)/scale});
  const validPixel=p=>img&&p.x>=0&&p.y>=0&&p.x<=img.width&&p.y<=img.height;
  function resize(){const b=canvas.parentElement.getBoundingClientRect();canvas.width=Math.max(1,Math.floor(b.width));canvas.height=Math.max(1,Math.floor(b.height));if(active){if(img)fit();else draw();}}
  function fit(){if(!img)return;baseScale=Math.min((canvas.width-40)/img.width,(canvas.height-40)/img.height);scale=Math.max(.01,baseScale);x=(canvas.width-img.width*scale)/2;y=(canvas.height-img.height*scale)/2;draw();}
  function zoom(mult){if(!img)return;const center={x:canvas.width/2,y:canvas.height/2},old=pixel(center);scale=Math.min(baseScale*12,Math.max(baseScale*.5,scale*mult));x=center.x-old.x*scale;y=center.y-old.y*scale;draw();}
  function build(){const v=visual();model=v?R.fit(v.controls||[],{checkpoints:v.checkpoints||[]}):null;
    $('art-quality').textContent=!v?'尚未绑定图片。上传本洞图片后再配准。':!model.valid?'未完成有效配准：'+model.diagnostics.reason+'。当前不能把图片点击当成 GPS。':v.generator?'由源地图坐标自动配准；零拟合残差只表示转换一致，不表示现场误差为零。现场精度未验证。':'配准覆盖内可编辑 · 拟合残差 '+model.diagnostics.rms_m.toFixed(2)+' m · 独立检验 '+model.diagnostics.independent.count+' 点 · 绝对精度未实测';
    if(model?.valid){const d=model.diagnostics;$('art-quality').textContent+=' · 图上平均比例 '+(1/model.pxPerMeter).toFixed(3)+' m/像素（不是定位精度）'+(d.independent.count?' · 检验最大偏差 '+d.independent.max_m.toFixed(2)+' m':' · 尚无独立检验')+(d.leave_one_out?.count?' · 留一检验最大偏差 '+d.leave_one_out.max_m.toFixed(2)+' m':'');if(d.warnings.some(w=>/checkpoint.*excluded/.test(w)))$('art-quality').textContent+=' · 已排除无效或重复检验点';}
    $('art-controls').replaceChildren();for(const p of [...(v?.controls||[]),...(v?.checkpoints||[])]){const li=document.createElement('li');li.textContent=(p.source||'未知')+' · 像素 '+p.pixel.x.toFixed(1)+','+p.pixel.y.toFixed(1)+' ↔ '+p.coordinate.map(n=>n.toFixed(7)).join(',');$('art-controls').append(li);}
    $('art-controls-json').value=JSON.stringify({controls:v?.controls||[],checkpoints:v?.checkpoints||[]},null,2);draw();
  }
  function path(coords,color,dash=[]){if(!model?.valid)return;const points=coords.map(c=>R.geoToPixel(model,c,{allowExtrapolation:true}));ctx.beginPath();points.forEach((p,i)=>{if(p)(i?ctx.lineTo(x+p.x*scale,y+p.y*scale):ctx.moveTo(x+p.x*scale,y+p.y*scale));});ctx.strokeStyle=color;ctx.lineWidth=3;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#eee8dc';ctx.fillRect(0,0,canvas.width,canvas.height);hits=[];
    if(!img){$('art-live-state').textContent='本洞图片尚未加载，不能显示定位。';ctx.fillStyle='#263a26';ctx.font='17px system-ui';ctx.fillText('请上传图片，或返回地图使用坐标驱动的虚拟图。',30,70);return;}
    ctx.drawImage(img,x,y,img.width*scale,img.height*scale);$('art-scale').textContent=Math.round(scale/baseScale*100)+'%';
    const all=api.allPoints?api.allPoints():api.points(),tracked=api.live?.();if(tracked)all.unshift({...tracked,id:'image-live',name:'当前 GPS / 路线模拟'});
    for(const [id,kind] of [['art-from','cart'],['art-to','flag']]){const s=$(id),old=s.value,local=all.filter(p=>p.hole===api.hole().n);s.replaceChildren(new Option(kind==='cart'?'选择起点 / 放置球车':'选择测距目标',''),...all.map(p=>new Option((p.hole?'第 '+p.hole+' 洞 · ':'')+p.name,p.id)));if(all.some(p=>p.id===old))s.value=old;else{const p=kind==='cart'?(local.find(p=>/cart/.test(p.kind))||local.find(p=>p.type==='tee')):(local.find(p=>p.role==='flag')||local.find(p=>p.name.includes('果岭中心')));if(p)s.value=p.id;}}
    if(followLive)$('art-from').value=tracked?'image-live':'';
    const from=all.find(p=>p.id===$('art-from').value),to=all.find(p=>p.id===$('art-to').value);$('art-pair-distance').textContent=from&&to?'直线距离 '+P.distanceMeters(from.coordinate,to.coordinate).toFixed(1)+' m':'放置球车并选择测距目标';
    measuredFrom=from;measuredTo=to;updateQuality();
    if(model?.valid&&$('art-coverage').checked){ctx.beginPath();model.hull.forEach((p,i)=>i?ctx.lineTo(x+p.x*scale,y+p.y*scale):ctx.moveTo(x+p.x*scale,y+p.y*scale));ctx.closePath();ctx.strokeStyle='#00ab93';ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.stroke();ctx.setLineDash([]);}
    path(api.hole().cart_route||[],'#a1d453',[8,6]);path(route,'#fc872d');
    for(const p of api.points()){const pt=R.geoToPixel(model,p.coordinate);if(!pt||!validPixel(pt))continue;const sx=x+pt.x*scale,sy=y+pt.y*scale,selected=p.id===from?.id||p.id===to?.id;ctx.beginPath();ctx.arc(sx,sy,selected?7:4,0,Math.PI*2);ctx.fillStyle=/cart/.test(p.kind)?'#1486ef':'#ffd34c';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=selected?2:1;ctx.stroke();ctx.font='12px system-ui';ctx.fillStyle='#182317';if($('art-labels').checked||selected)ctx.fillText(p.name,sx+10,sy-8);hits.push({x:sx,y:sy,p});}
    const live=api.live?.();$('art-live-state').textContent=live?(live.name+' · '+(R.geoToPixel(model,live.coordinate)?'图片范围内':'图片配准范围外，不显示假位置')+(api.hole().flag?' · 距旗 '+P.distanceMeters(live.coordinate,api.hole().flag).toFixed(1)+' m':'')):api.gpsStatus?.()||'未启用定位或路线模拟';
    if($('art-coverage').checked)for(const [i,c] of (visual()?.controls||[]).entries()){ctx.beginPath();ctx.arc(x+c.pixel.x*scale,y+c.pixel.y*scale,5,0,Math.PI*2);ctx.fillStyle='#00a890';ctx.fill();ctx.fillText(String(i+1),x+c.pixel.x*scale+8,y+c.pixel.y*scale);}
  }
  async function save(){await api.changed();build();}
  async function open(){active=true;host.hidden=false;const token=++sequence;route=[];drag=null;img=null;if(viewHole!==api.hole().n){viewHole=api.hole().n;$('art-from').replaceChildren();$('art-to').replaceChildren();$('art-name').value='';setMode('pan');}resize();const v=visual();build();if(!v){draw();return;}try{const b=await CourseProjects.source(v);if(token!==sequence)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(b);const next=new Image();next.src=url;await next.decode();if(token!==sequence)return;if(next.width*next.height>50000000)throw Error('图片尺寸超过限制');img=next;fit();build();}catch(e){message(e.message);}}
  function close(){active=false;++sequence;host.hidden=true;route=[];drag=null;}
  $('art-return').onclick=()=>{close();api.close();};$('art-fit').onclick=fit;$('art-minus').onclick=()=>zoom(1/1.2);$('art-plus').onclick=()=>zoom(1.2);
  $('art-from').onchange=()=>{followLive=false;draw();};$('art-to').onchange=draw;$('art-labels').onchange=draw;$('art-coverage').onchange=draw;
  $('art-live').onclick=()=>{followLive=true;api.startGPS();draw();};$('art-live-stop').onclick=()=>{api.stopGPS();draw();};$('art-sim').onclick=()=>{followLive=true;api.startSimulation();draw();};$('art-sim-stop').onclick=()=>{api.stopSimulation();draw();};
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.1:1/1.1);},{passive:false});
  canvas.onpointerdown=e=>{if(!img)return;const p=point(e),hit=hits.find(h=>Math.hypot(h.x-p.x,h.y-p.y)<12);drag={start:p,previous:p,hit:$('art-mode').value==='pan'?hit:null,moved:false};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{const p=point(e);if(drag){if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>4)drag.moved=true;if(!drag.hit&&$('art-mode').value==='pan'){x+=p.x-drag.previous.x;y+=p.y-drag.previous.y;draw();}drag.previous=p;}const px=pixel(p),c=R.pixelToGeo(model,px);message(c?'WGS84 '+c.map(n=>n.toFixed(7)).join(', '):'当前图片位置未被有效配准覆盖；不推算 GPS。');};
  canvas.onpointercancel=()=>{drag=null;};
  canvas.onpointerup=async e=>{if(!drag)return;const d=drag;drag=null;const px=pixel(point(e));if(!validPixel(px))return;try{
    if(d.hit&&d.moved){const c=R.pixelToGeo(model,px);if(!c)throw Error('拖动目标超出配准覆盖，不修改坐标');await api.move(d.hit.p,c);build();return;}
    if(d.moved)return;const mode=$('art-mode').value;
    if(mode==='control'){const values=[$('art-lng').value,$('art-lat').value],c=values.map(Number);if(values.some(v=>v.trim()==='')||!CourseStore.valid(c))throw Error('先选地图对应点或填写有效 WGS84 坐标');const v=visual(),key=$('art-checkpoint').checked?'checkpoints':'controls';v[key]??=[];v[key].push({id:crypto.randomUUID(),pixel:px,coordinate:c,source:'manual_map',accuracy_m:null});await save();return;}
    if(mode==='pan'){if(d.hit&&api.hole().flag)$('art-distance').textContent=d.hit.p.name+' → 果岭旗：'+P.distanceMeters(d.hit.p.coordinate,api.hole().flag).toFixed(1)+' m（直线）';return;}
    const c=R.pixelToGeo(model,px);if(!c)throw Error('请先建立有效配准；只允许在绿色控制点覆盖范围内放点');
    if(mode==='route'){route.push(c);draw();message('待保存路线 '+route.length+' 节点；完成后才替换当前路线');return;}
    const previous=new Set(api.points().map(p=>p.id));await api.place(mode,c,$('art-name').value.trim());build();const added=api.points().find(p=>!previous.has(p.id));if(added){$('art-from').value=added.id;draw();}setMode('pan');message('已放置并保存，可直接拖动调整。');if(api.hole().flag)$('art-distance').textContent='此点 → 果岭旗：'+P.distanceMeters(c,api.hole().flag).toFixed(1)+' m（直线）';
  }catch(err){message(err.message);}};
  $('art-upload').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const id=await CourseProjects.put(f),u=URL.createObjectURL(f);try{const temp=new Image();temp.src=u;await temp.decode();if(temp.width*temp.height>50000000)throw Error('图片尺寸超过限制');api.hole().visual={asset_id:id,width:temp.width,height:temp.height,controls:[],checkpoints:[]};await save();await open();message('已绑定本洞图片。更换图片后需要重新配准；旧图片仍保留在本机资源库。');}finally{URL.revokeObjectURL(u);}}catch(err){message(err.message);}};
  $('art-pick-map').onclick=()=>{close();api.pick(c=>{$('art-lng').value=c[0];$('art-lat').value=c[1];$('art-mode').value='control';open();message('地图位置已记录，请点击图片上的同一地物。');});};
  $('art-undo').onclick=async()=>{const v=visual();if(!v)return;(v.controls||[]).pop();await save();};
  $('art-controls-apply').onclick=async()=>{try{const d=JSON.parse($('art-controls-json').value),v=visual();if(!v)throw Error('请先绑定图片');if(!Array.isArray(d.controls)||d.controls.length>100||!Array.isArray(d.checkpoints||[]))throw Error('需要 controls 数组，最多 100 点');for(const p of [...d.controls,...(d.checkpoints||[])])if(!CourseStore.valid(p.coordinate)||!Number.isFinite(p.pixel?.x)||!Number.isFinite(p.pixel?.y)||!validPixel(p.pixel))throw Error('配准点格式或范围无效');v.controls=d.controls;v.checkpoints=d.checkpoints||[];await save();}catch(e){message(e.message);}};
  $('art-route-finish').onclick=async()=>{if(route.length<2){message('至少绘制两个路线节点');return;}api.hole().cart_route=route.map(p=>p.slice());route=[];await save();message('本洞球车路线已保存');};$('art-route-cancel').onclick=()=>{route=[];draw();};
  new ResizeObserver(resize).observe(canvas.parentElement);
  return {open,close,updateQuality,refresh:()=>{if(active)draw();}};
};
})(window);
