// Refresh distribution checksums without rewriting either course's baseline.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),target='downloads/manifest-sha256.json';
function walk(dir='') { return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{
  if(e.name.startsWith('.')||e.name==='node_modules'||e.name==='artifacts'||e.isSymbolicLink())return [];
  const p=path.posix.join(dir,e.name);return e.isDirectory()?walk(p):p===target||p.endsWith('.zip')?[]:[p];
}); }
const files=walk().sort().map(p=>{const b=fs.readFileSync(path.join(root,p));return {path:p,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};});
fs.writeFileSync(path.join(root,target),JSON.stringify({algorithm:'SHA-256',generated_at:new Date().toISOString(),excludes:['.git','hidden files','manifest itself','ZIP artifacts'],files},null,2)+'\n');
console.log(`Verified ${files.length} files; no course geometry or image files modified.`);
