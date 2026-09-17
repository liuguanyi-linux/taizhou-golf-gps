'use strict';
const https=require('node:https');
const LIMIT=12*1024*1024;
function supportsProxy(version=process.versions.node){const [major,minor]=version.split('.').map(Number);return major>=25||major===24&&minor>=5||major===22&&minor>=21;}
function fault(code,message){return Object.assign(new Error(message),{code});}
function proxyEnvironment(env=process.env){return Object.fromEntries(['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','NO_PROXY','no_proxy'].filter(k=>env[k]).map(k=>[k,env[k]]));}
// Dedicated agent: never changes global fetch/proxy behavior or forwards website credentials.
function mapFetch(input,options={}){
  const url=new URL(input);
  if(url.origin!=='https://overpass-api.de'||url.pathname!=='/api/interpreter'||url.username||url.password) return Promise.reject(fault('DESTINATION','不支持的地图来源'));
  const proxyEnv=proxyEnvironment();
  if(Object.keys(proxyEnv).some(k=>/https?_proxy/i.test(k))&&!supportsProxy())return Promise.reject(fault('PROXY_RUNTIME','当前 Node 版本不支持地图代理，请使用 Node 24.5+ 或 22.21+'));
  return new Promise((resolve,reject)=>{
    const agent=new https.Agent({proxyEnv,keepAlive:false});let settled=false;
    const fail=e=>{if(settled)return;settled=true;agent.destroy();reject(e);};
    const req=https.get(url,{agent,signal:options.signal,headers:{'User-Agent':'GolfMapTool/1.0 (local map editing preview)',Accept:'application/json','Accept-Encoding':'identity'}},res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>LIMIT){const e=fault('MAP_TOO_LARGE','地图数据超过 12 MiB，请缩小查询范围或分批导入');fail(e);res.destroy(e);}else chunks.push(chunk);});
      res.on('aborted',()=>fail(fault('MAP_INCOMPLETE','地图响应中途断开')));res.on('error',fail);
      res.on('end',()=>{if(settled)return;settled=true;agent.destroy();const status=res.statusCode||502;resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers:{'Content-Type':res.headers['content-type']||''}}));});
    });req.on('error',fail);
  });
}
module.exports={mapFetch,supportsProxy,proxyEnvironment,fault};
