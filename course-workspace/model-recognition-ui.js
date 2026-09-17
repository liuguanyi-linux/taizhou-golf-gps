/* Experimental semantic segmentation, always reviewed before it becomes editable course data. */
function createModelRecognitionUI(host,api){
  const box=document.createElement('section');box.className='workspace-tools model-recognition';
  box.innerHTML='<h2>本机 AI 识别卫星地物 · 试验版</h2><p>框选当前卫星图，识别多个同类轮廓，再核对洞号。不是整场自动编号，也不是测绘级精度。请放大到 z17 以上；小果岭不能靠整场缩略图准确识别。</p><label>识别类别<select id="model-kind"><option value="green">果岭候选</option><option value="fairway">球道候选</option><option value="bunker">沙坑候选</option><option value="water">水域候选</option></select></label><label>分割阈值（不是准确率）<input id="model-threshold" type="number" min="0.2" max="0.85" step="0.05" value="0.5"></label><button id="model-start" class="wide">框选卫星图并运行本机 AI</button><button id="model-cancel" class="wide">取消本次识别</button><p id="model-status" role="status">未开始。影像只传到本机模型，不发送设备 GPS；不会自动改动球场数据。</p><button id="model-review" class="wide" disabled>查看候选并核对逐洞归属</button><p>只处理允许读取像素的底图。识别来源、模型版本和原坐标随候选保留；错误轮廓请取消或用原编辑工具修正。当前不识别官方 Tee 点、旗位和车道。</p>';
  const diagnostics=document.createElement('pre');diagnostics.id='model-diagnostics';diagnostics.style.whiteSpace='pre-wrap';box.append(diagnostics);
  const inputView=document.createElement('details'),inputTitle=document.createElement('summary'),inputImage=document.createElement('img');inputTitle.textContent='查看本次识别输入影像（仅本机）';inputImage.alt='本次模型实际输入的卫星选区';inputImage.style.width='100%';inputView.append(inputTitle,inputImage);box.append(inputView);
  host.append(box);const $=id=>box.querySelector('#'+id),map=api.map;
  let stage=null,owner=null,source=null,corners=[],roi=null,preview=null,controller=null,epoch=0,result=null,resultOwner=null;
  const now=()=>JSON.stringify([api.course().project_id||api.course().slug,api.hole().n,api.provider()]);
  const say=s=>$('model-status').textContent=s;
  function cancel(){epoch++;controller?.abort();controller=null;stage=null;corners=[];source=null;owner=null;result=null;resultOwner=null;if(roi)map.removeLayer(roi);if(preview)map.removeLayer(preview);roi=preview=null;$('model-start').disabled=false;$('model-review').disabled=true;map.getContainer().style.cursor='';}
  async function open(){cancel();let token;try{await api.begin();token=++epoch;stage='checking';controller=new AbortController();$('model-start').disabled=true;const r=await fetch('../recognition/local',{credentials:'omit',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});if(token!==epoch)return;if(!r.ok)throw Error('当前服务未启用本机识别接口，请使用更新后的本机网站');const health=await r.json();if(token!==epoch)return;if(!health.installed)throw Error('本机模型尚未安装完整，请按技术文档准备依赖和模型');if(health.busy)throw Error('已有本机识别正在运行，请稍后重试');if(map.getZoom()<17)throw Error('请先用地图 + 放大到 z17 以上');owner=now();source=api.layer();stage='corners';map.getContainer().style.cursor='crosshair';say('点击选区的两个对角。尽量包含完整地物及周围背景；第二次点击后开始识别。');}catch(e){if(token==null||token===epoch){stage=null;say(e.message);}}finally{if(token===epoch){controller=null;$('model-start').disabled=false;}}box.scrollIntoView({block:'nearest'});}
  async function click(e){if(stage!=='corners')return;if(now()!==owner){cancel();say('球场、洞号或底图已变化，请重新框选');return;}const p=map.latLngToContainerPoint(e.latlng);corners.push([p.x,p.y]);if(corners.length===1){say('再点击范围的另一对角，开始本机识别');return;}
    const rect={x:Math.min(...corners.map(p=>p[0])),y:Math.min(...corners.map(p=>p[1])),width:Math.abs(corners[1][0]-corners[0][0]),height:Math.abs(corners[1][1]-corners[0][1])};
    if(rect.width<32||rect.height<32){corners=[];say('选区太小，请重新框选');return;}
    const nw=map.containerPointToLatLng([rect.x,rect.y]),se=map.containerPointToLatLng([rect.x+rect.width,rect.y+rect.height]);
    const bounds=[nw.lng,se.lat,se.lng,nw.lat],kind=$('model-kind').value,threshold=Number($('model-threshold').value),provider=api.provider(),token=++epoch;
    stage='busy';$('model-start').disabled=true;controller=new AbortController();const abort=controller;map.getContainer().style.cursor='';
    roi=L.rectangle([[nw.lat,nw.lng],[se.lat,se.lng]],{color:'#ffc569',fill:false,interactive:false,pmIgnore:true}).addTo(map);
    say('读取选区底图像素…');
    try{
      const canvas=await captureSatelliteRegion(map,source,rect);if(token!==epoch||now()!==owner)return;inputImage.src=canvas.toDataURL('image/png');
      const r=await fetch('../recognition/local',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({image:canvas.toDataURL('image/png'),bounds,kind,threshold,provider}),signal:abort.signal});
      if(!r.ok){const d=await r.json();throw Error(d.error||'本机识别服务错误');}
      const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='',bytes=0;
      for(;;){const {done,value}=await reader.read();if(done)break;if(token!==epoch){await reader.cancel();return;}bytes+=value.length;if(bytes>2000000){await reader.cancel();throw Error('识别输出过大');}buffer+=decoder.decode(value,{stream:true});let pos;while((pos=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);if(!line)continue;const event=JSON.parse(line);if(event.event==='progress')say(event.message);if(event.event==='error')throw Error(event.message);if(event.event==='result'){result=event.data;resultOwner=owner;const rejected=Object.values(event.rejected).reduce((a,b)=>a+b,0);say('模型完成：'+event.statistics.candidates+' 个候选；'+rejected+' 个区域因过小、截断、带孔或过复杂被排除。模型阈值不是米级精度，尚未写入项目。');}}}
      if(token!==epoch||now()!==owner)return;if(!result)throw Error('模型没有返回完整结果');diagnostics.textContent='识别诊断（不是精度）：'+JSON.stringify(result.source.diagnostics||{});
      const inventory=CourseRecognition.fromGeoJSON(result);if(!inventory.features.length){say($('model-status').textContent+' 没有可用完整轮廓，请调整阈值、放大或改变选区；不能把空结果当成生成成功。');return;}
      preview=L.featureGroup().addTo(map);for(const f of inventory.features)L.polygon(f.coordinates.map(p=>[p[1],p[0]]),{color:'#00edc4',fillOpacity:.15,interactive:false,pmIgnore:true}).addTo(preview);
      $('model-review').disabled=false;
    }catch(e){if(token===epoch){result=null;resultOwner=null;$('model-review').disabled=true;say('识别未完成：'+e.message);}}finally{if(token===epoch){stage=null;controller=null;$('model-start').disabled=false;}}
  }
  $('model-start').onclick=open;$('model-cancel').onclick=()=>{cancel();say('识别已取消，没有写入项目');};
  $('model-review').onclick=async()=>{if(!result||now()!==resultOwner){cancel();say('球洞或底图已变化，请重新识别');return;}const data=result;cancel();await api.review(data);};
  map.on('click',click);map.on('movestart',()=>{if(stage){cancel();say('地图视角变化，已取消识别以保持影像坐标一致');}});
  map.on('layerremove',e=>{if(source&&e.layer===source)cancel();});map.on('pm:drawstart',cancel);window.addEventListener('hole-loaded',cancel);
  return {open,cancel};
}
