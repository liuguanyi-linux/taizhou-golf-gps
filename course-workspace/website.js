/* Optional same-site integration. Never reads credentials in standalone mode. */
(function(root){
  'use strict';
  const q=new URLSearchParams(location.search),enabled=q.get('website')==='1',publicView=q.get('public')==='1';
  const id=q.get('gb'),validID=/^[a-z]{2}\d{7}$/.test(id||'');
  const base=new URL(location.origin);if(location.port==='3030')base.port='8088';
  // Hosting configuration is local code, never a query-string-controlled token destination.
  if(root.GOLF_TOOL_API_BASE){const configured=new URL(root.GOLF_TOOL_API_BASE,location.origin);if(configured.hostname!==location.hostname)throw Error('后台必须与当前网站使用同一主机名');base.href=configured.href;}
  let revision=0,baseHash='';
  const key='golfmap.website.revision.'+id;
  async function request(path,options={}){
    const headers={...(options.headers||{})};
    if(!publicView){const token=localStorage.getItem('golfcc.access_token');if(!token)throw Error('请先登录本地网站后台，再打开工具。');headers.Authorization='Bearer '+token;}
    const r=await fetch(new URL('/v1/'+path,base),{...options,headers,credentials:'omit',cache:'no-store'});
    let j;try{j=await r.json();}catch(_){throw Error('后台尚未启用工具项目接口，或服务返回了非 JSON 内容。');}
    if(!r.ok)throw Error(j?.error?.message||'后台请求失败 HTTP '+r.status);return j.data;
  }
  const endpoint=()=> (publicView?'gb/':'admin/gb/')+'venues/'+id+'/tool-project';
  async function load(){
    if(!enabled||!validID)throw Error('本地网站球场编号无效');
    const remote=await request(endpoint());
    const local=publicView?null:CourseStore.read(id);
    if(local?.website_venue_id===id&&q.get('reload_backend')!=='1'){revision=Number(localStorage.getItem(key)||0);baseHash=local.website_base_hash||'';for(const h of local.holes){const draft=JSON.parse(localStorage.getItem('golfmap.gps-draft.'+id+'.hole-'+h.n)||'null');if(draft?.hole_data)Object.assign(h,draft.hole_data);}return CourseStore.validate(local);}
    revision=remote.revision;
    baseHash=remote.base_hash||'';
    let c;
    if(remote.pack)c=await CourseProjects.hydratePack(remote.pack);
    else{
      if(publicView)throw Error('这个球场尚未发布工具项目，请先在后台保存并发布。');
      const raw=await request('admin/gb/venues/'+id+'/holemap');
      const venue=await request('gb/venues/'+id);
      if(!CourseStore.valid(raw.center))throw Error('原站未设置有效球场位置');
      c={...raw,name:venue.facts?.name_zh||venue.facts?.name_en||raw.name||id,coordinate_system:'WGS84',website_venue_id:id,distance_unit:'m',accuracy_m:null};
      // Legacy API dist is yards; convert once when first entering this tool.
      for(const h of c.holes||[]){h.dist=Object.fromEntries(Object.entries(h.dist||{}).map(([k,v])=>[k,v*.9144]));}
      if(!c.holes?.length){const count=Number.isInteger(venue.hole_count)&&venue.hole_count>0&&venue.hole_count<=72?venue.hole_count:1;c.holes=CourseStore.blank(c.name,c.center,count).holes;for(const h of c.holes){h.par=null;h.par_status='unknown';}}
    }
    c.website_venue_id=id;
    c.website_base_hash=baseHash;
    if(!publicView){CourseStore.register(id,c);localStorage.setItem(key,String(revision));if(q.get('reload_backend')==='1'){for(const h of [...(local?.holes||[]),...c.holes])localStorage.removeItem('golfmap.gps-draft.'+id+'.hole-'+h.n);const clean=new URL(location.href);clean.searchParams.delete('reload_backend');history.replaceState(null,'',clean);}}
    return c;
  }
  async function save(course,publish){
    if(!enabled||!validID)throw Error('未启用网站后台集成');
    if(publicView)throw Error('公开预览不能写入后台');
    const c=structuredClone(course);c.website_venue_id=id;
    const pack=await CourseProjects.exportPack(c),body=JSON.stringify(pack);
    if(new Blob([body]).size>64*1024*1024)throw Error('项目超过后台 64 MiB 限制，请压缩图片或移除上一版图片后再提交。');
    const result=await request(endpoint()+(publish?'/publish':''),{method:publish?'POST':'PUT',headers:{'Content-Type':'application/json','X-Golf-Revision':String(revision),'X-Golf-Base-Hash':baseHash,...(publish?{'X-Golf-Publish-Reviewed':'yes'}:{})},body});
    revision=result.revision;baseHash=result.base_hash;course.website_base_hash=baseHash;localStorage.setItem(key,String(revision));return result;
  }
  root.CourseWebsite={enabled,publicView,load,save,localID:publicView?'preview-'+id+'-'+crypto.randomUUID():id};
})(window);
