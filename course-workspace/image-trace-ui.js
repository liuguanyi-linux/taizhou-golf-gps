/* Visible satellite tiles only; no screenshot service, model upload or automatic publication. */
function createImageTraceUI(host,api){
  const T=CourseImageTrace,box=document.createElement('section');box.className='workspace-tools trace-tools';
  box.innerHTML='<h2>卫星影像辅助提取 · 试验功能</h2><p>先放大到一个地物。① 框选范围 → ② 点击内部 → ③ 核对后加入当前洞。按颜色提取，不自动识别洞号或地物；相邻草地、阴影可能使提取失败。</p><label>目标要素<select id="trace-kind"><option value="green">果岭</option><option value="fairway">球道</option><option value="teebox">发球区</option><option value="bunker">沙坑</option><option value="water">水域</option></select></label><label>颜色容差（小值更严格）<input id="trace-tolerance" type="number" min="1" max="80" value="24"></label><button id="trace-start" class="wide">在卫星图框选并提取</button><button id="trace-cancel" class="wide">取消候选 / 重新框选</button><p id="trace-status" role="status">未开始。不会自动写入或覆盖球洞数据。</p><label><input id="trace-confirm" type="checkbox">已核对当前洞、类型和候选轮廓，接受为未实测草稿</label><button id="trace-apply" class="wide" disabled>确认轮廓后加入当前洞</button><p>只在本浏览器处理底图像素；不上传影像或设备 GPS。不保存底图副本。若影像源不允许读取像素，使用原有手绘工具。节点映射至 WGS84 不等于获得实测精度。</p>';
  host.prepend(box);const $=id=>box.querySelector('#'+id),map=api.map;
  let stage=null,corners=[],roiLayer=null,preview=null,candidate=null,epoch=0,owner=null,source=null;
  const say=t=>$('trace-status').textContent=t;
  const ownerNow=()=>({project:api.course().project_id||api.course().slug,hole:api.hole().n,provider:api.provider()});
  const unchanged=()=>owner&&JSON.stringify(owner)===JSON.stringify(ownerNow());
  function reset(){epoch++;stage=null;corners=[];candidate=null;owner=null;source=null;if(roiLayer){map.removeLayer(roiLayer);roiLayer=null;}if(preview){map.removeLayer(preview);preview=null;}$('trace-confirm').checked=false;$('trace-apply').disabled=true;$('trace-start').disabled=false;map.getContainer().style.cursor='';}
  function cancel(){const hadCandidate=stage||candidate;reset();if(hadCandidate)say('候选已取消，没有写入地图。');}
  async function open(){reset();try{await api.begin();if(map.getZoom()<17)throw Error('请先用地图 + 或滚轮放大到 z17 以上，再框选单个地物');owner=ownerNow();source=api.layer();stage='corners';map.getContainer().style.cursor='crosshair';say('第 '+owner.hole+' 洞：点击目标周围框选范围的两个对角。框内要包含完整地物，并留一点外侧背景。');}catch(e){say(e.message);}box.scrollIntoView({block:'nearest'});}
  function imageFor(tile){return new Promise((resolve,reject)=>{if(tile.tagName==='CANVAS'){resolve(tile);return;}const img=new Image(),timer=setTimeout(()=>finish(Error('影像读取超时，请稍后再试')),10000);function finish(error){clearTimeout(timer);img.onload=img.onerror=null;if(error){img.src='';reject(error);}else resolve(img);}img.crossOrigin='anonymous';img.onload=()=>finish();img.onerror=()=>finish(Error('此影像源不允许读取像素或瓦片未加载。请切换 Esri / 高德，或使用手绘'));img.src=tile.currentSrc||tile.src;});}
  async function capture(rect){
    const container=source?.getContainer();if(!container)throw Error('请切换实景卫星底图');
    const origin=map.getContainer().getBoundingClientRect(),factor=Math.min(1,512/Math.max(rect.width,rect.height)),width=Math.max(3,Math.round(rect.width*factor)),height=Math.max(3,Math.round(rect.height*factor));
    const tiles=[...container.querySelectorAll('.leaflet-tile-loaded')].map(tile=>({tile,b:tile.getBoundingClientRect()})).filter(({b})=>b.right>origin.left+rect.x&&b.left<origin.left+rect.x+rect.width&&b.bottom>origin.top+rect.y&&b.top<origin.top+rect.y+rect.height);
    if(!tiles.length||tiles.length>64)throw Error('瓦片未加载或选区过大，请缩小范围');
    const images=await Promise.all(tiles.map(async t=>({...t,img:await imageFor(t.tile)})));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
    for(const {img,b} of images)ctx.drawImage(img,(b.left-origin.left-rect.x)*width/rect.width,(b.top-origin.top-rect.y)*height/rect.height,b.width*width/rect.width,b.height*height/rect.height);
    let raster;try{raster=ctx.getImageData(0,0,width,height);}catch(_){throw Error('影像源限制像素读取，不能辅助提取；仍可在卫星图手工描绘');}
    for(let i=3;i<raster.data.length;i+=4)if(raster.data[i]<250)throw Error('选区有未加载的影像，不能把缺图当作轮廓边缘。请等底图完整后重试');
    return raster;
  }
  async function click(e){if(!stage)return;if(!unchanged()){cancel();say('球洞或底图已改变，请重新框选');return;}
    const p=map.latLngToContainerPoint(e.latlng);
    if(stage==='corners'){corners.push({x:p.x,y:p.y});if(corners.length===1){say('再点击框选范围的另一对角');return;}
      if(Math.abs(corners[0].x-p.x)<12||Math.abs(corners[0].y-p.y)<12){corners=[];say('选区太小，请重新点击两个对角');return;}
      roiLayer=L.rectangle(L.latLngBounds(corners.map(c=>map.containerPointToLatLng(c))),{color:'#ffc569',fill:false,dashArray:'5 4',interactive:false,pmIgnore:true}).addTo(map);stage='seed';say('现在点击框内目标地物的内部。可调整颜色容差后再次点击；不会自动保存。');return;
    }
    if(stage!=='seed')return;
    const rect={x:Math.min(...corners.map(c=>c.x)),y:Math.min(...corners.map(c=>c.y)),width:Math.abs(corners[0].x-corners[1].x),height:Math.abs(corners[0].y-corners[1].y)};
    if(p.x<=rect.x||p.y<=rect.y||p.x>=rect.x+rect.width||p.y>=rect.y+rect.height){say('请点击框选范围内部');return;}
    const token=++epoch;stage='busy';candidate=null;$('trace-confirm').checked=false;$('trace-apply').disabled=true;$('trace-start').disabled=true;if(preview){map.removeLayer(preview);preview=null;}say('正在读取选区像素并提取候选轮廓…');
    try{const raster=await capture(rect);if(token!==epoch||!unchanged())return;await new Promise(r=>setTimeout(r,0));if(token!==epoch)return;
      const result=T.extract(raster,{x:(p.x-rect.x)*raster.width/rect.width,y:(p.y-rect.y)*raster.height/rect.height},Number($('trace-tolerance').value));
      candidate=T.proposal(result,([x,y])=>{const ll=map.containerPointToLatLng([rect.x+x*rect.width/raster.width,rect.y+y*rect.height/raster.height]);return [ll.lng,ll.lat];},{provider:owner.provider,zoom:map.getZoom(),captured_at:new Date().toISOString(),bounds:corners.map(c=>{const ll=map.containerPointToLatLng(c);return [ll.lng,ll.lat];})});
      preview=L.polygon(candidate.coordinates.map(c=>[c[1],c[0]]),{color:'#00edc4',fillOpacity:.2,weight:2,interactive:false,pmIgnore:true}).addTo(map);say('第 '+owner.hole+' 洞候选：'+(candidate.coordinates.length-1)+' 个边界节点。请对照卫星图检查；不满意可改容差并重新点内部，或取消手绘。');
    }catch(err){if(token===epoch)say('未生成候选：'+err.message);}finally{if(token===epoch){stage='seed';$('trace-start').disabled=false;}}
  }
  map.on('click',click);map.on('movestart',()=>{if(stage){reset();say('地图视角已改变，旧候选已取消，请重新框选以保持坐标一致。');}});
  map.on('layerremove',e=>{if(stage&&e.layer===source){reset();say('底图已改变，请重新框选');}});
  map.on('pm:drawstart',()=>{if(stage)cancel();});window.addEventListener('hole-loaded',()=>{if(stage)cancel();});
  $('trace-start').onclick=open;$('trace-cancel').onclick=cancel;
  $('trace-kind').onchange=()=>{$('trace-confirm').checked=false;$('trace-apply').disabled=true;};
  $('trace-confirm').onchange=()=>{$('trace-apply').disabled=!candidate||!$('trace-confirm').checked||!unchanged();};
  $('trace-apply').onclick=async()=>{if(!candidate||!unchanged()||!$('trace-confirm').checked)return;const token=++epoch;stage='saving';$('trace-apply').disabled=true;$('trace-start').disabled=true;try{
    if(!api.sync())throw Error('当前编辑保存失败');const next=T.apply(api.course(),owner.hole,$('trace-kind').value,candidate,true);await api.apply(next);reset();say('已保存到当前洞，来源标为影像辅助提取、未实测。可用地图编辑工具修正节点，再生成虚拟图或进行 GPS 测距。');
  }catch(e){say('未加入地图：'+e.message);if(token===epoch){stage='seed';$('trace-start').disabled=false;$('trace-apply').disabled=false;}}};
  return {open,cancel};
}
