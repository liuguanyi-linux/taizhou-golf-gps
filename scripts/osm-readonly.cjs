'use strict';
const {mapFetch,fault}=require('./map-transport.cjs');
const cache=new Map();
function query(url){
  if(url.pathname!=='/map-source/golf')throw Error('Unsupported route');
  if([...url.searchParams.keys()].some(k=>!['lng','lat'].includes(k)))throw Error('Unsupported parameter');
  const lng=Number(url.searchParams.get('lng')),lat=Number(url.searchParams.get('lat'));
  if(!url.searchParams.get('lng')||!url.searchParams.get('lat')||!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>85)throw Error('Invalid coordinates');
  const area=`(around:1800,${lat},${lng})`;
  return `[out:json][timeout:15];(nwr${area}[golf];way${area}[leisure=golf_course];way${area}[natural=water];);out geom;`;
}
function explain(e){
  if(e.code==='PROXY_RUNTIME')return e.message;
  if(e.code==='MAP_TOO_LARGE')return '地图响应超过大小限制';
  if(e.code==='MAP_INCOMPLETE')return '地图服务返回了不完整数据';
  if(e.code==='MAP_JSON')return '地图来源返回了非 JSON 内容，可能是网关错误';
  if(e.status===429)return '公开地图服务请求过多（HTTP 429），请稍后重试';
  if(e.status)return '公开地图服务暂不可用（HTTP '+e.status+'）';
  if(e.name==='AbortError'||e.name==='TimeoutError'||e.code==='ABORT_ERR')return '公开地图请求超时';
  return '无法连接公开地图服务，请检查后台进程的网络及代理配置';
}
async function read(q,fetcher=mapFetch){
  const old=cache.get(q);if(old&&Date.now()-old.time<600000)return old.data;
  let data;
  for(let attempt=0;attempt<2;attempt++){
    const r=await fetcher('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q),{method:'GET',headers:{'User-Agent':'GolfMapTool/1.0 (local map editing preview)',Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(22000)});
    if(!r.ok){await r.body?.cancel();if(attempt===0&&[502,503,504].includes(r.status))continue;throw Object.assign(fault('MAP_HTTP','地图服务失败'),{status:r.status});}
    if(!r.body)throw fault('MAP_INCOMPLETE','缺少地图内容');
    const reader=r.body.getReader(),chunks=[];let size=0;
    try{for(;;){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>12*1024*1024){await reader.cancel();throw fault('MAP_TOO_LARGE','地图数据过大');}chunks.push(Buffer.from(x.value));}}finally{reader.releaseLock();}
    let d;try{d=JSON.parse(Buffer.concat(chunks).toString());}catch(_){throw fault('MAP_JSON','非 JSON 数据');}
    if(!Array.isArray(d.elements)||d.remark)throw fault('MAP_INCOMPLETE','地图数据不完整');
    data={...d,source:{name:'OpenStreetMap contributors',license:'ODbL-1.0',url:'https://www.openstreetmap.org/copyright',fetched_at:new Date().toISOString(),radius_m:1800,accuracy_m:null}};break;
  }
  if(cache.size>=20)cache.delete(cache.keys().next().value);cache.set(q,{time:Date.now(),data});return data;
}
async function handle(req,res,url,fetcher=mapFetch){
  if(!url.pathname.startsWith('/map-source/'))return false;
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='GET'){send(405,{error:'只允许读取公开地图'});return true;}
  if(req.headers.origin&&!['http://localhost:3034','http://127.0.0.1:3034'].includes(req.headers.origin)){send(403,{error:'不接受外部网站调用'});return true;}
  let q;try{q=query(url);}catch(_){send(400,{error:'需要有效的球场经纬度；仅支持限定范围的高尔夫地图检索'});return true;}
  try{
    send(200,await read(q,fetcher));
  }catch(e){send(503,{error:'公开地图读取失败：'+explain(e)+'。未更改项目，已有图片和点位可继续使用。',code:e.code||'MAP_NETWORK'});}
  return true;
}
module.exports={query,handle,read,explain};
