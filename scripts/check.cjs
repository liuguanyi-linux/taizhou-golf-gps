const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name.startsWith('.')||e.name==='node_modules'?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of walk(root)){
 const rel=path.relative(root,file);
 assert.ok(!/\.local\.js$|\.env(?:\.|$)|\.pem$/.test(rel),'Sensitive filename: '+rel);
 if(/\.(?:c?js|html|css|json|md|geojson)$/.test(file)){
  const text=fs.readFileSync(file,'utf8');
  assert.ok(!/(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text),'Credential pattern in '+rel);
  assert.ok(!/\/Users\/nailong\//.test(text),'Personal absolute path in '+rel);
  if(/\.html$/.test(file)){for(const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/\bsrc=|application\/ld\+json|application\/json/.test(match[1]))new vm.Script(match[2],{filename:rel});}}
  if(/\.(?:js|cjs)$/.test(file))new vm.Script(text,{filename:rel});
  if(/\.(?:json|geojson)$/.test(file))JSON.parse(text);
 }
}
const base=JSON.parse(fs.readFileSync(path.join(root,'holemap-data/cn0000385-codex.json'),'utf8'));
assert.deepEqual(base.holes.map(h=>h.n).sort((a,b)=>a-b),Array.from({length:18},(_,i)=>i+1));
for(let n=1;n<=18;n++)assert.ok(fs.statSync(path.join(root,'holemap-hd/assets/satellite-hd-h'+n+'.jpg')).size>1000);
for(const test of ['golf-point-workspace-test.cjs','golf-registration-regression.cjs'])cp.execFileSync(process.execPath,[path.join(root,'tests',test)],{stdio:'inherit'});
console.log('PASS JavaScript/HTML syntax, JSON parsing, 18-hole inventory, reference images and scoped credential/path scan. Not a comprehensive security audit or field accuracy test.');
