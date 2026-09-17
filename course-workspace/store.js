/* Local course repository. No credentials, original API calls or server writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CourseStore=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
  const PREFIX='golfmap.course-workspace.v1.';
  const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
  function validate(c){
    if(!c||typeof c!=='object'||!Array.isArray(c.holes)||!c.holes.length)throw Error('需要包含 holes 的球场 JSON');
    if(typeof c.name!=='string'||!c.name.trim())throw Error('球场名称必须为文本');
    if(typeof c.schema_version==='string'&&c.schema_version.startsWith('golf-course/')&&c.schema_version!=='golf-course/1')throw Error('不支持的球场数据版本');
    if(c.coordinate_system&&c.coordinate_system!=='WGS84')throw Error('只接受明确的 WGS84 数据，不自动猜测坐标系');
    if(!valid(c.center))throw Error('球场 center 必须为 [经度, 纬度]');
    const ns=new Set();for(const h of c.holes){if(!Number.isInteger(h.n)||h.n<1||ns.has(h.n))throw Error('洞号必须是不同的正整数');ns.add(h.n);
      const tree=(v,depth=0)=>{if(v==null)return;if(!Array.isArray(v)||depth>4)throw Error('地理要素必须为坐标数组');if(!v.length)return;if(typeof v[0]==='number'){if(!valid(v))throw Error('地理要素坐标无效');}else for(const x of v)tree(x,depth+1);};
      for(const k of ['green','fairway','holeperim','teebox','fringe','rough','bunkers','water','native','bridges','buildings','ranges','parkings','centerline','cartpaths','cart_route','paths','creeks','ditches','obs','fences','hazards','hazards_y','trees','rocks','aims','services','shelters'])if(h[k]!=null)tree(h[k]);
      if(Object.keys(h.tees||{}).some(k=>!['black','gold','blue','white','red'].includes(k)))throw Error('Tee 颜色仅支持 black/gold/blue/white/red');
      for(const p of [...Object.values(h.tees||{}),...Object.values(h.pins||{}),h.tee,h.flag,h.cart_position])if(p!=null&&!valid(p))throw Error('点位坐标无效');
      for(const p of h.dists||[])if(!valid(p.pt)||!/^[\d.\s]*$/.test(String(p.y??'')))throw Error('距离桩需要坐标和数值距离');
      const ids=new Set();for(const p of h.device_points||[]){if(!valid(p.coordinate)||!p.id||ids.has(p.id))throw Error('设备点坐标或唯一 ID 无效');ids.add(p.id);}
    }
    if(c.holes.length>72)throw Error('单个球场最多 72 洞');
    return c;
  }
  function key(id){return PREFIX+id;}
  function read(id){try{return JSON.parse(localStorage.getItem(key(id))||'null');}catch(_){return null;}}
  function save(id,c){validate(c);const next={...c,schema_version:'golf-course/1',project_id:id,slug:id,source_project_id:c.source_project_id||(c.slug!==id?c.slug:null),revision:(read(id)?.revision||0)+1,coordinate_system:'WGS84',updated_at:new Date().toISOString()};localStorage.setItem(key(id),JSON.stringify(next));c.revision=next.revision;c.updated_at=next.updated_at;const rows=custom(),row=rows.find(x=>x.id===id);if(row){Object.assign(row,{name:c.name,center:c.center,holes:c.holes.length,hole_numbers:c.holes.map(h=>h.n)});localStorage.setItem(PREFIX+'catalog',JSON.stringify(rows));}}
  function custom(){try{return JSON.parse(localStorage.getItem(PREFIX+'catalog')||'[]');}catch(_){return [];}}
  function register(id,c){save(id,c);const rows=custom().filter(x=>x.id!==id);rows.push({id,name:c.name||id,center:c.center,holes:c.holes.length,hole_numbers:c.holes.map(h=>h.n),status:'本机项目 · 精度待核验'});localStorage.setItem(PREFIX+'catalog',JSON.stringify(rows));}
  let registryPromise;
  function registry(base='../'){return registryPromise??=(async()=>{const r=await fetch(base+'course-workspace/catalog.json');if(!r.ok)throw Error('项目目录读取失败');return (await r.json()).courses;})().catch(e=>{registryPromise=null;throw e;});}
  async function load(id,base='../'){
    let c=read(id);const rows=await registry(base),desc=rows.find(x=>x.id===id)||rows.find(x=>x.id===(c?.source_project_id||c?.slug));
    if(!c){if(!desc)throw Error('没有该球场项目，请先新建或导入');const r=await fetch(base+desc.source);if(!r.ok)throw Error('项目数据读取失败');
      if(desc.format==='scorecard-assignment'){const b=JSON.parse((await r.text()).replace(/^window\.[A-Z_]+\s*=\s*/,'').replace(/;\s*$/,''));
        c={id,slug:id,name:b.name,coordinate_system:'WGS84',center:desc.center,zoom:15,context_boundary:b.boundary,accuracy_m:null,geographic_status:'awaiting_hole_geometry',holes:b.holes.map(h=>({...h,visual:h.image?{src:desc.asset_root+h.image.path,width:h.image.width,height:h.image.height}:null,dist:Object.fromEntries(Object.entries(h.scorecard_yards).map(([k,v])=>[k,v*.9144])),tees:{},pins:{},green:[],fairway:[],holeperim:[],bunkers:[],water:[],cartpaths:[]}))};
      }else c=await r.json();
      if(desc.routes){const rr=await fetch(base+desc.routes);if(!rr.ok)throw Error('路线资料读取失败');const d=await rr.json();for(const h of c.holes){const x=d.holes.find(x=>x.n===h.n);if(x)Object.assign(h,x);}}
    }
    for(const h of c.holes||[]){if(!h.visual&&desc?.artwork?.[h.n])h.visual=structuredClone(desc.artwork[h.n]);if(!h.visual&&h.image?.path&&desc?.asset_root)h.visual={...h.image,src:desc.asset_root+h.image.path};}
    c.legacy_editor??=desc?.legacy_editor||null;c.source_project_id??=c.slug||id;c.slug=id;c.project_id=id;c.schema_version='golf-course/1';
    // Per-hole drafts are shared with the established virtual/GPS viewer. Apply last.
    for(const h of c.holes||[]){try{const d=JSON.parse(localStorage.getItem('golfmap.gps-draft.'+id+'.hole-'+h.n)||'null');if(d?.hole_data)Object.assign(h,d.hole_data);}catch(_){}}
    for(const h of c.holes||[])if(h.visual&&!h.visual.controls&&h.registration?.controls?.length&&(!h.registration.image||h.registration.image.width===h.visual.width&&h.registration.image.height===h.visual.height)){h.visual.controls=structuredClone(h.registration.controls);h.visual.checkpoints=structuredClone(h.registration.checkpoints||[]);}
    return c;
  }
  function blank(name,center,count=18){if(!valid(center))throw Error('坐标格式无效');if(!Number.isInteger(count)||count<1||count>72)throw Error('球洞数必须为 1–72');if(typeof name!=='string'||!name.trim())throw Error('请填写球场名称');return {name:name.trim(),center,schema_version:'golf-course/1',coordinate_system:'WGS84',accuracy_m:null,geographic_status:'awaiting_hole_geometry',holes:Array.from({length:count},(_,i)=>({n:i+1,par:4,dist:{},tees:{},pins:{},device_points:[],cart_route:[],green:[],fairway:[],holeperim:[],cartpaths:[]}))};}
  return {validate,valid,key,read,save,custom,register,load,blank,registry};
});
