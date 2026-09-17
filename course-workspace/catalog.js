'use strict';
const $=id=>document.getElementById(id);
const courses=[];
const map=L.map('course-map').setView([32.15,119.8],9);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
let selected=null,hole=1,picking=false,sourceCourse=null,selectionVersion=0;
let resumeID=null;
const resumeBox=document.createElement('div');resumeBox.hidden=true;resumeBox.innerHTML='<label>本机已有项目（不会覆盖）<select id="resume-project"></select></label><p>优先继续最近保存的项目。另建副本才会重新读取原站；已有点位和图片保留。</p><button id="source-new-copy">另建独立副本…</button>';$('edit').before(resumeBox);
$('resume-project').onchange=()=>{resumeID=$('resume-project').value;const row=GreenBookSource.existing(selected.id).find(r=>r.id===resumeID);if(row)holeButtons(row.hole_numbers);};
$('source-new-copy').onclick=async()=>{if(!selected||selected.source!=='greenbook')return;const version=selectionVersion,c=selected;$('source-new-copy').disabled=true;try{const data=await GreenBookSource.course(c);if(version!==selectionVersion)return;const id=GreenBookSource.importLocal(data,{forceNew:true});location.href='../../holemap-editor/index.html?'+new URLSearchParams({gb:id,hole:String(data.holes[0].n),workspace:'1'});}catch(e){if(version===selectionVersion)$('quality').textContent='无法新建副本：'+e.message+'；仍可继续已有项目。';}finally{$('source-new-copy').disabled=false;}};
function holeButtons(numbers){hole=numbers[0];$('holes').replaceChildren();for(const n of numbers){const b=document.createElement('button');b.textContent=n;b.setAttribute('aria-pressed',String(n===hole));b.onclick=()=>{hole=n;for(const x of $('holes').children)x.setAttribute('aria-pressed',String(+x.textContent===n));};$('holes').append(b);}}
async function open(c){
  const version=++selectionVersion;selected=c;sourceCourse=null;resumeID=null;resumeBox.hidden=true;$('name').textContent=c.name;$('quality').textContent=c.status;$('detail').hidden=false;$('holes').replaceChildren();
  if(c.center)map.setView([c.center[1],c.center[0]],16);
  $('edit').disabled=c.source==='greenbook';$('edit').textContent=c.source==='greenbook'?'读取原站球洞数据…':'编辑球洞图 →';
  if(c.source!=='greenbook'){holeButtons(c.hole_numbers||Array.from({length:c.holes},(_,i)=>i+1));return;}
  const saved=GreenBookSource.existing(c.id);if(saved.length){resumeID=saved[0].id;resumeBox.hidden=false;$('resume-project').replaceChildren(...saved.map(r=>new Option(r.name+' · 版本 '+r.revision+' · '+r.updated_at,r.id)));holeButtons(saved[0].hole_numbers);$('quality').textContent='已找到此球场的 '+saved.length+' 个本机项目。默认继续最近保存的版本；不重新导入、不覆盖，原站离线也可继续已有编辑。';$('edit').disabled=false;$('edit').textContent='继续已有球场项目 →';return;}
  try{const data=await GreenBookSource.course(c);if(version!==selectionVersion)return;sourceCourse=data;map.setView([data.center[1],data.center[0]],data.zoom||16);holeButtons(data.holes.map(h=>h.n));const info=data.source_import;
    $('quality').textContent='来源：原网站 '+c.id+' · 登记 '+(info.declared_holes||'未知')+' 洞 · 实际返回 '+info.returned_holes+' 洞，其中 '+info.holes_with_geometry+' 洞有地理要素。'+(info.returned_holes===0?' 当前只有球场位置和卫星底图；接入后提供空白洞位，PAR 和逐洞划分待建立。':' 将保留原有坐标、路线及扩展字段；未包含的洞不会伪造。')+' 接入只建立本机副本，不修改原站。';
    $('edit').disabled=false;$('edit').textContent='接入为独立项目并编辑 →';
  }catch(e){if(version!==selectionVersion)return;$('quality').textContent=e.message;$('edit').textContent='读取失败，请重新选择球场';}
}
function list(){const q=$('query').value.trim().toLowerCase();$('courses').replaceChildren();for(const c of courses.filter(c=>c.name.toLowerCase().includes(q)||c.id.includes(q))){const b=document.createElement('button');const name=document.createElement('strong');name.textContent=c.name;const desc=document.createElement('small');desc.textContent=c.status;b.append(name,desc);b.onclick=()=>open(c);$('courses').append(b);}if(!$('courses').children.length)$('courses').textContent='本机尚无匹配项目，可从上方原站结果接入。';}
async function init(){try{courses.push(...await CourseStore.registry('../../'));for(const c of CourseStore.custom()){const i=courses.findIndex(x=>x.id===c.id);if(i>=0)courses[i]=c;else courses.push(c);}for(const c of courses){const label=document.createElement('span');label.textContent=c.name;L.marker([c.center[1],c.center[0]],{icon:L.divIcon({className:'course-pin',html:'⚑',iconSize:[36,36]})}).addTo(map).bindTooltip(label).on('click',()=>open(c));}list();}catch(e){$('status').textContent=e.message;}}
let sourceRows=[],sourceVersion=0,sourceTimer;const sourceMarkers=L.layerGroup().addTo(map);
function showSources(){const q=$('query').value.trim().toLowerCase();$('source-results').replaceChildren();const rows=sourceRows.filter(c=>[c.name,c.name_local,c.id,c.city].some(v=>v.toLowerCase().includes(q)));for(const c of rows){const b=document.createElement('button');const name=document.createElement('strong'),meta=document.createElement('small');name.textContent=c.name;meta.textContent='原站 · '+c.id+' · '+(c.holes||'未知')+' 洞';b.append(name,meta);b.onclick=()=>open(c);$('source-results').append(b);}return rows.length;}
async function searchSource(){const version=++sourceVersion,q=$('query').value.trim();$('source-state').textContent='正在检索原站球场库…';try{const rows=await GreenBookSource.search(q);if(version!==sourceVersion)return;sourceRows=rows;const count=showSources();sourceMarkers.clearLayers();for(const c of rows.filter(x=>x.center)){const label=document.createElement('span');label.textContent=c.name;L.marker([c.center[1],c.center[0]],{icon:L.divIcon({className:'course-pin',html:'⚑',iconSize:[28,28]})}).addTo(sourceMarkers).bindTooltip(label).on('click',()=>open(c));}$('source-state').textContent='原站返回 '+count+' 个球场'+(rows.length>=500?'（本页上限 500，请输入关键词缩小范围）':'')+'。点击读取位置和已发布球洞数据。';}catch(e){if(version===sourceVersion)$('source-state').textContent=e.message;}}
$('query').oninput=()=>{++sourceVersion;list();showSources();$('search-results').replaceChildren();clearTimeout(sourceTimer);sourceTimer=setTimeout(searchSource,350);};
$('query').onkeydown=e=>{if(e.key==='Enter'){clearTimeout(sourceTimer);searchSource();}};
$('search-source').onclick=()=>{clearTimeout(sourceTimer);searchSource();};
$('close').onclick=()=>{++selectionVersion;$('detail').hidden=true;};
$('edit').onclick=()=>{try{if(!selected)return;let id=selected.id;if(selected.source==='greenbook'){if(resumeID)id=resumeID;else{if(!sourceCourse)throw Error('请等待原站数据读取完成');id=GreenBookSource.importLocal(sourceCourse);}}const url=new URL('../../holemap-editor/index.html',location.href);url.search=new URLSearchParams({gb:id,hole:String(hole),workspace:'1'});location.href=url.href;}catch(e){$('quality').textContent='接入失败：'+e.message;}};
$('pick').onclick=()=>{picking=true;$('status').textContent='请点击地图确定场地参考位置（不是逐洞测量坐标）。';};
map.on('click',e=>{if(!picking)return;picking=false;$('lng').value=e.latlng.lng.toFixed(7);$('lat').value=e.latlng.lat.toFixed(7);$('status').textContent='场地参考点已填写，请确认名称后建立。';});
$('create').onclick=()=>{try{const name=$('newname').value.trim();if(!name||!$('lng').value||!$('lat').value)throw Error('请填写球场名和经纬度');const id='local-'+crypto.randomUUID();CourseStore.register(id,CourseStore.blank(name,[+$('lng').value,+$('lat').value],+$('hole-count').value));location.href='../../holemap-editor/index.html?'+new URLSearchParams({gb:id,workspace:'1'});}catch(e){$('status').textContent=e.message;}};
async function importData(text){if(text.length>CourseProjects.MAX_PACKAGE)throw Error('项目包过大');const data=JSON.parse(text);let id;if(data.format)id=await CourseProjects.importPack(data);else{const c=data.type==='FeatureCollection'?CourseProjects.fromGeoJSON(data):CourseStore.validate(data);id='local-'+crypto.randomUUID();CourseStore.register(id,c);}location.href='../../holemap-editor/index.html?'+new URLSearchParams({gb:id,workspace:'1'});}
$('import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>CourseProjects.MAX_PACKAGE)throw Error('文件超过 256 MB');await importData(await f.text());}catch(e){$('status').textContent=e.message;}};
$('import-text-button').onclick=async()=>{try{await importData($('import-text').value);}catch(e){$('status').textContent=e.message;}};
init();searchSource();
let lastSearch=0;const searchCache=new Map();
$('search-world').onclick=async()=>{
  const q=$('query').value.trim();if(q.length<2){$('status').textContent='请输入球场名称和城市，提高定位准确性。';return;}
  if(Date.now()-lastSearch<2000)return;lastSearch=Date.now();$('search-world').disabled=true;
  try{let rows=searchCache.get(q);if(!rows){const url=new URL('https://nominatim.openstreetmap.org/search');url.search=new URLSearchParams({q,format:'jsonv2',limit:'5'});const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('在线查询暂不可用（'+r.status+'）');rows=await r.json();searchCache.set(q,rows);}
    $('search-results').replaceChildren();for(const r of rows){const coord=[Number(r.lon),Number(r.lat)];if(!CourseStore.valid(coord))continue;const b=document.createElement('button');b.textContent=r.display_name;b.style.cssText='width:100%;text-align:left;margin-top:8px';b.onclick=()=>{map.setView([coord[1],coord[0]],16);$('newname').value=q;$('lng').value=coord[0];$('lat').value=coord[1];$('newname').closest('details').open=true;$('status').textContent='已定位候选场地。请核对名称与地图，再建立球场；不会自动生成未核验的洞号和路线。';};$('search-results').append(b);}
    $('status').textContent=rows.length?'选择一个定位结果核对场地。来源 © OpenStreetMap contributors。':'未检索到该名称。请补充城市，或在地图上选择位置。';
  }catch(e){$('status').textContent=e.message+'；本机球场与已有编辑仍可使用。';}finally{$('search-world').disabled=false;}
};
