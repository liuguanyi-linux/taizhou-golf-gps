const fs=require('node:fs');
const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname, '..');
const R=require(root+'/holemap-gps/registration.js');
const source=fs.readFileSync(root+'/holemap-hd/hd.js','utf8');
const html=fs.readFileSync(root+'/holemap-hd/index.html','utf8');
const course=JSON.parse(fs.readFileSync(root+'/holemap-data/cn0000385-codex.json','utf8'));
const teePads=new Function('return ('+source.match(/const teePadCalibration = (\{[\s\S]*?\n  \});/)[1]+')')();
const configs=new Function('return ('+source.match(/const conceptConfig = (\{[\s\S]*?\n  \});/)[1]+')')();
const functions=source.slice(source.indexOf('  function holeTwoOverlay()'),source.indexOf('  function configureConcept('));
const names=['Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen'];
const builders=new Function(functions+';return ['+names.map(s=>'hole'+s+'Overlay').join(',')+'];')();
const round=n=>n===null?null:Math.round(n*100)/100;
const results=[];
for(const h of course.holes){
 const overlay=h.n===1?html:builders[h.n-2]();
 const match=overlay.match(/<g class="green-flag"[^>]*>[\s\S]*?<circle cx="([\d.]+)" cy="([\d.]+)"/);
 assert.ok(match,'Missing actual green flag pixel h'+h.n);
 const controls=teePads[h.n].map(([x,y],i)=>({id:['red','white','blue','black'][i],pixel:{x,y},coordinate:h.tees[['red','white','blue','black'][i]],source:'estimated-default'}));
 controls.push({id:'flag',pixel:{x:Number(match[1]),y:Number(match[2])},coordinate:h.flag,source:'estimated-default'});
 const m=R.fit(controls),d=m.diagnostics,c=configs[h.n];
 const hullArea=m.hull.reduce((s,p,i)=>{const q=m.hull[(i+1)%m.hull.length];return s+p.x*q.y-p.y*q.x;},0)/2;
 results.push({hole:h.n,valid:m.valid,rms_m:round(d.rms_m),max_m:round(d.max_m),pixel_eigen_ratio:d.pixel_eigen_ratio,geo_eigen_ratio:d.geo_eigen_ratio,hull_image_percent:round(Math.abs(hullArea)/(c.width*c.height)*100),warnings:d.warnings,reason:d.reason});
}
console.log(JSON.stringify({method:'Existing teePadCalibration image pixels + actual green-flag SVG circle + existing WGS84, fitted pixel-to-local-metre affine. Training residual only; not field accuracy.',results},null,2));
