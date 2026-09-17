/* Install only the tool's static namespace into a locally owned checkout. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),target=process.argv[2];
if(!target)throw Error('Usage: node scripts/install-local-website.cjs /path/to/Golf.CC');
const site=fs.realpathSync(target),pub=path.join(site,'web-user/public'),dest=path.join(pub,'golf-tool');
if(!fs.existsSync(path.join(site,'server/go.mod'))||!fs.statSync(pub).isDirectory())throw Error('Not a Golf.CC local source checkout');
if(fs.existsSync(dest)&&!fs.existsSync(path.join(dest,'installation.json')))throw Error('Destination already exists and is not managed by this installer; nothing overwritten');
const files=[];
function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(e.isFile())files.push(rel);}}
for(const dir of ['course-workspace','holemap-editor','holemap-gps'])walk(dir);
// Do not install course imagery, user data, database, server config or the entire website.
const old=fs.existsSync(path.join(dest,'installation.json'))?JSON.parse(fs.readFileSync(path.join(dest,'installation.json'))).files:{};
const oldServer=fs.existsSync(path.join(dest,'installation.json'))?JSON.parse(fs.readFileSync(path.join(dest,'installation.json'))).server_files||{}:{};
const serverFiles=['osm-readonly.cjs','map-transport.cjs','recognition-local.cjs','recognition-worker.py'];
const modelRoute=path.join(site,'web-user/app/golf-tool/recognition/local/route.ts');
const modelRouteSource=path.join(root,'scripts/recognition-next-route.ts');
if(fs.existsSync(modelRoute)&&shaFile(modelRoute)!==oldServer['recognition-route'])throw Error('Recognition route was edited locally; refusing overwrite');
function shaFile(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const rel of files){const f=path.join(dest,rel);if(fs.existsSync(f)&&sha(fs.readFileSync(f))!==old[rel])throw Error('Installed file was edited locally; refusing to overwrite: '+rel);}
for(const name of serverFiles){const f=path.join(site,'web-user/lib/golf-tool',name);if(fs.existsSync(f)&&sha(fs.readFileSync(f))!==oldServer[name])throw Error('Server map helper was edited locally; refusing overwrite: '+name);}
const manifest={version:1,installed_at:new Date().toISOString(),files:{},server_files:{}};
for(const rel of files){const b=fs.readFileSync(path.join(root,rel)),f=path.join(dest,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.copyFileSync(path.join(root,rel),f);manifest.files[rel]=sha(b);}
for(const name of serverFiles){const source=path.join(root,'scripts',name),f=path.join(site,'web-user/lib/golf-tool',name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.copyFileSync(source,f);manifest.server_files[name]=sha(fs.readFileSync(source));}
fs.mkdirSync(path.dirname(modelRoute),{recursive:true});fs.copyFileSync(modelRouteSource,modelRoute);manifest.server_files['recognition-route']=shaFile(modelRoute);
fs.writeFileSync(path.join(dest,'installation.json'),JSON.stringify(manifest,null,2));
console.log('Installed '+files.length+' static tool files, '+serverFiles.length+' server-only helpers and local recognition route. Original editors were not overwritten.');
