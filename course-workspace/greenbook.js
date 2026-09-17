/* Public source adapter: remote course data is imported into an independent local project. */
(function(root,factory){const api=factory(typeof module==='object'?require('./store.js'):root.CourseStore);if(typeof module==='object')module.exports=api;else root.GreenBookSource=api;})(typeof globalThis!=='undefined'?globalThis:this,function(S){
  'use strict';
  const validID=id=>typeof id==='string'&&/^[a-z]{2}\d{7}$/.test(id);
  async function request(path){const r=await fetch('../../course-source/'+path,{credentials:'omit',signal:AbortSignal.timeout(10000)});if(!r.ok){let j;try{j=await r.json();}catch(_){}throw Error(j?.error||'本机原站连接不可用；请用 3034 本地启动器运行，静态发布不连接本机原站');}return r.json();}
  function rows(payload){if(!Array.isArray(payload?.data?.items))throw Error('原站球场列表格式不匹配');return payload.data.items.filter(r=>validID(r.id)).map(r=>({id:r.id,name:r.name||r.id,name_local:r.name_local||'',center:S.valid([r.longitude,r.latitude])?[r.longitude,r.latitude]:null,holes:Number.isInteger(r.total_holes)&&r.total_holes>0&&r.total_holes<=72?r.total_holes:null,city:r.city||'',country:r.country||'',source:'greenbook',status:'原站球场 · 点击读取已有球洞数据'}));}
  function coverage(course){const keys=['holeperim','green','fairway','teebox','centerline','cartpaths','cart_route','bunkers','water'];const hs=course.holes||[];return {returned:hs.length,geometry:hs.filter(h=>keys.some(k=>h[k]?.length)||Object.keys(h.tees||{}).length||S.valid(h.flag)).length};}
  function prepare(venue,payload){
    const raw=payload?.data;if(!raw||!Array.isArray(raw.holes))throw Error('原站球洞图格式不匹配');if(raw.slug&&raw.slug!==venue.id)throw Error('返回的球场编号不匹配，未接入');
    if(raw.coordinate_system&&raw.coordinate_system!=='WGS84')throw Error('原站坐标系不是 WGS84，未自动转换');
    const center=S.valid(raw.center)?raw.center:venue.center;if(!S.valid(center))throw Error('原站没有有效坐标，请先在地图核对场地位置');
    const imported=structuredClone(raw),stats=coverage(imported),declared=venue.holes;
    if(!stats.returned){if(!declared)throw Error('原站没有球洞或洞数；请手动新建并核对洞数');imported.holes=S.blank(venue.name,center,declared).holes.map(h=>({...h,geometry_status:'unmapped',par:null,par_status:'unknown'}));}
    Object.assign(imported,{name:venue.name,center,coordinate_system:'WGS84',accuracy_m:null,source_project_id:venue.id,geographic_status:stats.geometry?'source_geometry_unverified':'awaiting_hole_geometry',source_import:{type:'greenbook_public',venue_id:venue.id,endpoint:'/v1/gb/venues/'+venue.id+'/holemap',imported_at:new Date().toISOString(),declared_holes:declared,returned_holes:stats.returned,holes_with_geometry:stats.geometry,empty_slots_created:stats.returned===0}});
    imported.source_holemap=structuredClone(raw);return S.validate(imported);
  }
  async function search(q=''){return rows(await request('venues?'+new URLSearchParams({q,limit:'500'})));}
  async function course(venue){if(!validID(venue.id))throw Error('球场编号无效');return prepare(venue,await request('venues/'+venue.id+'/holemap'));}
  function existing(venueID){if(!validID(venueID))return [];const candidates=new Map(S.custom().map(r=>[r.id,r]));if(!candidates.has(venueID))candidates.set(venueID,{id:venueID});return [...candidates.values()].flatMap(row=>{const c=S.read(row.id),source=c?.source_import;const match=source?source.type==='greenbook_public'&&source.venue_id===venueID:c?.source_project_id===venueID;if(!match||!Array.isArray(c.holes))return [];try{S.validate(c);}catch(_){return [];}return [{...row,name:c.name,updated_at:c.updated_at||'',revision:c.revision||0,hole_numbers:c.holes.map(h=>h.n)}];}).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||b.revision-a.revision||a.id.localeCompare(b.id));}
  function importLocal(c,options={}){const found=existing(c?.source_import?.venue_id);if(!options.forceNew&&found.length)return found[0].id;const id='local-'+crypto.randomUUID();S.register(id,structuredClone(c));return id;}
  return {rows,coverage,prepare,search,course,importLocal,existing,validID};
});
