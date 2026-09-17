/* Fixed-origin, public GET-only bridge. Never forwards credentials or admin routes. */
'use strict';
const PREFIX='/course-source/';
function route(url){
  if(!url.pathname.startsWith(PREFIX))return null;
  const tail=url.pathname.slice(PREFIX.length);
  if(tail==='venues'){
    if([...url.searchParams.keys()].some(k=>!['q','limit'].includes(k)))throw Error('Unsupported query');
    const q=url.searchParams.get('q')?.trim()||'';if(q.length>160)throw Error('Query too long');
    const limit=Number(url.searchParams.get('limit')||500);if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid limit');
    return '/v1/gb/venues?'+new URLSearchParams({q,limit:String(limit)});
  }
  if(/^venues\/[a-z]{2}\d{7}\/holemap$/.test(tail)&&!url.search)return '/v1/gb/'+tail;
  throw Error('Unsupported public route');
}
async function handle(req,res,url,fetcher=fetch){
  if(!url.pathname.startsWith(PREFIX))return false;
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method!=='GET'){send(405,{error:'原站连接只允许读取'});return true;}
  let endpoint;try{endpoint=route(url);}catch(_){send(400,{error:'仅允许公开球场检索与球洞图读取'});return true;}
  const origin=req.headers.origin;
  if(origin&&!['http://localhost:3034','http://127.0.0.1:3034'].includes(origin)){send(403,{error:'不接受外部网站调用本机连接'});return true;}
  try{
    const upstream=await fetcher('http://127.0.0.1:8088'+endpoint,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!upstream.ok){send(upstream.status===404?404:502,{error:'原站公开接口返回 '+upstream.status+'；不尝试后台接口或登录绕过'});return true;}
    const reader=upstream.body.getReader();let bytes=0;const chunks=[];
    try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>12*1024*1024){await reader.cancel();throw Error('Response too large');}chunks.push(Buffer.from(r.value));}}finally{reader.releaseLock();}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));send(200,data);
  }catch(_){send(503,{error:'原站 8088 公开数据暂不可用；请确认原网站可打开，再重试。已有本机项目不受影响。'});}
  return true;
}
module.exports={route,handle};
