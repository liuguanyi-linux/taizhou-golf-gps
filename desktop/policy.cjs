'use strict';
const path=require('node:path');
const RELEASES='https://github.com/liuguanyi-linux/taizhou-golf-gps/releases';
function localURL(value){try{const u=new URL(value);return u.protocol==='golf:'&&u.hostname==='app'&&!u.username&&!u.password&&!u.port;}catch(_){return false;}}
function publicFile(root,value){
  if(!localURL(value))return null;
  let p;try{p=decodeURIComponent(new URL(value).pathname);}catch(_){return null;}
  if(p.includes('\\')||p.includes('\0')||p.split('/').some(s=>s.startsWith('.')))return null;
  if(!/^\/(?:cn|course-workspace|holemap-(?:editor|viewer|gps|hd|data)|kingswan|data|docs|app|downloads)\//.test(p)&&!['/','/index.html','/manifest.webmanifest'].includes(p))return null;
  if(!/\.(?:html|js|css|json|geojson|png|jpg|jpeg|svg|ico|md|txt|webmanifest)$/i.test(p)&&!p.endsWith('/'))return null;
  const file=path.resolve(root,'.'+p+(p.endsWith('/')?'index.html':''));
  return file.startsWith(root+path.sep)?file:null;
}
function version(value){return /^\d+\.\d+\.\d+$/.test(value)?value.split('.').map(Number):null;}
function newer(a,b){const x=version(a),y=version(b);if(!x||!y)return false;for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function selectRelease(rows,current,platform,arch){
  const suffix=platform==='win32'?`-win-${arch}.exe`:`-mac-${arch}.dmg`;
  return (Array.isArray(rows)?rows:[]).filter(r=>!r.draft&&/^app-v\d+\.\d+\.\d+$/.test(r.tag_name)&&newer(r.tag_name.slice(5),current)).sort((a,b)=>newer(a.tag_name.slice(5),b.tag_name.slice(5))?-1:1).flatMap(r=>{
    const asset=r.assets?.find(a=>a.state==='uploaded'&&a.name===`Golf-Workbench-${r.tag_name.slice(5)}${suffix}`&&a.browser_download_url===`${RELEASES}/download/${r.tag_name}/${a.name}`);
    return asset?[{version:r.tag_name.slice(5),url:asset.browser_download_url,notes:`${RELEASES}/tag/${r.tag_name}`,bytes:asset.size}]:[];
  })[0]||null;
}
module.exports={localURL,publicFile,newer,selectRelease,RELEASES};
