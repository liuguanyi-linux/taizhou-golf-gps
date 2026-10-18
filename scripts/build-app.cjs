'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
fs.mkdirSync(path.join(root,'app'),{recursive:true});
// Code-generated, original flag icon (no third-party bitmap assets).
function crc(b){let c=0xffffffff;for(const v of b){c^=v;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,b){const t=Buffer.from(type),o=Buffer.alloc(b.length+12);o.writeUInt32BE(b.length);t.copy(o,4);b.copy(o,8);o.writeUInt32BE(crc(Buffer.concat([t,b])),b.length+8);return o;}
for(const n of [192,512]){const b=Buffer.alloc(n*(n*4+1));for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=x/n,v=y/n;let c=[24,53,35];if(((u-.5)/.27)**2+((v-.73)/.1)**2<1)c=[155,208,88];if(u>.47&&u<.5&&v>.24&&v<.73)c=[247,249,238];if(u>=.5&&u<.75&&v>.25&&v<.45-(u-.5)*.25)c=[247,249,238];const p=y*(n*4+1)+1+x*4;b[p]=c[0];b[p+1]=c[1];b[p+2]=c[2];b[p+3]=255;}const h=Buffer.alloc(13);h.writeUInt32BE(n);h.writeUInt32BE(n,4);h[8]=8;h[9]=6;fs.writeFileSync(path.join(root,'app/icon-'+n+'.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(b)),chunk('IEND',Buffer.alloc(0))]));}
fs.writeFileSync(path.join(root,'app/version.json'),JSON.stringify({version})+'\n');
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);}
const files=['index.html','manifest.webmanifest',...['app','cn','course-workspace','holemap-editor','holemap-viewer','holemap-gps','holemap-data','holemap-hd','kingswan'].flatMap(walk)].filter(p=>p!=='app/precache.js'&&/\.(?:html|js|css|json|geojson|webmanifest)$/.test(p)&&!p.endsWith('.local.js'));
files.push('app/icon-192.png','app/icon-512.png');files.sort();
const hash=crypto.createHash('sha256');for(const p of files)hash.update(p).update(fs.readFileSync(path.join(root,p)));hash.update(fs.readFileSync(path.join(root,'sw.js')));
fs.writeFileSync(path.join(root,'app/precache.js'),'self.GOLF_BUILD='+JSON.stringify({id:hash.digest('hex').slice(0,16),version,files})+';\n');
console.log('App '+version+': '+files.length+' offline shell files; HD images/tiles remain online or imported project assets.');
