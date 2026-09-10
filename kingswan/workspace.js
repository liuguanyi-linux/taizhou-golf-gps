'use strict';
(() => {
 const G=window.KingswanGeo,B=window.KINGSWAN_BASELINE,$=id=>document.getElementById(id);
 const QA=new URLSearchParams(location.search).get('qa')==='1';
 const KEY='kingswan-cn0000386-workspace-v1'+(QA?'-qa':''),blank=()=>({schema_version:'kingswan-editor/1',course_id:'cn0000386',features:[],holes:B.holes.map(h=>({hole:h.n,controls:[],checkpoints:[]}))});
 if(QA)document.querySelector('h1').textContent='金沙湾 · 隔离测试（非实地数据）';
 let state=blank(),hole=1,selected='',vertex=0,mode='edit',drawing=null,pair=null,simulation=null,watch=null,undo=[],live=new Map(),imageLayer;
 try{const saved=localStorage.getItem(KEY);if(saved)state=validateState(JSON.parse(saved));}catch(e){$('saveStatus').textContent='旧草稿未加载：'+e.message+'；未覆盖旧存储，请先导出检查。';}
 const real=L.map('realMap',{scrollWheelZoom:'center'}).setView([31.74726,119.32662],16);
 const virtual=L.map('virtualMap',{crs:L.CRS.Simple,minZoom:-5,maxZoom:3,zoomSnap:.25,zoomDelta:.5,scrollWheelZoom:'center'});
 L.control.scale({imperial:false}).addTo(real);
 const tiles=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'}).addTo(real);
 tiles.on('load',()=>{$('tileStatus').textContent='影像已加载 · 非实测';});tiles.on('tileerror',()=>{$('tileStatus').textContent='部分影像加载失败，请检查网络';});
 L.geoJSON(B.boundary,{style:{color:'#e8b853',weight:2,dashArray:'6 6',fillOpacity:0,interactive:false}}).addTo(real);
 real.attributionControl.addAttribution('场地参考 © OpenStreetMap contributors (ODbL)');
 const groups={real:L.layerGroup().addTo(real),virtual:L.layerGroup().addTo(virtual)};
 const lineKinds=['cart_route','cart_path'],areaKinds=['hole_perimeter','green','bunker','water'];
 const kindLabels=Object.fromEntries(Array.from($('tool').options).map(o=>[o.value,o.textContent]));
 const textNode=text=>{const n=document.createElement('span');n.textContent=text;return n;};
 function say(text){$('notice').textContent=(QA?'隔离测试：':'')+text;}
 function h(){return state.holes.find(h=>h.hole===hole);}
 function base(){return B.holes.find(h=>h.n===hole);}
 function model(){return G.fit(h().controls);}
 function feature(){return state.features.find(f=>f.id===selected);}
 function points(g){return !g?[]:g.type==='Point'?[g.coordinates]:g.type==='Polygon'?g.coordinates[0].slice(0,-1):g.coordinates;}
 function geometry(type,pts){return {type,coordinates:type==='Point'?pts[0]:type==='Polygon'?[[...pts,...[pts[0].slice()]]]:pts};}
 function inImage(p){return G.pixel(p)&&p.x>=0&&p.y>=0&&p.x<=base().image.width&&p.y<=base().image.height;}
 function geoPixels(f){if(f.pixel_geometry&&f.properties.source==='virtual_pick')return f.pixel_geometry;const m=model(),pts=points(f.geometry).map(c=>G.toPixel(m,c));return pts.length&&pts.every(p=>p&&inImage(p))?geometry(f.geometry.type,pts.map(p=>[p.x,p.y])):null;}
 function reconcile(){const m=model();state.features.filter(f=>f.properties.hole===hole&&f.properties.source==='virtual_pick').forEach(f=>{const pts=points(f.pixel_geometry).map(p=>G.toGeo(m,{x:p[0],y:p[1]}));f.geometry=pts.length&&pts.every(Boolean)?geometry(f.pixel_geometry.type,pts):null;f.properties.registration_quality=f.geometry?'calibrated_unverified':'unregistered_pixel_draft';});}
 function checkpoint(){undo.push(JSON.stringify(state));if(undo.length>30)undo.shift();}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(state));$('saveStatus').textContent='已保存到本浏览器 · '+new Date().toLocaleTimeString()+' · 换设备前请导出';}catch(e){$('saveStatus').textContent='保存失败，请立即导出：'+e.message;}}
 function commit(){save();render();}
 function setGeometry(f,type,pts,surface){
   const candidate=geometry(type,surface==='real'?pts:pts.map(p=>[p[0]/1000,p[1]/1000]));G.validateFeature({...f,geometry:candidate});
   if(surface==='real'){f.geometry=geometry(type,pts);f.pixel_geometry=null;f.properties.source='map_pick';f.properties.registration_quality='geographic_unverified';}
   else{const m=model(),geo=pts.map(p=>G.toGeo(m,{x:p[0],y:p[1]}));if(f.geometry&&!geo.every(Boolean))throw Error('已有地理要素不能拖出配准覆盖范围；请补充对应点');f.pixel_geometry=geometry(type,pts);f.geometry=geo.every(Boolean)?geometry(type,geo):null;f.properties.source='virtual_pick';f.properties.registration_quality=f.geometry?'calibrated_unverified':'unregistered_pixel_draft';}
   f.properties.updated_at=new Date().toISOString();f.properties.accuracy_m=null;
 }
 function validateState(s){
   if(s?.schema_version!=='kingswan-editor/1'||s.course_id!=='cn0000386'||!Array.isArray(s.features)||!Array.isArray(s.holes))throw Error('文件版本或球场不匹配');
   if(s.holes.length!==18||new Set(s.holes.map(x=>x.hole)).size!==18||s.holes.some(x=>!Number.isInteger(x.hole)||x.hole<1||x.hole>18))throw Error('需要完整 18 洞且洞号唯一');
   const ids=new Set();for(const f of s.features){if(typeof f?.id!=='string'||!f.id.trim()||ids.has(f.id))throw Error('要素 ID 缺失或重复');ids.add(f.id);if(!Number.isInteger(f.properties?.hole)||f.properties.hole<1||f.properties.hole>18)throw Error('要素洞号无效');if(f.geometry)G.validateFeature(f);else if(!f.pixel_geometry)throw Error('要素无坐标');
     if(f.pixel_geometry){const im=B.holes[f.properties.hole-1].image,pts=points(f.pixel_geometry);if(!['Point','LineString','Polygon'].includes(f.pixel_geometry.type)||!pts.length||pts.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[1]<0||p[0]>im.width||p[1]>im.height))throw Error('像素草稿超出图片范围');if(f.pixel_geometry.type==='Polygon'&&JSON.stringify(f.pixel_geometry.coordinates[0][0])!==JSON.stringify(f.pixel_geometry.coordinates[0].at(-1)))throw Error('像素区域必须闭合');G.validateFeature({...f,geometry:geometry(f.pixel_geometry.type,pts.map(p=>[p[0]/1000,p[1]/1000]))});}
   }
   for(const item of s.holes){for(const list of [item.controls,item.checkpoints]){if(!Array.isArray(list))throw Error('对应点格式无效');for(const c of list)if(!G.coordinate(c.coordinate)||!G.pixel(c.pixel)||c.pixel.x<0||c.pixel.y<0||c.pixel.x>B.holes[item.hole-1].image.width||c.pixel.y>B.holes[item.hole-1].image.height)throw Error('对应点坐标或像素范围无效');}}
   for(const f of s.features){f.properties.field_verified=false;if(f.properties.source==='virtual_pick'){if(!f.pixel_geometry)throw Error('虚拟来源要素缺少像素锚点');const m=G.fit(s.holes[f.properties.hole-1].controls),pts=points(f.pixel_geometry).map(p=>G.toGeo(m,{x:p[0],y:p[1]}));f.geometry=pts.every(Boolean)?geometry(f.pixel_geometry.type,pts):null;f.properties.registration_quality=f.geometry?'calibrated_unverified':'unregistered_pixel_draft';}}
   return s;
 }
 function select(id){selected=id;vertex=0;render();}
 function pointCoordinate(f){return live.get(f.id)?.coordinate||f.geometry?.coordinates;}
 function render(){
   groups.real.clearLayers();groups.virtual.clearLayers();
   const m=model();
   if(m.valid)L.polygon(m.hull.map(p=>[base().image.height-p.y,p.x]),{color:'#228c99',weight:1,dashArray:'5 5',fillOpacity:.04,interactive:false}).addTo(groups.virtual);
   for(const f of state.features.filter(f=>f.properties.hole===hole)){
     for(const surface of ['real','virtual']){
       let g=surface==='real'?f.geometry:geoPixels(f);
       if(f.geometry?.type==='Point'&&live.has(f.id)){const c=pointCoordinate(f),p=G.toPixel(m,c);g=surface==='real'?{type:'Point',coordinates:c}:p&&inImage(p)?{type:'Point',coordinates:[p.x,p.y]}:null;}
       if(!g)continue;
       const convert=p=>surface==='real'?[p[1],p[0]]:[base().image.height-p[1],p[0]],pts=points(g).map(convert);
       const color=f.properties.kind==='cart'?'#1595df':f.properties.kind==='water'?'#1682ca':f.properties.kind==='bunker'?'#c69428':f.properties.kind==='cart_route'?'#e8bc28':'#90c654';
       const options={color:f.id===selected?'#ff793f':color,weight:3,fillOpacity:.2};
       const layer=g.type==='Point'?L.circleMarker(pts[0],{...options,radius:f.properties.kind==='cart'?8:6,fillOpacity:1}):g.type==='Polygon'?L.polygon(pts,options):L.polyline(pts,options);
       layer.addTo(groups[surface]).bindTooltip(textNode(f.properties.name||f.id),{permanent:g.type==='Point',direction:'top'});
       layer.on('click',e=>{L.DomEvent.stopPropagation(e);if(mode!=='edit')return;if(pair||drawing||$('tool').value!=='select'){const ll=e.latlng;mapClick(surface,surface==='real'?[ll.lng,ll.lat]:[ll.lng,base().image.height-ll.lat]);}else select(f.id);});
       if(f.id===selected&&mode==='edit'&&!pair&&!live.has(f.id))pts.forEach((p,i)=>{
         const marker=L.marker(p,{draggable:true,icon:L.divIcon({className:'vertex'+(i===vertex?' selected':''),iconSize:[14,14],iconAnchor:[7,7]})}).addTo(groups[surface]);
         marker.on('click',e=>{L.DomEvent.stopPropagation(e);vertex=i;render();});
         marker.on('dragstart',checkpoint);marker.on('dragend',()=>{try{const ll=marker.getLatLng(),raw=points(g).map(p=>p.slice()),next=surface==='real'?[ll.lng,ll.lat]:[ll.lng,base().image.height-ll.lat];if(surface==='virtual'&&!inImage({x:next[0],y:next[1]}))throw Error('不能拖出图片');raw[i]=next;setGeometry(f,g.type,raw,surface);commit();say('节点已保存；同一地理坐标驱动两张图。');}catch(e){say(e.message);render();}});
       });
     }
   }
   h().controls.forEach((c,i)=>{L.circleMarker([c.coordinate[1],c.coordinate[0]],{radius:5,color:'#f976d4'}).bindTooltip('对应点 '+(i+1)).addTo(groups.real);L.circleMarker([base().image.height-c.pixel.y,c.pixel.x],{radius:5,color:'#f976d4'}).bindTooltip('对应点 '+(i+1)).addTo(groups.virtual);});
   if(drawing?.points.length){const ps=drawing.points.map(p=>drawing.surface==='real'?[p[1],p[0]]:[base().image.height-p[1],p[0]]);L.polyline(ps,{color:'#ffb636',dashArray:'4 4'}).addTo(groups[drawing.surface]);ps.forEach(p=>L.circleMarker(p,{radius:4,color:'#ffb636'}).addTo(groups[drawing.surface]));}
   $('drawingHint').textContent=pair?(pair.coordinate?'现在点虚拟图上的相同地物':'现在点卫星图上的地物'):drawing?`已绘 ${drawing.points.length} 个节点，点“完成线 / 面”保存`:'未完成配准时，虚拟图标点仅保存像素草稿。';
   $('calibrationStatus').textContent=m.valid?`${h().controls.length} 个对应点 · 拟合 RMS ${m.rms_m.toFixed(2)} m（非实地精度）`:`${h().controls.length} 个对应点 · ${m.reason}`;
   const errors=m.valid?h().checkpoints.map(c=>G.distance(G.toGeo(m,c.pixel),c.coordinate)).filter(v=>v!==null):[];
   if(h().checkpoints.length)$('calibrationStatus').textContent+=` · 独立检查 ${errors.length}/${h().checkpoints.length} 点${errors.length?'，最大偏差 '+Math.max(...errors).toFixed(2)+' m':''}`;
   $('controls').replaceChildren(...h().controls.map((c,i)=>{const li=document.createElement('li');li.textContent=`${c.coordinate.map(n=>n.toFixed(6)).join(', ')} ↔ ${Math.round(c.pixel.x)}, ${Math.round(c.pixel.y)}`;return li;}));
   const list=state.features.filter(f=>f.properties.hole===hole);$('features').replaceChildren(new Option('选择对象',''),...list.map(f=>new Option((f.properties.name||f.id)+(f.geometry?'':' · 像素草稿'),f.id)));$('features').value=selected;
   const f=feature(),pts=points(f?.geometry||f?.pixel_geometry);vertex=Math.min(vertex,Math.max(0,pts.length-1));$('vertex').replaceChildren(...pts.map((p,i)=>new Option('第 '+(i+1)+' 点',i)));$('vertex').value=vertex;
   if(f){$('name').value=f.properties.name||'';const c=points(f.geometry)[vertex];$('lng').value=c?c[0].toFixed(8):'';$('lat').value=c?c[1].toFixed(8):'';}
   else{$('lng').value='';$('lat').value='';}
   $('featureId').textContent=f?'对象 ID：'+f.id:'选中球车后，这里显示接入所需的稳定 ID。';
   const allPoints=state.features.filter(f=>f.geometry?.type==='Point'),oldFrom=$('from').value,oldTo=$('to').value;
   for(const id of ['from','to'])$(id).replaceChildren(new Option('选择点位',''),...allPoints.map(f=>new Option(`H${f.properties.hole} · ${f.properties.name||f.id}`,f.id)));
   $('from').value=allPoints.some(f=>f.id===oldFrom)?oldFrom:'';$('to').value=allPoints.some(f=>f.id===oldTo)?oldTo:'';
   metrics();
 }
 function metrics(){
   const a=state.features.find(f=>f.id===$('from').value),b=state.features.find(f=>f.id===$('to').value),d=a&&b?G.distance(pointCoordinate(a),pointCoordinate(b)):null;
   $('distance').textContent=d===null?'请选择两个有效 GPS 点':`${d.toFixed(1)} m · 地表直线估算`;
   const r=state.features.find(f=>f.properties.hole===a?.properties.hole&&f.properties.kind==='cart_route'&&f.geometry?.type==='LineString'),p=r&&a?G.project(r.geometry.coordinates,pointCoordinate(a)):null;
   $('routeMetric').textContent=p?`投影到路线后剩余 ${p.remaining.toFixed(1)} m；距路线 ${p.offset.toFixed(1)} m。${b?' 路线终点到目标直线 '+G.distance(r.geometry.coordinates.at(-1),pointCoordinate(b)).toFixed(1)+' m（不是已确认连接道路）。':''}`:'沿路距离需要该洞已标注的球车路线，不能用直线或中线冒充。';
   if(a&&live.has(a.id)){const p=live.get(a.id),age=Date.now()-Date.parse(p.timestamp);$('gpsStatus').textContent=`${a.properties.name} · ${p.source} · 精度 ${p.accuracy_m==null?'未知':p.accuracy_m+' m'}${age>30000?' · 数据已过期':''}${!G.toPixel(model(),p.coordinate)?' · 当前图片未配准或位置在覆盖外，未强行吸附':''}`;}
 }
 function mapClick(surface,raw){
   if(mode!=='edit'){say('设备预览中不能修改底层数据，请先进入编辑模式。');return;}
   if(surface==='virtual'&&!inImage({x:raw[0],y:raw[1]})){say('点击超出虚拟图范围，未添加点。');return;}
   if(pair){if(surface==='real'){pair.coordinate=raw;say('已取地图坐标，请点虚拟图上相同位置。');render();return;}if(!pair.coordinate){say('请先点击卫星图，再点击虚拟图。');return;}checkpoint();h()[pair.check?'checkpoints':'controls'].push({id:crypto.randomUUID(),coordinate:pair.coordinate,pixel:{x:raw[0],y:raw[1]},source:'satellite_manual_pick',accuracy_m:null});pair=null;reconcile();commit();say('对应点已保存。需要至少 3 个分散且不共线的点；仍须独立检查。');return;}
   const kind=$('tool').value;if(kind==='select'){say(surface==='real'?`WGS84 ${raw.map(n=>n.toFixed(8)).join(', ')}`:`图片像素 ${raw.map(Math.round).join(', ')}；请选择绘制工具或已有对象。`);return;}
   const type=lineKinds.includes(kind)?'LineString':areaKinds.includes(kind)?'Polygon':'Point';
   if(drawing&&drawing.surface!==surface){say('一条线或面请在同一张图上完成，或先取消。');return;}
   if(type!=='Point'){drawing=drawing||{surface,type,kind,points:[]};drawing.points.push(raw);render();return;}
   createFeature(surface,type,kind,[raw]);
 }
 function createFeature(surface,type,kind,pts){
   checkpoint();const id=crypto.randomUUID(),f={type:'Feature',id,properties:{hole,kind,name:$('name').value.trim()||kindLabels[kind]+' '+(state.features.filter(f=>f.properties.hole===hole).length+1),field_verified:false},geometry:null};
   try{setGeometry(f,type,pts,surface);}catch(e){undo.pop();say('未保存：'+e.message);return;}state.features.push(f);drawing=null;selected=id;vertex=0;$('tool').value='select';commit();say(f.geometry?'已保存地理要素；这仍是地图拾取或人工配准坐标，不是实测。':'已保存像素草稿。没有添加虚假的 GPS 点；完成配准后才能计算地理距离。');
 }
 real.on('click',e=>mapClick('real',[e.latlng.lng,e.latlng.lat]));virtual.on('click',e=>mapClick('virtual',[e.latlng.lng,base().image.height-e.latlng.lat]));
 real.on('mousemove',e=>{$('coordinateReadout').textContent=`WGS84 地图位置：${e.latlng.lng.toFixed(8)}, ${e.latlng.lat.toFixed(8)} · 影像拾取坐标，非测量认证`;});
 virtual.on('mousemove',e=>{const p={x:e.latlng.lng,y:base().image.height-e.latlng.lat},c=inImage(p)?G.toGeo(model(),p):null;$('coordinateReadout').textContent=`像素 ${p.x.toFixed(1)}, ${p.y.toFixed(1)} · ${c?'配准估算 WGS84 '+c.map(n=>n.toFixed(8)).join(', '):'未配准 / 覆盖范围外，不反算 GPS'}`;});
 function fitVirtual(){virtual.invalidateSize();virtual.fitBounds([[0,0],[base().image.height,base().image.width]],{padding:[20,20],animate:false});}
 function fitReal(){real.invalidateSize();const ps=state.features.filter(f=>f.properties.hole===hole).flatMap(f=>points(f.geometry));if(ps.length)real.fitBounds(ps.map(c=>[c[1],c[0]]),{padding:[30,30],maxZoom:18,animate:false});else real.fitBounds([[31.7399916,119.3178599],[31.7545322,119.3353875]],{padding:[10,10],animate:false});}
 function stop(){if(simulation)clearInterval(simulation);simulation=null;}
 function chooseHole(n){stop();hole=n;selected='';vertex=0;drawing=null;pair=null;$('name').value='';$('tool').value='select';
   document.querySelectorAll('#holes button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.hole===n));
   $('holeSummary').textContent=`第 ${n} 洞 · PAR ${base().par} · 黑/金/蓝/白/红：${Object.values(base().scorecard_yards).join(' / ')} 码${n===2?'；白 Tee 383 与攻略 363 待核对':''}`;
   if(imageLayer)virtual.removeLayer(imageLayer);imageLayer=L.imageOverlay(base().image.path,[[0,0],[base().image.height,base().image.width]]).addTo(virtual);imageLayer.on('error',()=>say('虚拟图加载失败，请检查随包图片。'));
   $('virtualTitle').textContent=`第 ${n} 洞 · 虚拟草稿（滚轮缩放 / 拖动平移 / 复位）`;$('imageDownload').href=base().image.path;
   fitVirtual();fitReal();render();say('第 '+n+' 洞已载入；没有自动套用其他洞的坐标。');
 }
 B.holes.forEach(h=>{const b=document.createElement('button');b.textContent=h.n;b.dataset.hole=h.n;b.setAttribute('aria-label','第 '+h.n+' 洞');b.onclick=()=>chooseHole(h.n);$('holes').append(b);});
 $('features').onchange=()=>select($('features').value);$('vertex').onchange=()=>{vertex=+$('vertex').value;render();};
 $('tool').onchange=()=>{drawing=null;pair=null;selected='';$('name').value='';render();};
 $('finish').onclick=()=>{if(!drawing){say('请先选择线或面并在图上点击。');return;}if(drawing.points.length<(drawing.type==='Polygon'?3:2)){say('节点不足：线至少 2 个，面至少 3 个。');return;}createFeature(drawing.surface,drawing.type,drawing.kind,drawing.points);};
 $('cancel').onclick=()=>{drawing=null;pair=null;$('tool').value='select';render();};
 $('applyCoordinate').onclick=()=>{try{const f=feature();if(!f)throw Error('先选择对象');if(!$('lng').value.trim()||!$('lat').value.trim())throw Error('经纬度不能为空；像素草稿请先配准');const c=[Number($('lng').value),Number($('lat').value)];if(!G.coordinate(c))throw Error('坐标范围无效');const ps=points(f.geometry).map(p=>p.slice());if(!ps.length)throw Error('像素草稿请通过对应点配准，不能只修改一个节点就赋予整条线路 GPS');checkpoint();ps[vertex]=c;setGeometry(f,f.geometry.type,ps,'real');f.properties.name=$('name').value.trim()||f.properties.name;live.delete(f.id);commit();}catch(e){say(e.message);}};
 $('insertNode').onclick=()=>{const f=feature();if(!f||(f.geometry||f.pixel_geometry).type==='Point'){say('请选择线或面节点');return;}checkpoint();const g=f.geometry||f.pixel_geometry,ps=points(g).map(p=>p.slice()),next=ps[vertex+1]||(g.type==='Polygon'?ps[0]:null);ps.splice(vertex+1,0,next?ps[vertex].map((v,i)=>(v+next[i])/2):ps[vertex].slice());setGeometry(f,g.type,ps,f.geometry?'real':'virtual');vertex++;commit();};
 $('removeNode').onclick=()=>{const f=feature();if(!f)return;const g=f.geometry||f.pixel_geometry,ps=points(g).map(p=>p.slice());if(ps.length<=(g.type==='Polygon'?3:g.type==='LineString'?2:1)){say('已到最少节点数；如需删除请删除整个对象。');return;}checkpoint();ps.splice(vertex,1);try{setGeometry(f,g.type,ps,f.geometry?'real':'virtual');commit();}catch(e){undo.pop();say(e.message);}};
 $('delete').onclick=()=>{if(!feature())return;checkpoint();state.features=state.features.filter(f=>f.id!==selected);live.delete(selected);selected='';commit();};
 $('undo').onclick=()=>{if(!undo.length){say('没有可撤销操作');return;}stop();state=JSON.parse(undo.pop());selected='';drawing=null;pair=null;commit();say('已撤销上一步');};
 for(const [id,check] of [['addControl',false],['addCheckpoint',true]])$(id).onclick=()=>{drawing=null;pair={check};$('maps').dataset.view='both';document.querySelectorAll('[data-view]').forEach(b=>{if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',b.dataset.view==='both');});real.invalidateSize();virtual.invalidateSize();say('先点卫星图，再点虚拟图中的相同地物。');render();};
 $('undoControl').onclick=()=>{if(!h().controls.length)return;checkpoint();h().controls.pop();reconcile();commit();};
 function switchMode(next){mode=next;drawing=null;pair=null;document.body.classList.toggle('gps-mode',mode==='gps');$('editMode').setAttribute('aria-pressed',mode==='edit');$('gpsMode').setAttribute('aria-pressed',mode==='gps');if(mode==='edit')stop();render();say(mode==='gps'?'同页设备预览：选择起点与目标。模拟沿已绘球车路线，真实 GPS 不强行吸附。':'编辑模式：卫星图与虚拟图共用坐标要素。');}
 $('editMode').onclick=()=>switchMode('edit');$('gpsMode').onclick=()=>switchMode('gps');
 document.querySelectorAll('button[data-view]').forEach(b=>b.onclick=()=>{$('maps').dataset.view=b.dataset.view;document.querySelectorAll('button[data-view]').forEach(x=>x.setAttribute('aria-pressed',x===b));real.invalidateSize();virtual.invalidateSize();});
 $('fitReal').onclick=fitReal;$('fitVirtual').onclick=fitVirtual;$('from').onchange=metrics;$('to').onchange=metrics;
 function simAt(value){const f=state.features.find(f=>f.id===$('from').value&&f.properties.kind==='cart'&&f.properties.hole===hole),r=state.features.find(f=>f.properties.hole===hole&&f.properties.kind==='cart_route'&&f.geometry?.type==='LineString');if(!f||!r){say('先在本洞画好球车路线，并在“起点”选择本洞球车。');stop();return false;}if(watch!==null){say('请先停止实时 GPS 再模拟');stop();return false;}const route=G.route(r.geometry.coordinates);live.set(f.id,{coordinate:G.along(route,route.length*value/100),timestamp:new Date().toISOString(),accuracy_m:null,source:'模拟（非真实 GPS）'});render();return true;}
 $('progress').oninput=()=>{stop();simAt(+$('progress').value);};$('simulate').onclick=()=>{stop();$('progress').value=0;if(!simAt(0))return;simulation=setInterval(()=>{const value=Math.min(100,+$('progress').value+1);$('progress').value=value;simAt(value);if(value===100)stop();},300);};$('stop').onclick=stop;
 function updatePositions(entries){const parsed=G.telemetry(entries);for(const p of parsed){const f=state.features.find(f=>f.id===p.id&&f.properties.kind==='cart'&&f.properties.hole===p.hole);if(!f)throw Error('未知球车或洞号不匹配：'+p.id+'；请先在编辑器创建对应球车');const old=live.get(p.id);if(old&&Date.parse(p.timestamp)<Date.parse(old.timestamp))throw Error('拒绝乱序旧位置：'+p.id);if(Date.parse(p.timestamp)>Date.now()+60000)throw Error('位置时间超前');}parsed.forEach(p=>live.set(p.id,{...p,source:'GPS 输入（未现场验收）'}));render();return {updated:parsed.length};}
 window.GolfDevicePoints={updatePositions};
 $('applyTelemetry').onclick=()=>{try{stop();const result=updatePositions(JSON.parse($('telemetry').value));say('已更新 '+result.updated+' 台球车；动态位置仅保留本次会话，不新增永久参考点。');}catch(e){say(e.message);}};
 $('live').onclick=()=>{const f=state.features.find(f=>f.id===$('from').value&&f.properties.kind==='cart');if(!f){say('先选择一台球车作为起点');return;}if(!navigator.geolocation){say('浏览器不支持定位');return;}stop();if(watch!==null)navigator.geolocation.clearWatch(watch);watch=navigator.geolocation.watchPosition(p=>{try{updatePositions([{id:f.id,hole:f.properties.hole,coordinate:[p.coords.longitude,p.coords.latitude],timestamp:new Date(p.timestamp).toISOString(),accuracy_m:p.coords.accuracy}]);}catch(e){say(e.message);}},e=>{$('gpsStatus').textContent='定位未取得：'+e.message;},{enableHighAccuracy:true,maximumAge:0,timeout:15000});};
 $('stopGps').onclick=()=>{if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;$('gpsStatus').textContent='实时定位已停止；保留最后位置并显示时间/精度。';};
 const resetLive=document.createElement('button');resetLive.textContent='返回已保存位置';resetLive.id='resetLive';$('gpsStatus').after(resetLive);resetLive.onclick=()=>{stop();$('stopGps').onclick();live.clear();$('progress').value=0;$('gpsStatus').textContent='已返回保存的静态位置；模拟与实时位置均已清除。';render();};
 function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('export').onclick=()=>{const pkg={schema_version:'golf-point-workspace/1',course_id:'cn0000386',coordinate_system:'WGS84',coordinate_order:['longitude','latitude'],unit:'m',distance_type:'spherical_surface_estimate_not_route',field_verified:false,generated_at:new Date().toISOString(),warning:'未完成现场测绘验收。像素草稿不在地理 GeoJSON 内，动态 GPS 不写入此基线。',geojson:{type:'FeatureCollection',features:state.features.filter(f=>f.geometry)},holes:state.holes.map(h=>({hole:h.hole,registration:{controls:h.controls,checkpoints:h.checkpoints,model:G.fit(h.controls),field_verified:false},cart_route:state.features.find(f=>f.properties.hole===h.hole&&f.properties.kind==='cart_route')?.geometry?.coordinates||[]})),workspace:state};download('cn0000386-workspace.json',pkg);say('已导出 18 洞编辑包。像素草稿单独保留，未混入 GPS GeoJSON。');};
 $('import').onchange=async()=>{try{const file=$('import').files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('文件超过 20 MB');const data=JSON.parse(await file.text());let next;if(data.workspace){if(data.course_id!=='cn0000386'||data.coordinate_system!=='WGS84')throw Error('导入包球场或坐标系不匹配');next=validateState(data.workspace);}else if(data.type==='FeatureCollection'){if(data.course_id!=='cn0000386'||data.coordinate_system!=='WGS84')throw Error('独立 GeoJSON 须明确 course_id=cn0000386、coordinate_system=WGS84');next=structuredClone(state);for(const f of data.features){G.validateFeature(f);if(next.features.some(x=>x.id===f.id))throw Error('ID 已存在，未覆盖：'+f.id);next.features.push(f);}validateState(next);}else next=validateState(data);checkpoint();state=structuredClone(next);live.clear();chooseHole(hole);reconcile();commit();say('导入成功；如需恢复导入前状态，可点击“撤销上一步”。');}catch(e){say('导入未应用：'+e.message);}finally{$('import').value='';}};
 setInterval(metrics,10000);new ResizeObserver(()=>{real.invalidateSize();virtual.invalidateSize();}).observe($('maps'));
 chooseHole(1);
})();
