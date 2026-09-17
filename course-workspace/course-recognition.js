/* Whole-course candidate planning. Geometry is evidence, never a surveyed claim. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./generator.js'):root.CourseGenerator);if(typeof module==='object'&&module.exports)module.exports=api;root.CourseRecognition=api;})(typeof globalThis==='undefined'?this:globalThis,function(G){
  'use strict';
  const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
  const clone=x=>structuredClone(x),closed=r=>Array.isArray(r)&&r.length>=4&&r.every(valid)&&r[0].every((v,i)=>v===r.at(-1)[i]);
  const aliases={teebox:'tee',cart_path:'cartpath',centerline:'hole',water:'water'};
  const expected=k=>['hole','cartpath'].includes(k)?'LineString':k==='pin'?'Point':'Polygon';
  const multi=new Set(['bunkers','water','rough','cartpaths']);
  function fromGeoJSON(data){
    if(data?.type!=='FeatureCollection'||data.coordinate_system!=='WGS84'||data.crs)throw Error('需要明确声明 coordinate_system: WGS84 的 GeoJSON FeatureCollection，不自动猜测或转换坐标系');
    if(typeof data.source?.name!=='string'||!data.source.name.trim()||typeof data.source?.method!=='string'||!data.source.method.trim())throw Error('请提供文本 source.name 和 source.method，保留影像 / 模型 / 数据来源');
    if(!Array.isArray(data.features)||data.features.length>1000)throw Error('单次最多 1000 个候选要素');
    const features=[],sites=[],ids=new Set();let vertices=0;
    for(const item of data.features){
      const p=item.properties||{},kind=aliases[p.kind]||p.kind,id=String(item.id??'');
      if(item.type!=='Feature'||!id||id.length>160||ids.has(id))throw Error('每个候选必须具有不同的非空 Feature.id');ids.add(id);
      if(kind!=='course'&&!Object.hasOwn(G.fields,kind))throw Error(id+'：缺少支持的地物类型 kind，不能把未知分割区域当成果岭');
      const geo=item.geometry,type=kind==='course'?'Polygon':expected(kind);
      if(geo?.type!==type||type==='Polygon'&&geo.coordinates?.length!==1)throw Error(id+'：仅接受单环 Polygon、LineString 或 Point；多面与带孔区域需先核对，不能丢弃内环');
      const c=type==='Point'?[geo.coordinates]:type==='Polygon'?geo.coordinates[0]:geo.coordinates;
      if(!Array.isArray(c)||!c.every(valid)||type==='Polygon'&&!closed(c)||type==='LineString'&&c.length<2)throw Error(id+'：坐标或闭合轮廓无效');
      vertices+=c.length;if(vertices>40000)throw Error('候选节点超过 40000，请分批处理');
      if(kind==='course'){sites.push({id,name:p.name||id,coordinates:clone(c),...(p.scope_only?{scope_only:true}:{})});continue;}
      const n=p.hole==null?null:p.hole;if(n!==null&&(!Number.isInteger(n)||n<1||n>72))throw Error(id+'：hole 必须是 1–72 的整数或留空');
      features.push({id,name:String(p.name||kind),kind,field:G.fields[kind],geometry:type,coordinates:clone(c),tags:clone(p),n,reason:n?'来源洞号，需核对':'无洞号，待分析',source:clone(data.source)});
    }
    return {sites,features,unsupported:0,source:{...clone(data.source),accuracy_m:null}};
  }
  function local(p,origin){return [(p[0]-origin[0])*111195*Math.cos(origin[1]*Math.PI/180),(p[1]-origin[1])*111195];}
  function segment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
  function lineDistance(p,line){let d=Infinity;for(let i=1;i<line.length;i++)d=Math.min(d,segment(p,line[i-1],line[i]));return d;}
  function plan(course,inventory,site){
    if(!closed(site?.coordinates))throw Error('先选择有效闭合球场边界');
    const features=G.within(inventory.features,site),holes=new Map(course.holes.map(h=>[h.n,h])),origin=site.coordinates[0],anchors=new Map();
    const add=(n,c,id)=>{if(!holes.has(n)||!Array.isArray(c)||c.length<2||!c.every(valid)||!c.every(p=>G.inside(p,site.coordinates)))return;
      const xy=c.map(p=>local(p,origin));if(xy.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-xy[i][0],p[1]-xy[i][1]),0)<30)return;
      const row=anchors.get(n)||[];if(!row.some(a=>JSON.stringify(a.coordinates)===JSON.stringify(c)))row.push({id,coordinates:c,xy});anchors.set(n,row);
    };
    for(const h of course.holes)add(h.n,h.centerline,'existing-hole-'+h.n);
    for(const f of features)if(f.kind==='hole'&&f.n)add(f.n,f.coordinates,f.id);
    const usable=[...anchors].filter(([,a])=>a.length===1).map(([n,a])=>({n,...a[0]}));
    let work=0;
    const rows=features.map(f=>{
      const row={id:f.id,n:null,method:'unresolved',reason:'没有可用洞号或唯一中线对应',candidates:[],conflict:false,imported:course.holes.some(h=>h.map_sources?.some(s=>s.id===f.id))};
      if(f.n!=null){if(holes.has(f.n)){row.n=f.n;row.method='source_label';row.reason='来源标注第 '+f.n+' 洞，尚待人工核对';}else row.reason='来源洞号不在当前项目内，不自动改号';return row;}
      if(['water','water_hazard','lateral_water_hazard','cartpath','rough','hole','pin'].includes(f.kind)){row.reason='可能跨洞共享或涉及方向 / 旗位，须人工指定归属';return row;}
      if(usable.length<2){row.reason='至少需要两条已编号中线作竞争比较，避免只有一条中线就吸收所有地物';return row;}
      const cost=f.coordinates.length*usable.reduce((n,a)=>n+a.xy.length-1,0);work+=cost;
      if(work>2000000){row.reason='本批空间计算量较大，保留待归属，请分批或手动确认';return row;}
      // Evaluate all original vertices; no centroid snapping or rewriting of geometry.
      const pts=f.coordinates.map(p=>local(p,origin));
      row.candidates=usable.map(a=>({n:a.n,distance_m:Math.max(...pts.map(p=>lineDistance(p,a.xy))),anchor:a.id})).sort((a,b)=>a.distance_m-b.distance_m).slice(0,3);
      const first=row.candidates[0],second=row.candidates[1];
      if(first.distance_m<=60&&second.distance_m-first.distance_m>=15&&second.distance_m>=Math.max(1,first.distance_m)*1.5){row.n=first.n;row.method='unique_corridor';row.reason='唯一中线走廊候选（不是确认）：第 '+first.n+' 洞最大节点距离 '+first.distance_m.toFixed(1)+' m；第二候选 '+second.distance_m.toFixed(1)+' m';}
      else row.reason='相邻洞接近或超出 60 m 候选走廊，保留待归属，不强行分配';
      return row;
    });
    const counts=new Map();for(const row of rows){const f=features.find(f=>f.id===row.id);if(row.n&&!row.imported&&!multi.has(f.field)){const key=row.n+':'+f.field;counts.set(key,(counts.get(key)||0)+1);}}
    for(const row of rows){if(!row.n)continue;const f=features.find(f=>f.id===row.id),h=holes.get(row.n);row.conflict=!row.imported&&!multi.has(f.field)&&(counts.get(row.n+':'+f.field)>1||!!h[f.field]?.length||f.field==='pin'&&!!(h.flag||h.pins?.mid));if(row.conflict)row.reason+='；同洞同类重复或已有编辑，不自动覆盖';}
    return {format:'golf-recognition-plan/1',method:'source_labels_and_centerline_corridors_v1',site_id:site.id,accuracy_m:null,field_verified:false,
      total:inventory.features.length,accepted:features.length,outside:inventory.features.length-features.length,anchor_holes:usable.map(a=>a.n),ambiguous_anchors:[...anchors].filter(([,a])=>a.length>1).map(([n])=>n),rows,
      summary:{labelled:rows.filter(r=>r.method==='source_label').length,suggested:rows.filter(r=>r.method==='unique_corridor').length,unresolved:rows.filter(r=>!r.n).length,conflicts:rows.filter(r=>r.conflict).length,imported:rows.filter(r=>r.imported).length}};
  }
  function assess(course){return course.holes.map(h=>({n:h.n,missing:[!h.centerline?.length&&'球洞中线',!h.green?.length&&'果岭轮廓',!h.fairway?.length&&'球道轮廓',!h.teebox?.length&&!Object.keys(h.tees||{}).length&&'发球区 / Tee',!h.cart_route?.length&&!h.cartpaths?.length&&'球车道'].filter(Boolean),has_field_report:!!h.field_audit?.report,accuracy_m:null}));}
  return {fromGeoJSON,plan,assess};
});
