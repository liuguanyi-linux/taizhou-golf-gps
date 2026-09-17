'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const runtime=()=>process.env.GOLF_RECOGNITION_PYTHON||path.join(os.homedir(),'Library/Caches/golf-recognition-runtime/bin/python');
const modelDir=()=>process.env.GOLF_RECOGNITION_MODEL||path.join(os.homedir(),'Library/Caches/golf-recognition-model');
let busy=false;
function installed(){return fs.existsSync(runtime())&&['model.safetensors','config.json','preprocessor_config.json','tokenizer_config.json','vocab.json','merges.txt'].every(f=>fs.existsSync(path.join(modelDir(),f)));}
function validate(data){
 if(!data||!['green','fairway','bunker','water'].includes(data.kind))throw Error('要素类型无效');
 if(typeof data.image!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.image)||data.image.length>6000000)throw Error('需要有大小限制的 PNG 选区');
 const b=data.bounds;if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite))throw Error('WGS84 范围无效');
 const [w,s,e,n]=b;if(!(w>=-180&&e<=180&&w<e&&s>-85&&n<85&&s<n&&e-w<=.05&&n-s<=.05))throw Error('选区超出识别范围，请分区处理');
 if(typeof data.provider!=='string'||!data.provider||data.provider.length>100||!Number.isFinite(data.threshold)||data.threshold<.2||data.threshold>.85)throw Error('来源或阈值无效');
 return {image:data.image,bounds:b,kind:data.kind,provider:data.provider,threshold:data.threshold};
}
function allowed(request){
 const url=new URL(request.url),origin=request.headers.get('origin');
 return url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)&&['3030','3034'].includes(url.port)&&(!origin||origin===url.origin)&&(!request.headers.get('sec-fetch-site')||['same-origin','none'].includes(request.headers.get('sec-fetch-site')));
}
async function response(request){
 const json=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 if(!allowed(request))return json('本机识别只接受 localhost 同源调用',403);
 if(request.method==='GET')return Response.json({installed:installed(),busy,model:'CLIPSeg',local_only:true},{headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return json('只支持状态读取和本机识别',405);
 if(!request.headers.get('origin')||!request.headers.get('content-type')?.startsWith('application/json'))return json('需要同源 JSON 请求',403);
 if(!installed())return json('本机模型尚未安装完整，请按 LOCAL-IMAGE-RECOGNITION 文档准备模型；不会自动下载或调用云端',503);
 if(busy)return json('已有识别任务正在运行，请等待完成或取消',409);
 busy=true;let data;
 try{
   if(Number(request.headers.get('content-length'))>6100000)throw Error('选区请求过大');
   const reader=request.body?.getReader();if(!reader)throw Error('缺少选区');let size=0,chunks=[],expired=false;
   const bodyTimer=setTimeout(()=>{expired=true;reader.cancel().catch(()=>{});},15000);
   try{for(;;){const {value,done}=await reader.read();if(expired)throw Error('选区传输超时');if(done)break;size+=value.length;if(size>6100000){await reader.cancel();throw Error('选区请求过大');}chunks.push(Buffer.from(value));}}finally{clearTimeout(bodyTimer);reader.releaseLock();}
   data=validate(JSON.parse(Buffer.concat(chunks).toString()));
 }catch(e){busy=false;return json(e.message,400);}
 let child,finish;
 const stream=new ReadableStream({start(controller){
   let done=false,total=0;const encoder=new TextEncoder();
   function write(event){if(!done)controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));}
   const timer=setTimeout(()=>{write({event:'error',message:'识别超过 180 秒，已停止；请缩小范围后重试'});finish();},180000);
   finish=()=>{if(done)return;done=true;clearTimeout(timer);request.signal.removeEventListener('abort',finish);if(child&&child.exitCode===null){child.kill('SIGTERM');const killTimer=setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');},2000);killTimer.unref();child.once('close',()=>{clearTimeout(killTimer);busy=false;});}else busy=false;try{controller.close();}catch(_){/* Consumer cancellation already closed the stream. */}};
   request.signal.addEventListener('abort',finish,{once:true});
   if(request.signal.aborted){finish();return;}
   write({event:'progress',message:'已接收选区，在本机运行模型；最长 180 秒，可取消'});
   child=spawn(runtime(),['-u',path.join(__dirname,'recognition-worker.py')],{env:{...process.env,GOLF_RECOGNITION_MODEL:modelDir(),HF_HUB_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',TOKENIZERS_PARALLELISM:'false'},stdio:['pipe','pipe','ignore']});
   child.stdout.on('data',chunk=>{if(done)return;total+=chunk.length;if(total>2000000){write({event:'error',message:'候选输出过大，请缩小选区'});finish();return;}controller.enqueue(new Uint8Array(chunk));});
   child.on('error',()=>{write({event:'error',message:'无法启动本机模型，请检查独立 Python 环境'});finish();});
   child.on('close',code=>{if(code&&!done)write({event:'error',message:'本机模型未完成，请检查依赖和选区'});finish();});
   child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(data));
 },cancel(){finish?.();}});
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
}
module.exports={response,validate,allowed};
