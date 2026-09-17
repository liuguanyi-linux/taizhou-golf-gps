/* Capture only the selected visible base layer. Respect tile CORS; never capture UI/GPS overlays. */
async function captureSatelliteRegion(map,source,rect,maxSize=1024){
  const container=source?.getContainer();if(!container)throw Error('请切换实景卫星底图');
  const origin=map.getContainer().getBoundingClientRect();
  if(rect.x<0||rect.y<0||rect.x+rect.width>origin.width+1||rect.y+rect.height>origin.height+1||rect.width<32||rect.height<32)throw Error('请在可见地图内框选至少 32 像素的范围');
  const factor=Math.min(1,maxSize/Math.max(rect.width,rect.height)),width=Math.round(rect.width*factor),height=Math.round(rect.height*factor);
  const tiles=[...container.querySelectorAll('.leaflet-tile-loaded')].map(tile=>({tile,b:tile.getBoundingClientRect()})).filter(({b})=>b.right>origin.left+rect.x&&b.left<origin.left+rect.x+rect.width&&b.bottom>origin.top+rect.y&&b.top<origin.top+rect.y+rect.height);
  if(!tiles.length||tiles.length>64)throw Error('瓦片未加载或选区过大');
  function imageFor(tile){return new Promise((resolve,reject)=>{if(tile.tagName==='CANVAS'){resolve(tile);return;}const img=new Image(),timer=setTimeout(()=>finish(Error('影像读取超时')),10000);function finish(error){clearTimeout(timer);img.onload=img.onerror=null;if(error){img.src='';reject(error);}else resolve(img);}img.crossOrigin='anonymous';img.onload=()=>finish();img.onerror=()=>finish(Error('影像源不允许读取像素或瓦片未加载；请切换底图或使用手绘'));img.src=tile.currentSrc||tile.src;});}
  const images=await Promise.all(tiles.map(async t=>({...t,img:await imageFor(t.tile)})));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  for(const {img,b} of images)ctx.drawImage(img,(b.left-origin.left-rect.x)*width/rect.width,(b.top-origin.top-rect.y)*height/rect.height,b.width*width/rect.width,b.height*height/rect.height);
  let raster;try{raster=ctx.getImageData(0,0,width,height);}catch(_){throw Error('影像源限制像素读取，不能识别；仍可手工描绘');}
  for(let i=3;i<raster.data.length;i+=4)if(raster.data[i]<250)throw Error('选区有未加载影像，请等底图完整后重试');
  return canvas;
}
