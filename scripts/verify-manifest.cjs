const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'downloads/manifest-sha256.json'),'utf8'));
for(const item of manifest.files){const file=path.resolve(root,item.path);assert.ok(file.startsWith(root+path.sep));const data=fs.readFileSync(file);assert.equal(data.length,item.bytes,item.path+' size');assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256,item.path+' hash');}
console.log('PASS SHA-256 '+manifest.files.length+' files');
