/* Single-page arbitrary point editing, registration and customer exchange. */
(() => {
  'use strict';
  const api = window.GolfPointEditor, P = window.HolePointWorkspace, R = window.HoleRegistration;
  if (!api || !P || !R) return;
  const app = document.getElementById('app');
  const panel = document.createElement('aside');
  panel.id = 'pointWorkspace';
  panel.setAttribute('aria-label', '任意点与 GPS 数据工作台');
  panel.innerHTML = `
    <header><small>WGS84 · 数据工作台</small><h2>任意点 · 多目标测距</h2>
    <label>当前球洞<select id="pwHole"></select></label></header>
    <nav aria-label="工作台功能"><button data-tab="points" class="active">标点测距</button><button data-tab="calibration">地图校准</button><button data-tab="exchange">设备数据</button></nav>
    <p id="pwNotice" role="status">正在读取本洞数据…</p>
    <section data-panel="points">
      <p class="pw-help">先放点，再选测距起点和目标。蓝点是球车，金点是参考点，可直接拖动。</p>
      <div class="pw-row"><label>点位名称<input id="pwName" placeholder="例如 球车 A / 落球点"></label><label>类型<select id="pwKind"><option value="reference">参考点</option><option value="cart">球车</option></select></label></div>
      <button id="pwPlace" class="pw-primary">＋ 在虚拟图放置新点</button>
      <button id="pwCancelPick" hidden>取消放点</button>
      <label>本洞已保存点<select id="pwSelected"></select></label>
      <div class="pw-row"><label>经度<input id="pwLng" inputmode="decimal"></label><label>纬度<input id="pwLat" inputmode="decimal"></label></div>
      <button id="pwSavePoint">保存名称 / WGS84 坐标</button>
      <p id="pwPointMeta" class="pw-help"></p>
      <details><summary>删除选中的自定义点</summary><button id="pwDeletePoint">删除该点（可撤销）</button><button id="pwUndoDelete" disabled>撤销删除</button></details>
      <hr><h3>测距</h3><label>从哪个点出发<select id="pwOrigin"></select></label>
      <label>目标所在球洞<select id="pwTargetHole"><option value="current">本洞</option><option value="all">全部 18 洞</option></select></label>
      <div id="pwTargets" class="pw-targets"></div><div id="pwDistances"></div>
      <p class="pw-help">距离为 WGS84 地表直线距离，不是沿球车道的行驶路程。不同洞的目标也可同时选择。</p>
    </section>
    <section data-panel="calibration" hidden>
      <p class="pw-help">图片不是测绘地图。先用相同地物建立“图上位置 ↔ 真实 WGS84 坐标”。至少 3 个不共线点，建议 5 个以上覆盖上下及左右，并另加独立检查点。</p>
      <label class="pw-check"><input id="pwMapToggle" type="checkbox">同页显示实景地图</label>
      <p class="pw-help">点击实景影像只能作为人工校准；现场 GPS / 测量数据更可靠。紫红虚线为数据边界，绿色区为控制点覆盖范围。</p>
      <button id="pwPickControl" class="pw-primary">① 在虚拟图选择对应位置</button>
      <p id="pwPending" class="pw-help">尚未选图上位置</p>
      <div class="pw-row"><label>实测经度<input id="pwControlLng" inputmode="decimal"></label><label>实测纬度<input id="pwControlLat" inputmode="decimal"></label></div>
      <label>坐标来源<select id="pwControlSource"><option value="wgs84_input">手工输入 WGS84</option><option value="gps_import">现场 GPS 采集</option><option value="survey">测量成果</option></select></label>
      <label>记录的 GPS 精度（米，未知留空）<input id="pwControlAccuracy" type="number" min="0" step="any"></label>
      <label class="pw-check"><input id="pwCheckpoint" type="checkbox">作为独立检查点，不参与拟合</label>
      <button id="pwAddControl">② 添加坐标对应</button>
      <p class="pw-help">或在右侧实景地图点击同一个地物，自动填写经纬度，再点②。</p>
      <div id="pwControls"></div><button id="pwSaveCalibration" class="pw-primary">③ 应用并保存本洞校准</button>
      <p class="pw-help">会重新计算“从虚拟图放置”的自定义点坐标；手工输入及 GPS 导入的坐标不会被改动。不会修改底图或原 Tee / 果岭数据。</p>
      <div id="pwQuality"></div>
    </section>
    <section data-panel="exchange" hidden>
      <h3>交给客户</h3><p class="pw-help">下载数据到本机，不会自动发送。包含稳定点 ID、WGS84 坐标、来源、边界、校准和检查误差。未现场验收的数据仍是测试数据。</p>
      <button id="pwExport" class="pw-primary">下载 18 洞点位与校准包</button>
      <button id="pwExportGeo">下载点位 GeoJSON</button>
      <hr><h3>用客户 GPS 坐标测试</h3>
      <p class="pw-help">先建立球车点，再使用它的完整 ID。支持 JSON / CSV；有错误则整批拒绝，不会覆盖一半。</p>
      <button id="pwExample">填入当前球车格式示例</button>
      <label>GPS 点位数据<textarea id="pwTelemetry" rows="8" placeholder='{"positions":[{"id":"完整点 ID","coordinate":[120.07,32.61]}]}'></textarea></label>
      <button id="pwImport">校验并更新球车位置</button>
      <p class="pw-help">这是手工导入测试，不是已经连接客户设备。系统集成可调用 window.GolfDevicePoints.updatePositions(positions)。</p>
    </section>`;
  document.getElementById('side').after(panel);
  const toolsToggle=document.createElement('button');toolsToggle.id='pwToolsToggle';toolsToggle.textContent='点位工具';toolsToggle.onclick=()=>app.classList.toggle('tools-expanded');document.querySelector('.virtual-head-actions').prepend(toolsToggle);
  const toolsClose=document.createElement('button');toolsClose.id='pwToolsClose';toolsClose.textContent='收起工具 · 查看地图';toolsClose.onclick=()=>app.classList.remove('tools-expanded');panel.prepend(toolsClose);
  const closeMobileTools=()=>{if(innerWidth<=700)app.classList.remove('tools-expanded');};
  const el = id => panel.querySelector('#' + id);
  const state = { tab: 'points', hole: null, selected: '', origin: '', targets: new Set(), pending: null, picking: false, drafts: new Map(), deleted: null };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label = p => '第 ' + p.hole + ' 洞 · ' + p.name;
  const status = text => { el('pwNotice').textContent = text; };
  const catalog = () => P.buildCatalog(api.course(), {courseId: api.courseId()});
  const chosen = () => api.hole()?.device_points?.find(p => String(p.id) === state.selected);
  const image = () => api.payload()?.image;
  const inImage = p => p && image() && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= image().width && p.y <= image().height;
  const xy = coordinate => {
    const pixel = api.calibration()?.geoToPixel(coordinate);
    return inImage(pixel) ? pixel : null;
  };
  function defaultControls() {
    const h = api.hole(), payload = api.payload();
    if (!h || !payload) return [];
    const colors = {'黑':'black','金':'gold','蓝':'blue','白':'white','红':'red'};
    const controls = Object.entries(payload.tees || {}).flatMap(([key,pixel]) => h.tees?.[colors[key]] ? [{id:'default-' + key,pixel,coordinate:h.tees[colors[key]],source:'estimated_default'}] : []);
    if (payload.flag && h.flag) controls.push({id:'default-flag',pixel:payload.flag,coordinate:h.flag,source:'estimated_default'});
    return controls;
  }
  function model() {
    const h = api.hole();
    return h?.registration?.controls?.length ? R.fit(h.registration.controls,{checkpoints:h.registration.checkpoints || []}) : R.fit(defaultControls());
  }
  function draft() {
    const n = api.hole()?.n;
    if (!state.drafts.has(n)) state.drafts.set(n, structuredClone({controls:api.hole()?.registration?.controls || [],checkpoints:api.hole()?.registration?.checkpoints || []}));
    return state.drafts.get(n);
  }
  function selectOptions(select, points, value, placeholder) {
    select.innerHTML = (placeholder ? '<option value="">' + esc(placeholder) + '</option>' : '') + points.map(p => '<option value="' + esc(p.id) + '">' + esc(p.text || label(p)) + '</option>').join('');
    select.value = points.some(p => p.id === value) ? value : (placeholder ? '' : points[0]?.id || '');
  }
  function loadPointFields() {
    const p = chosen();
    el('pwLng').value = p?.coordinate?.[0] ?? '';
    el('pwLat').value = p?.coordinate?.[1] ?? '';
    if (p) {el('pwName').value=p.name;el('pwKind').value=p.kind || 'reference';}
    el('pwPointMeta').textContent = p ? 'ID: ' + P.stableId(api.courseId(),api.hole().n,'device',p.id) + ' · 来源 ' + (p.source || '未记录') + ' · 精度 ' + (p.accuracy_m == null ? '未知' : p.accuracy_m + 'm') + ' · ' + ({inside:'数据边界内',outside:'数据边界外',boundary:'边界上'}[P.rangeStatus(p.coordinate,api.hole())] || '边界未知') : '点位默认保存在当前浏览器草稿；交付前请导出。';
    el('pwSavePoint').disabled = !p;
    el('pwDeletePoint').disabled = !p;
  }
  function renderTargets() {
    const points = catalog().points, origin = points.find(p => p.id === state.origin);
    const holeFilter = el('pwTargetHole').value;
    const targets = points.filter(p => p.id !== state.origin && (state.targets.has(p.id) || holeFilter === 'all' || p.hole === Number(holeFilter === 'current' ? api.hole()?.n : holeFilter)));
    el('pwTargets').innerHTML = targets.map(p => '<label class="pw-check"><input type="checkbox" data-target="' + esc(p.id) + '" ' + (state.targets.has(p.id) ? 'checked' : '') + '>' + esc(label(p)) + '</label>').join('');
    const measurements = origin ? P.measure(origin, points.filter(p => state.targets.has(p.id)),{course:api.course()}).results : [];
    el('pwDistances').innerHTML = measurements.length ? measurements.map(m => '<div class="pw-distance"><span>第 ' + m.hole + ' 洞 · ' + esc(m.name) + '</span><strong>' + Number(m.distance_m).toFixed(1) + ' m</strong></div>').join('') : '<p class="pw-help">选择起点，再勾选多个目标。</p>';
    paint();
  }
  function renderQuality() {
    const m = model(), d = m.diagnostics, custom = !!api.hole()?.registration?.controls?.length;
    el('pwQuality').innerHTML = '<h3>' + (custom ? '本洞已保存校准' : '默认对应 · 仅估算') + '</h3><p>' + (m.valid ? '控制点拟合 RMS ' + d.rms_m.toFixed(2) + ' m；最大 ' + d.max_m.toFixed(2) + ' m。' : '无法可靠换算：控制点不足或接近共线，请补充两侧控制点。') + '</p><p>' + (d.independent.count ? '独立检查 ' + d.independent.count + ' 点 · RMS ' + d.independent.rms_m.toFixed(2) + ' m' : '没有独立检查点，不能据此认定现场精度。') + '</p><p class="pw-help">绿色覆盖范围以外属于外推估算。拟合误差不是 GPS 精度，也不能证明整张图没有局部变形。</p>';
  }
  function renderControls() {
    const d = draft();
    el('pwControls').innerHTML = ['controls','checkpoints'].flatMap(type => d[type].map((p,i) => '<div class="pw-control"><span>' + (type === 'controls' ? '控制点 ' : '检查点 ') + (i+1) + ' · ' + esc(p.source) + '<small>' + p.coordinate.map(n=>Number(n).toFixed(7)).join(', ') + '</small></span><button data-remove-control="' + type + ':' + i + '" aria-label="移除' + (type === 'controls' ? '控制点' : '检查点') + (i+1) + '">×</button></div>')).join('');
    renderQuality();
  }
  function paint() {
    if (!api.editing() || api.preview() || !api.calibration()) return;
    const h=api.hole(), points=catalog().points, m=model();
    const overlays=points.filter(p=>p.type==='device' && p.hole===h.n).flatMap(p=>{
      const pixel=xy(p.coordinate);return pixel?[{id:p.local_id,name:p.name,label:p.name,kind:p.kind,x:pixel.x,y:pixel.y,pixel,workspace:true}]:[];
    });
    if (h.cart_position) {const p=xy(h.cart_position);if(p)overlays.push({id:'legacy-cart',label:'球车（旧模拟点）',name:'球车（旧模拟点）',kind:'cart',x:p.x,y:p.y,pixel:p});}
    if(state.tab==='calibration') {
      for(const p of [...draft().controls,...draft().checkpoints]) overlays.push({id:p.id,name:p.id,label:p.id,kind:'control',x:p.pixel.x,y:p.pixel.y,pixel:p.pixel});
      if(state.pending)overlays.push({id:'pending',name:'待对应',label:'待对应',kind:'control',...state.pending,pixel:state.pending});
    }
    const origin=points.find(p=>p.id===state.origin), links=[];
    if(origin?.hole===h.n)for(const target of points.filter(p=>state.targets.has(p.id)&&p.hole===h.n)){
      const a=xy(origin.coordinate),b=xy(target.coordinate);
      if(a&&b)links.push({a,b,label:P.distanceMeters(origin,target).toFixed(1)+' m'});
    }
    const perimeter=Array.isArray(h.holeperim?.[0]?.[0])?h.holeperim[0]:h.holeperim || [];
    api.post('set-workspace-overlays',{points:overlays.map(p=>({...p,point:p.pixel})),links,guide:state.tab==='calibration',boundary:perimeter.map(geo=>api.calibration().geoToPixel(geo)).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)),hull:m.valid?m.hull:[]});
    api.mapPoints(points.filter(p=>p.hole===h.n && R.isWgs84(p.coordinate)));
  }
  function refresh() {
    const h=api.hole(); if(!h)return;
    app.classList.toggle('point-workspace-open',api.editing());
    if(!api.editing()){api.showMap(false);return;}
    if(state.hole!==h.n){
      state.hole=h.n;state.selected='';state.origin='';state.targets=new Set([P.stableId(api.courseId(),h.n,'green','flag')]);state.pending=null;state.picking=false;
      status('先放置任意点，再选择测距目标。默认图坐标仅为估算，准确交付需地图校准。');
    }
    selectOptions(el('pwHole'),api.course().holes.map(h=>({id:String(h.n),text:'第 '+h.n+' 洞'})),String(h.n));
    const points=catalog().points;
    selectOptions(el('pwSelected'),(h.device_points||[]).filter(p=>p.id).map(p=>({id:String(p.id),text:p.name})),state.selected,'选择自定义点');state.selected=el('pwSelected').value;
    selectOptions(el('pwOrigin'),points,state.origin);state.origin=el('pwOrigin').value;
    loadPointFields();renderTargets();renderControls();
  }
  function setTab(tab) {
    state.tab=tab;
    if(tab==='calibration')api.openVirtual();
    panel.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    panel.querySelectorAll('[data-panel]').forEach(s=>s.hidden=s.dataset.panel!==tab);
    api.showMap(tab==='calibration' && el('pwMapToggle').checked);
    renderControls();paint();
  }
  function cancelPick(){state.picking=false;state.pending=null;api.post('set-placement-mode',{mode:null});el('pwCancelPick').hidden=true;status('已取消放点');paint();}
  function saveVirtualPoint(pixel,id) {
    if(!inImage(pixel)){status('位置在图片范围外，未保存。请在图内放点。');return;}
    const m=model();
    if(!m.valid){status('本洞控制点无法可靠换算。请先到“地图校准”补充不共线的控制点，未生成坐标。');return;}
    const coordinate=api.calibration()?.pixelToGeo(pixel);
    if(!R.isWgs84(coordinate)){status('未获得有效 WGS84 坐标，未保存。');return;}
    const h=api.hole(),existing=h.device_points?.find(p=>p.id===id);
    const normalized=P.normalizePoint({...existing,id:id||crypto.randomUUID(),name:existing?.name||el('pwName').value.trim()||(el('pwKind').value==='cart'?'球车':'参考点')+' '+((h.device_points?.length||0)+1),kind:existing?.kind||el('pwKind').value,coordinate,pixel,source:'virtual_pick',accuracy_m:null,updated_at:new Date().toISOString(),registration_version:h.registration?.version||'default',registration_quality:h.registration?'calibrated_unverified':'estimated'},{hole:h.n});
    if(normalized.errors.length){status(normalized.errors.map(e=>e.message).join('；'));return;}
    h.device_points=h.device_points||[];
    if(existing)h.device_points[h.device_points.indexOf(existing)]=normalized.point;else h.device_points.push(normalized.point);
    state.selected=normalized.point.id;state.origin=P.stableId(api.courseId(),h.n,'device',state.selected);
    api.save(h);loadPointFields();renderTargets();
    const covered=R.containsPixel(m,pixel), inside=P.rangeStatus(coordinate,h);
    status('已保存 '+normalized.point.name+'。'+(h.registration?'配准未现场验收。':'默认对应：坐标仅估算。')+(!covered?' 此点在控制点覆盖范围外，属于外推。':'')+(inside==='outside'?' 此点在本洞数据边界外。':''));
  }
  function addControl() {
    const coordinate=P.coordinate([el('pwControlLng').value,el('pwControlLat').value]),raw=el('pwControlAccuracy').value;
    if(!state.pending || !coordinate || (raw!==''&&(!Number.isFinite(Number(raw))||Number(raw)<0))){status('请先选图片位置，再填写有效经纬度；精度未知请留空。');return;}
    const d=draft(),type=el('pwCheckpoint').checked?'checkpoints':'controls';
    d[type].push({id:(type==='controls'?'C':'K')+'-'+crypto.randomUUID().slice(0,8),pixel:{...state.pending},coordinate,source:state.mapPicked?'map_pick':el('pwControlSource').value,accuracy_m:raw===''?null:Number(raw)});
    state.pending=null;state.mapPicked=false;el('pwPending').textContent='对应点已添加，可继续选下一个';renderControls();paint();status('对应点暂存在校准草稿，请点击③应用并保存。');
  }
  function saveCalibration(){
    const d=draft(),m=R.fit(d.controls,{checkpoints:d.checkpoints});
    if(!m.valid){status('不能保存：至少 3 个分布开、不共线的有效控制点；请补充球道左右两侧。');return;}
    const h=api.hole(),version=crypto.randomUUID();
    h.registration={...structuredClone(d),model:m,quality:m.quality,version,image:image(),updated_at:new Date().toISOString(),field_verified:false};
    h.device_points=(h.device_points||[]).map(p=>p.source==='virtual_pick'&&p.pixel?{...p,coordinate:R.pixelToGeo(m,p.pixel,{allowExtrapolation:true}),registration_version:version,registration_quality:'calibrated_unverified',accuracy_m:null}:p);
    api.refreshCalibration();api.save(h);renderControls();paint();
    status('校准已保存，图上放置点坐标已更新。训练 RMS '+m.diagnostics.rms_m.toFixed(2)+' m；仍需独立检查及现场验收。');
  }
  function exportPackage() {
    return {schema_version:'golf-point-workspace/1',course_id:api.courseId(),coordinate_system:'WGS84',coordinate_order:['longitude','latitude'],unit:'m',distance_type:'surface_geodesic_not_route',field_verified:false,generated_at:new Date().toISOString(),warning:'默认图像配准和人工校准均不等于实测准确；请检查独立点并现场验收。',geojson:P.exportGeoJSON(api.course(),{courseId:api.courseId()}),holes:api.course().holes.map(h=>({hole:h.n,registration:h.registration||null,registration_status:h.registration?'calibrated_unverified':'estimated_default',cart_route:h.cart_route||[]}))};
  }
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已生成下载文件；未发送给第三方。');}
  function updatePositions(positions) {
    const parsed=P.parseTelemetry(JSON.stringify({positions}),'json'),points=catalog().points,updates=[],errors=[...parsed.errors];
    if(!parsed.positions.length&&!errors.length)errors.push({message:'位置数组为空，未更新'});
    parsed.positions.forEach(p=>{
      const target=points.find(t=>t.id===p.id && t.type==='device' && t.kind==='cart');
      if(!target){errors.push({message:'未知或非球车 ID：'+p.id});return;}
      const h=api.course().holes.find(h=>h.n===target.hole),existing=h.device_points.find(t=>t.id===target.local_id);
      if(existing.updated_at && p.timestamp && Date.parse(p.timestamp)<Date.parse(existing.updated_at)){errors.push({message:'拒绝旧时间位置：'+p.id});return;}
      updates.push({h,existing,p});
    });
    if(errors.length)return {ok:false,errors};
    const changed=new Set();
    updates.forEach(({h,existing,p})=>{Object.assign(existing,{coordinate:p.coordinate,source:'gps_import',pixel:null,accuracy_m:p.accuracy_m,updated_at:p.timestamp||new Date().toISOString(),registration_quality:'gps_coordinate_image_unverified'});changed.add(h);});
    changed.forEach(h=>api.save(h));renderTargets();
    return {ok:true,updated:updates.length,measurements:catalog().points.length,warning:'GPS 坐标已更新；图片对应仍取决于校准质量'};
  }
  window.GolfDevicePoints={updatePositions,exportPackage,catalog:()=>catalog(),measure:(originId,targetIds)=>{const p=catalog().points;return P.measure(p.find(x=>x.id===originId),p.filter(x=>targetIds.includes(x.id)),{course:api.course()});}};
  panel.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  for(const h of Array.from({length:18},(_,i)=>i+1)){const o=new Option('第 '+h+' 洞',h);el('pwTargetHole').add(o);}
  el('pwHole').onchange=()=>api.selectHole(el('pwHole').value);
  el('pwPlace').onclick=()=>{api.openVirtual();state.picking=true;api.post('set-placement-mode',{mode:'workspace-point'});el('pwCancelPick').hidden=false;status('请在虚拟图上点击任意位置。保存坐标前会检查范围和校准。');};
  el('pwCancelPick').onclick=cancelPick;
  el('pwSelected').onchange=()=>{state.selected=el('pwSelected').value;loadPointFields();if(state.selected){state.origin=P.stableId(api.courseId(),api.hole().n,'device',state.selected);el('pwOrigin').value=state.origin;}renderTargets();};
  el('pwSavePoint').onclick=()=>{
    const p=chosen();if(!p)return;
    const coordinate=P.coordinate([el('pwLng').value,el('pwLat').value]);
    const coordChanged=coordinate && coordinate.some((v,i)=>v!==p.coordinate[i]);
    const value=P.normalizePoint({...p,name:el('pwName').value,kind:el('pwKind').value,coordinate,updated_at:new Date().toISOString(),...(coordChanged?{pixel:null,source:'wgs84_input',accuracy_m:null}: {})},{hole:api.hole().n});
    if(value.errors.length){status(value.errors.map(e=>e.message).join('；'));return;}
    Object.assign(p,value.point);api.save(api.hole());status('已保存点位。'+(P.rangeStatus(p.coordinate,api.hole())==='outside'?'坐标在本洞边界外，请核对。':'WGS84 坐标已保留；未自动认定实测精度。'));
  };
  el('pwDeletePoint').onclick=()=>{const p=chosen();if(!p)return;const h=api.hole();state.deleted={h,point:structuredClone(p),index:h.device_points.indexOf(p)};h.device_points.splice(state.deleted.index,1);state.selected='';el('pwUndoDelete').disabled=false;api.save(h);status('已删除选中的自定义点；可点“撤销删除”恢复。');};
  el('pwUndoDelete').onclick=()=>{if(!state.deleted)return;const {h,point,index}=state.deleted;h.device_points.splice(index,0,point);state.deleted=null;el('pwUndoDelete').disabled=true;api.save(h);status('已恢复删除的点。');};
  el('pwOrigin').onchange=()=>{state.origin=el('pwOrigin').value;state.targets.delete(state.origin);renderTargets();};
  el('pwTargetHole').onchange=renderTargets;
  el('pwTargets').onchange=e=>{const id=e.target.dataset.target;if(!id)return;e.target.checked?state.targets.add(id):state.targets.delete(id);renderTargets();};
  el('pwMapToggle').onchange=()=>api.showMap(el('pwMapToggle').checked);
  el('pwPickControl').onclick=()=>{api.openVirtual();api.post('set-placement-mode',{mode:'control-point'});status('在虚拟图选位置，再在实景地图点同一地物，或输入它的实测坐标。');};
  el('pwAddControl').onclick=addControl;
  el('pwSaveCalibration').onclick=saveCalibration;
  el('pwControls').onclick=e=>{const spec=e.target.dataset.removeControl;if(!spec)return;const [type,index]=spec.split(':');draft()[type].splice(Number(index),1);renderControls();paint();};
  ['pwControlLng','pwControlLat'].forEach(id=>el(id).addEventListener('input',()=>state.mapPicked=false));
  el('pwExport').onclick=()=>download(exportPackage(),api.courseId()+'-gps-test-package.json');
  el('pwExportGeo').onclick=()=>download(P.exportGeoJSON(api.course(),{courseId:api.courseId()}),api.courseId()+'-points.geojson');
  el('pwExample').onclick=()=>{
    const carts=catalog().points.filter(p=>p.type==='device'&&p.kind==='cart');
    if(!carts.length){status('请先在“标点测距”选择类型“球车”并放置至少一个点。');return;}
    el('pwTelemetry').value=JSON.stringify({positions:carts.slice(0,2).map(p=>({id:p.id,coordinate:p.coordinate,accuracy_m:null,timestamp:new Date().toISOString()}))},null,2);
    status('这是格式示例，尚未导入，也不是现场 GPS 数据。');
  };
  el('pwImport').onclick=()=>{
    const parsed=P.parseTelemetry(el('pwTelemetry').value,'auto');
    if(parsed.errors.length){status('未导入：'+parsed.errors.map(e=>e.message).join('；'));return;}
    const result=updatePositions(parsed.positions);status(result.ok?'已更新 '+result.updated+' 辆球车，测距已重新计算。'+result.warning:'未导入：'+result.errors.map(e=>e.message).join('；'));
  };
  api.listenMap(coordinate=>{
    if(state.tab!=='calibration'||!state.pending||!el('pwMapToggle').checked)return;
    el('pwControlLng').value=coordinate[0].toFixed(8);el('pwControlLat').value=coordinate[1].toFixed(8);state.mapPicked=true;
    status('实景地图位置已填写；请核对后点击②添加。影像取点未必具有实测精度。');
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || event.source!==document.getElementById('virtualFrame').contentWindow || !api.editing() || api.preview())return;
    const msg=event.data;
    if(!msg||msg.hole!==api.hole()?.n)return;
    const data=msg.overlays||{};
    if(msg.type==='workspace-point-picked'){saveVirtualPoint(data.point);state.picking=false;el('pwCancelPick').hidden=true;}
    if(msg.type==='workspace-point-moved')saveVirtualPoint(data.point,data.id);
    if(msg.type==='workspace-point-selected'){state.selected=data.id;el('pwSelected').value=data.id;loadPointFields();}
    if(msg.type==='control-point-picked'){
      if(!inImage(data.point)){status('对应位置必须在图内。');return;}
      state.pending=data.point;state.mapPicked=false;el('pwPending').textContent='图片位置 '+data.point.x.toFixed(1)+', '+data.point.y.toFixed(1)+' → 请填实测坐标';paint();
    }
  });
  window.addEventListener('golf-point-state',refresh);
  el('pwPlace').addEventListener('click',closeMobileTools);
  el('pwPickControl').addEventListener('click',closeMobileTools);
  el('pwMapToggle').addEventListener('change',closeMobileTools);
  window.addEventListener('golf-point-overlay',paint);
  refresh();
})();
