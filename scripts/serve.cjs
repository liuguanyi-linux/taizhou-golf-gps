/* Local-only static preview. No telemetry upload, backend proxy, or directory listing. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};
const server = http.createServer((req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Cache-Control','no-cache');
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname); }
  catch (_) { res.writeHead(400); return res.end(); }
  if (pathname.includes('\\') || pathname.split('/').some(p=>p.startsWith('.') || p.endsWith('.local.js')) || pathname.includes('\0')) { res.writeHead(403); return res.end(); }
  let file=path.resolve(root,'.'+pathname);
  if (!file.startsWith(root+path.sep) && file!==root) { res.writeHead(403); return res.end(); }
  try {
    if (fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
    const real=fs.realpathSync(file);
    if (!real.startsWith(root+path.sep) || !fs.statSync(real).isFile()) throw new Error('Not a public file');
    res.setHeader('Content-Type',types[path.extname(real)]||'application/octet-stream');
    res.setHeader('Content-Length',fs.statSync(real).size);
    res.writeHead(200);
    if(req.method==='HEAD') return res.end();
    fs.createReadStream(real).on('error',()=>res.destroy()).pipe(res);
  } catch (_) { res.writeHead(404); res.end('Not found'); }
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'3034 端口已占用；请先关闭自己先前的预览，不会自动停止其他服务。':error.message);process.exitCode=1;});
server.listen(3034,'127.0.0.1',()=>console.log('泰州虚拟图 / GPS 私有本机预览：http://127.0.0.1:3034/\n仅监听本机；Ctrl+C 停止。'));
