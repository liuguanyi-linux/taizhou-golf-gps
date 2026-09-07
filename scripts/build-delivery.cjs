/* Generate distributable baseline data and content hashes; never reads browser state. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,value)=>fs.writeFileSync(path.join(root,p),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const P=require('../holemap-gps/point-workspace.js');
const course=JSON.parse(read('holemap-data/cn0000385-codex.json'));
const routes=JSON.parse(read('holemap-data/cn0000385-device-routes.json'));
for(const h of course.holes){const route=routes.holes.find(r=>Number(r.n)===Number(h.n));if(route?.cart_route){h.cart_route=route.cart_route;h.cart_route_meta=route.cart_route_meta;}}
const configs=vm.runInNewContext('('+read('holemap-hd/hd.js').match(/const conceptConfig = (\{[\s\S]*?\n  \});/)[1]+')');
const catalog=P.buildCatalog(course,{courseId:'cn0000385'});
if(catalog.errors.length)throw Error('Invalid baseline catalogue');
const points=P.exportGeoJSON(course,{courseId:'cn0000385'});
const geoContext={HoleGpsCore:require('../holemap-gps/gps-core.js')};
vm.runInNewContext(read('holemap-gps/geojson.js'),geoContext);
const geometry=geoContext.HoleGeoJson.collectionForCourse(course,'cn0000385');
const generated=new Date().toISOString();
write('downloads/cn0000385-points.geojson',points);
write('downloads/cn0000385-geometry.geojson',geometry);
write('downloads/cn0000385-baseline-test-package.json',{schema_version:'golf-point-workspace/1',course_id:'cn0000385',coordinate_system:'WGS84',coordinate_order:['longitude','latitude'],unit:'m',distance_type:'surface_geodesic_not_route',field_verified:false,generated_at:generated,data_source:'disk_baseline_not_browser_drafts',warning:'默认图像配准未现场验收；本包不含浏览器里未导出的编辑。',geojson:points,holes:course.holes.map(h=>({hole:h.n,registration:h.registration||null,registration_status:h.registration?'calibrated_unverified':'estimated_default',cart_route:h.cart_route||[]}))});
const inventory={version:'2026-09-07',course_id:'cn0000385',field_verified:false,generated_at:generated,holes_count:course.holes.length,catalog_points:catalog.points.length,point_geojson_features:points.features.length,geometry_features:geometry.features.length,holes:course.holes.map(h=>{const c=configs[h.n],p='holemap-hd/'+c.asset,b=fs.readFileSync(path.join(root,p));if(b.toString('hex',0,8)!=='89504e470d0a1a0a'||b.readUInt32BE(16)!==c.width||b.readUInt32BE(20)!==c.height)throw Error('Image size mismatch H'+h.n);return {hole:h.n,par:h.par,image:{path:p,width:c.width,height:c.height,bytes:b.length,sha256:hash(p)},reference_image:'holemap-hd/assets/satellite-hd-h'+h.n+'.jpg',tees:Object.keys(h.tees||{}),saved_registration:!!h.registration,custom_points:(h.device_points||[]).length,cart_route_nodes:(h.cart_route||[]).length};})};
write('downloads/data-inventory.json',inventory);
write('downloads/registration-audit.json',JSON.parse(cp.execFileSync(process.execPath,['tests/golf-registration-audit.cjs'],{cwd:root,encoding:'utf8'})));
// Render the bundled Markdown subset safely: raw HTML is escaped, no remote renderer or script.
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function inline(s){return escape(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" rel="noreferrer">$1</a>');}
function markdown(text){const lines=text.split('\n'),out=[];let list=false;for(let i=0;i<lines.length;i++){const line=lines[i];if(line.startsWith('```')){if(list){out.push('</ul>');list=false;}const block=[];while(++i<lines.length&&!lines[i].startsWith('```'))block.push(lines[i]);out.push('<pre><code>'+escape(block.join('\n'))+'</code></pre>');continue;}if(/^\|/.test(line)&&/^\|\s*:?-/.test(lines[i+1]||'')){if(list){out.push('</ul>');list=false;}const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(s=>inline(s.trim()));out.push('<div class="table"><table><thead><tr>'+cells(line).map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>');i++;while(/^\|/.test(lines[i+1]||'')){out.push('<tr>'+cells(lines[++i]).map(c=>'<td>'+c+'</td>').join('')+'</tr>');}out.push('</tbody></table></div>');continue;}const bullet=line.match(/^(?:- |\d+\. )(.*)/);if(bullet){if(!list){out.push('<ul>');list=true;}out.push('<li>'+inline(bullet[1])+'</li>');continue;}if(list){out.push('</ul>');list=false;}const h=line.match(/^(#{1,6}) (.*)/);if(h)out.push('<h'+h[1].length+'>'+inline(h[2])+'</h'+h[1].length+'>');else if(line.trim())out.push('<p>'+inline(line)+'</p>');}if(list)out.push('</ul>');return out.join('\n');}
const shell=body=>'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>泰州 GPS 技术文档</title><style>body{max-width:1000px;margin:32px auto;padding:0 22px;color:#202d1b;background:#fafaf5;font:16px/1.8 system-ui,sans-serif}a{color:#426b24}nav{display:flex;gap:20px;flex-wrap:wrap}h1,h2,h3{line-height:1.35;margin-top:2em}code{background:#e9eddf;padding:2px 4px;border-radius:4px}pre{background:#e9eddf;padding:18px;overflow:auto;line-height:1.6}pre code{padding:0}.table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:10px;border:1px solid #ced6c6;text-align:left}th{background:#e9eddf}@media print{nav{display:none}pre{white-space:pre-wrap}.table{overflow:visible}h2,h3{break-after:avoid}}</style></head><body><nav><a href="../index.html">返回交付首页</a><a href="index.html">技术文档</a><a href="QUICKSTART.html">操作指南</a><a href="DISTRIBUTION.html">私有分发</a><a href="TECHNICAL.md" download>下载 Markdown 原文</a></nav>'+body+'</body></html>';
for(const [md,html] of [['TECHNICAL.md','index.html'],['QUICKSTART.md','QUICKSTART.html'],['DISTRIBUTION.md','DISTRIBUTION.html']])write('docs/'+html,shell(markdown(read('docs/'+md))).replace('私有分发','访问与分发'));
const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{if(e.name.startsWith('.')||e.name==='node_modules'||e.name==='artifacts')return [];const p=path.posix.join(dir,e.name);return e.isDirectory()?walk(p):[p];});
const files=walk('').filter(p=>p!=='downloads/manifest-sha256.json'&&!p.endsWith('.zip')).sort();
write('downloads/manifest-sha256.json',{algorithm:'SHA-256',generated_at:generated,excludes:['.git','hidden files','manifest itself','ZIP artifacts'],files:files.map(p=>({path:p,bytes:fs.statSync(path.join(root,p)).size,sha256:hash(p)}))});
console.log(JSON.stringify({holes:inventory.holes_count,points:catalog.points.length,geometry_features:geometry.features.length,files:files.length,images_verified:inventory.holes.length},null,2));
