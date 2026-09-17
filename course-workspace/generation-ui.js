/* Explicit source review before any project mutation. */
function createGenerationUI(host,ctx){
  const G=CourseGenerator,R=CourseRecognition;
  const box=document.createElement('section');box.className='workspace-tools generation-start';
  box.innerHTML='<h2>生成虚拟图与 GPS 数据</h2><p>① 读取地图要素 → ② 确认球场与洞号 → ③ 生成可编辑地图和参考点</p><button class="wide" id="generate-map-data">读取公开地图并生成…</button><div class="row"><button id="generate-view">查看本洞矢量图</button><button id="generate-download">下载本洞 SVG</button></div><button class="wide" id="generate-gps">下载全场 GPS 点位</button><p id="generation-summary" role="status">未读取公开地图。已有球洞要素也可直接显示和导出。</p><details><summary>没有地图要素 / 想制作高清图？</summary><p>在实景图上描绘球道、果岭、Tee、沙坑和车道，坐标随节点保存。矢量图随数据更新。高清美术图片需通过“本洞图片 / 配准”绑定并校准；本工具不会把想象出来的地形当成真实 GPS。</p><button id="generate-draw">在实景图绘制球道</button></details>';
  host.prepend(box);
  const exportPanel=document.createElement('div');exportPanel.id='generation-export';box.append(exportPanel);
  const drawer=document.createElement('section');drawer.className='generation-review';drawer.hidden=true;
  drawer.innerHTML='<header><strong>整场地图候选 · 生成前确认</strong><button id="generation-close">关闭</button></header><p id="generation-source"></p><label>确认目标球场边界 / 本次处理选区<select id="generation-site"></select></label><p id="generation-info" role="status"></p><div id="generation-rows"></div><p>参考点来自区域几何推导，并非实测 Tee 或今日旗位。源数据遗漏和错标需要编辑核对；只导入勾选项。</p><button id="generation-apply">确认归属，生成矢量图 + GPS 参考点</button><p id="generation-error" role="status"></p><a id="generation-osm-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a>';
  document.body.append(drawer);
  const $=id=>document.getElementById(id);let inventory=null,preview=null,busy=false,applying=false,rows=[],plan=null,reviewOwner=null,reportURL=null;
  const owner=()=>JSON.stringify([ctx.course().project_id||ctx.course().slug,ctx.course().center,ctx.course().holes.map(h=>h.n)]);
  const recognition=document.createElement('section');recognition.className='recognition-tools';
  recognition.innerHTML='<h3>整场分析 · 逐洞归属</h3><p>已有坐标优先。根据来源洞号和已编号中线提出候选；歧义项留待核对。当前不是卫星 AI 全自动识别。</p><button id="recognition-audit" class="wide">检查当前全场缺失项</button><pre id="recognition-audit-report" role="status"></pre><details><summary>接入影像识别 / 测绘候选 GeoJSON</summary><p>仅在本机读取。需要 WGS84、来源信息、球场边界和地物类型；未知类型、带孔面和错误坐标系不自动修补。不会把识别置信度当成米级精度。</p><label>候选文件（最多 5 MB）<input id="recognition-file" type="file" accept=".json,.geojson,application/json"></label><label>或粘贴候选 GeoJSON<textarea id="recognition-input" aria-label="整场候选 GeoJSON"></textarea></label><button id="recognition-import">读取候选并分析归属</button><p>格式：FeatureCollection，coordinate_system 为 WGS84，source 包含 name / method。每个 Feature 需要 id；properties.kind 为 course、hole、fairway、green、tee、bunker、water 或 cartpath 等；properties.hole 可留空。course 为闭合球场边界，hole 为击球中线，不是车道。</p></details>';
  box.append(recognition);
  const analysis=document.createElement('section');analysis.className='recognition-analysis';
  analysis.innerHTML='<button id="recognition-analyse">重新分析归属（重置未提交勾选）</button><p id="recognition-plan" role="status"></p><button id="recognition-report">下载归属候选报告</button>';
  $('generation-rows').before(analysis);
  $('recognition-audit').onclick=()=>{if(!ctx.sync())return;$('recognition-audit-report').textContent=R.assess(ctx.course()).map(h=>'第 '+h.n+' 洞：'+(h.missing.length?'缺少 '+h.missing.join('、'):'要素类别齐全，仍需核对轮廓与洞号')+'；'+(h.has_field_report?'有现场检查报告，非全场认证':'无现场检查报告')).join('\n');};
  $('recognition-report').onclick=()=>{if(!plan)return;if(reportURL)URL.revokeObjectURL(reportURL);reportURL=URL.createObjectURL(new Blob([JSON.stringify({...plan,course_name:ctx.course().name,source:inventory.source,notice:'归属候选报告，不是实测精度报告；未提交的人工选择不在报告内'},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=reportURL;a.download='course-recognition-plan.json';a.textContent='下载归属候选报告';exportPanel.replaceChildren(a);a.click();};
  async function review(next){inventory=next;reviewOwner=owner();const osm=inventory.source.name?.startsWith('OpenStreetMap');$('generation-source').textContent=osm?'来源：OpenStreetMap。查询球场中心周围 1.8 km，不发送设备 GPS。边界、洞号与原有编辑须核对。':'来源：'+inventory.source.name+'；方法：'+inventory.source.method+'。本地读取候选，不上传影像或设备 GPS。源坐标和洞号仍需核对；不是实测结果。';$('generation-osm-credit').hidden=!osm;$('generation-site').replaceChildren(new Option('请选择目标球场（确认边界）',''),...inventory.sites.map(s=>new Option(s.name+' · '+s.id,s.id)));if(inventory.sites.length===1)$('generation-site').value=inventory.sites[0].id;await ctx.real();drawer.hidden=false;show();}
  async function importCandidates(text){if(busy||applying)return;busy=true;$('recognition-import').disabled=true;try{if(text.length>5e6)throw Error('候选文件超过 5 MB');if(!ctx.sync())throw Error('当前编辑保存失败');const next=R.fromGeoJSON(JSON.parse(text));await review(next);say('已读取 '+next.features.length+' 个坐标候选；请选择球场边界，核对逐洞归属后再生成。尚未写入项目。');}catch(e){say('候选未接入：'+e.message);}finally{busy=false;$('recognition-import').disabled=false;}}
  $('recognition-import').onclick=()=>importCandidates($('recognition-input').value);
  $('recognition-file').onchange=async e=>{try{const f=e.target.files[0];if(!f||busy||applying)return;if(f.size>5e6)throw Error('候选文件超过 5 MB');await importCandidates(await f.text());}catch(e){say(e.message);}finally{e.target.value='';}};
  const help=document.createElement('section');help.id='generation-help';help.hidden=true;
  help.innerHTML='<h3>当前没有可导入的逐洞要素，不是在等待生成</h3><p>卫星底图可见，不代表公开数据库已有球道、果岭或车道坐标。工具不会凭空补出 18 洞，也不会把水域当成果岭。</p><label>选择要补绘的球洞<select id="generation-draw-hole"></select></label><div class="generation-draw-actions"><button data-draw="fairway">补绘球道</button><button data-draw="green">补绘果岭</button><button data-draw="teebox">补绘发球区</button><button data-draw="cartroute">补绘球车路线</button></div><p>补绘后可切换“虚拟地图 · 可编辑”查看矢量图。GPS 坐标随节点保存，但影像定位精度仍需实地核验；高清图另用“本洞图片 / 配准”。已有划分文件可返回地图页导入独立副本。</p>';
  $('generation-rows').before(help);
  const selectionStatus=document.createElement('p');selectionStatus.id='generation-selection';selectionStatus.setAttribute('role','status');$('generation-apply').before(selectionStatus);
  $('generation-apply').setAttribute('aria-describedby','generation-selection generation-info');
  for(const b of help.querySelectorAll('[data-draw]'))b.onclick=async()=>{try{await ctx.draw(b.dataset.draw,Number($('generation-draw-hole').value));close();say('已进入卫星图补绘；完成后可查看本洞矢量图，原始坐标随节点保存。');}catch(e){$('generation-error').textContent=e.message;}};
  const say=s=>$('generation-summary').textContent=s;
  function clear(){if(preview){map.removeLayer(preview);preview=null;}}
  function close(){if(applying)return;drawer.hidden=true;clear();}
  $('generation-close').onclick=close;
  $('generate-view').onclick=ctx.vector;$('generate-download').onclick=ctx.download;$('generate-gps').onclick=ctx.gps;
  $('generate-draw').onclick=async()=>{try{await ctx.draw('fairway',ctx.hole()?.n);close();}catch(e){say(e.message);}};
  const labels={fairway:'球道',green:'果岭',tee:'发球区',bunker:'沙坑',water:'水域',water_hazard:'水障碍',lateral_water_hazard:'侧面水障碍',rough:'长草区',hole:'击球中线（非车道）',cartpath:'球车道',pin:'旗位'};
  function ready(){
    const selected=rows.filter(r=>r.check.checked),invalid=selected.some(r=>!r.select.value||!r.kind.value);
    const button=$('generation-apply');button.disabled=applying||!rows.length||!selected.length||invalid;
    button.textContent=applying?'正在生成并保存…':!rows.length?'暂无可导入要素':!selected.length?'请先勾选要素':invalid?'请为勾选项指定洞号和类型':'确认生成 '+selected.length+' 个要素及参考点';
    selectionStatus.textContent=applying?'正在处理已确认的要素，请勿重复点击。':!rows.length?'未启动生成；请确认球场边界，或使用上方卫星图补绘入口。':'已勾选 '+selected.length+' / '+rows.length+' 项。'+(invalid?'存在未归属洞号或类型，请补全。':'生成只处理勾选项，不覆盖已有编辑。');
    return !button.disabled;
  }
  function show(){
    clear();rows=[];plan=null;$('recognition-plan').textContent='请选择目标球场边界后分析。';$('recognition-report').disabled=true;$('generation-rows').replaceChildren();$('generation-error').textContent='';
    const holesNow=ctx.course().holes;$('generation-draw-hole').replaceChildren(...holesNow.map(h=>new Option('第 '+h.n+' 洞',h.n)));$('generation-draw-hole').value=String(ctx.hole()?.n||holesNow[0]?.n);
    help.hidden=true;
    const site=inventory.sites.find(s=>s.id===$('generation-site').value);if(!site){$('generation-info').textContent='未找到可用闭合球场边界，或尚未选择。不能自动归属；请先选择球场边界。';help.hidden=inventory.sites.length>0;ready();return;}
    const features=G.within(inventory.features,site),holes=ctx.course().holes;
    plan=R.plan(ctx.course(),inventory,site);$('recognition-report').disabled=false;
    $('recognition-plan').textContent='来源洞号 '+plan.summary.labelled+' 项；中线候选 '+plan.summary.suggested+' 项；待归属 '+plan.summary.unresolved+' 项；冲突 '+plan.summary.conflicts+' 项。可用中线 '+plan.anchor_holes.length+' 洞'+(plan.ambiguous_anchors.length?'；重复中线洞号 '+plan.ambiguous_anchors.join('、')+' 已排除':'')+'。自动候选不会自动勾选；请定位核对。中线距离是匹配依据，不是定位误差。';
    const kinds={};for(const f of inventory.features)kinds[labels[f.kind]||f.kind]=(kinds[labels[f.kind]||f.kind]||0)+1;
    $('generation-info').textContent='通过边界节点检查 '+features.length+' 项；未通过 '+(inventory.features.length-features.length)+' 项（可能跨越边界，不自动导入）；不支持 / 不完整 '+inventory.unsupported+' 项。此次读取：'+(Object.entries(kinds).map(([k,n])=>k+' '+n+' 项').join('、')||'无支持的要素')+'。';
    help.hidden=features.length>0;
    preview=L.featureGroup().addTo(map);L.polygon(site.coordinates.map(C2L),{color:'#ff79ce',fill:false,pmIgnore:true}).addTo(preview);
    const dup=new Map();for(const f of features){const key=f.n+':'+f.field;dup.set(key,(dup.get(key)||0)+1);}
    for(const f of features){
      const suggestion=plan.rows.find(r=>r.id===f.id),suggestedN=suggestion?.n;
      const row=document.createElement('div');row.className='generation-row';
      const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label','导入 '+f.name+' '+f.id);
      const select=document.createElement('select');select.setAttribute('aria-label','洞号 '+f.id);select.add(new Option('待归属',''));for(const h of holes)select.add(new Option('第 '+h.n+' 洞',h.n));select.value=suggestedN?String(suggestedN):'';
      const kind=document.createElement('select');kind.setAttribute('aria-label','要素类型 '+f.id);
      for(const [k,label] of Object.entries(labels)){const geometry=['hole','cartpath'].includes(k)?'LineString':k==='pin'?'Point':'Polygon';if(geometry===f.geometry)kind.add(new Option(label,k));}kind.value=f.kind;
      const known=holes.find(h=>h.n===f.n),single=!['bunkers','water','rough','cartpaths'].includes(f.field);
      const conflict=suggestion?.conflict||single&&(dup.get(f.n+':'+f.field)>1||known?.[f.field]?.length||f.field==='pin'&&(known?.flag||known?.pins?.mid));
      const imported=holes.some(h=>h.map_sources?.some(s=>s.id===f.id));
      check.checked=suggestion?.method==='source_label'&&!!select.value&&!conflict&&!imported&&!!kind.value;
      check.disabled=imported;
      check.onchange=select.onchange=kind.onchange=ready;
      const title=document.createElement('span');title.textContent=f.name+' · '+f.id+' · '+(suggestion?.reason||f.reason)+(conflict?' · 同类型重复 / 已有数据，请核对':'')+(imported?' · 已导入':'');
      const locate=document.createElement('button');locate.textContent='定位';locate.setAttribute('aria-label','定位 '+f.name+' '+f.id);
      let layer;if(f.geometry==='Point')layer=L.circleMarker(C2L(f.coordinates[0]),{radius:6,pmIgnore:true});else layer=(f.geometry==='Polygon'?L.polygon:L.polyline)(f.coordinates.map(C2L),{color:check.checked?'#a7de58':'#eab564',weight:2,fillOpacity:.18,pmIgnore:true});
      const tooltip=document.createElement('span');tooltip.textContent=title.textContent;layer.bindTooltip(tooltip).addTo(preview);locate.onclick=()=>{if(layer.getBounds)map.fitBounds(layer.getBounds(),{padding:[70,70],maxZoom:19});else map.setView(layer.getLatLng(),19);layer.openTooltip();};
      row.append(check,title,select,kind,locate);$('generation-rows').append(row);rows.push({feature:f,check,select,kind});
    }
    map.fitBounds(L.latLngBounds(site.coordinates.map(C2L)),{padding:[30,30]});ready();
  }
  $('generation-site').onchange=show;
  $('recognition-analyse').onclick=()=>{if(inventory&&!applying)show();};
  $('generate-map-data').onclick=async()=>{
    if(busy||applying)return;if(!ctx.sync())return;busy=true;$('generate-map-data').disabled=true;say('正在读取公开地图要素（最长约 45 秒）…');
    try{const [lng,lat]=ctx.course().center;const r=await fetch('../map-source/golf?'+new URLSearchParams({lng,lat}),{credentials:'omit',signal:AbortSignal.timeout(50000)});if(!r.ok){let d;try{d=await r.json();}catch(_){}throw Error(d?.error||'本机地图连接不可用；需使用 3034 本机服务');}inventory=G.inventory(await r.json());
      await review(inventory);say('已读取 '+inventory.features.length+' 个地图要素并分析归属，请在右侧确认；尚未写入项目。');
    }catch(e){say(e.message);}finally{busy=false;$('generate-map-data').disabled=false;}
  };
  $('generation-apply').onclick=async()=>{if(applying||!ready())return;applying=true;ready();$('generation-error').textContent='';$('generation-site').disabled=true;$('generation-close').disabled=true;$('generate-map-data').disabled=true;for(const row of rows)for(const key of ['check','select','kind'])row[key].disabled=true;try{
    await new Promise(resolve=>setTimeout(resolve,0));
    if(!ctx.sync())throw Error('当前编辑未保存，请先处理保存错误');
    if(owner()!==reviewOwner)throw Error('球场或洞号列表已改变，请重新读取候选');
    const site=inventory.sites.find(s=>s.id===$('generation-site').value);
    const chosen=rows.filter(r=>r.check.checked).map(r=>({feature:r.feature,n:Number(r.select.value),kind:r.kind.value}));
    const r=G.generate(ctx.course(),site,chosen,inventory.source);r.course.recognition_review={method:plan.method,source:inventory.source,site_id:site.id,reviewed_at:new Date().toISOString(),accuracy_m:null,field_verified:false,assignments:chosen.map(x=>({id:x.feature.id,n:x.n,kind:x.kind,suggestion:plan.rows.find(p=>p.id===x.feature.id)?.n??null,confirmed_by:'user'}))};await ctx.apply(r.course);applying=false;close();await ctx.vector();say('已生成 '+r.applied+' 个要素；'+r.skipped+' 个重复项跳过。虚拟图与 GPS 使用同一份坐标；精度未实测。可切换洞号编辑。');
  }catch(e){$('generation-error').textContent='生成未完成：'+e.message;}finally{applying=false;$('generation-site').disabled=false;$('generation-close').disabled=false;$('generate-map-data').disabled=false;for(const row of rows){row.check.disabled=ctx.course().holes.some(h=>h.map_sources?.some(s=>s.id===row.feature.id));row.select.disabled=row.kind.disabled=false;if(row.check.disabled)row.check.checked=false;}ready();}};
  function refresh(){const h=ctx.hole();box.classList.toggle('generation-empty',!h?.fairway?.length&&!h?.green?.length);if(!inventory&&!busy&&ctx.course()?.map_generation){const count=ctx.course().holes.reduce((n,h)=>n+(h.map_sources?.length||0),0);say('已保存 '+count+' 个公开地图要素，可直接查看、编辑和导出；来源精度未实测。');}}
  return {refresh,importCandidates:data=>importCandidates(JSON.stringify(data)),open:()=>{if(box.parentElement.tagName==='DETAILS')box.parentElement.open=true;box.scrollIntoView({block:'start'});$('generate-map-data').focus();},close};
}
