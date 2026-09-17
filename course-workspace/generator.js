/* Geographic generation: preserve OSM vertices; no invented holes or surveyed accuracy. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CourseGenerator=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
  const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
  const fields={fairway:'fairway',green:'green',tee:'teebox',bunker:'bunkers',water_hazard:'water',lateral_water_hazard:'water',water:'water',rough:'rough',hole:'centerline',cartpath:'cartpaths',pin:'pin'};
  const multi=new Set(['bunkers','water','rough','cartpaths']);
  function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j],cross=(p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]);
    if(Math.abs(cross)<1e-12&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]))return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  }return yes;}
  function coordinates(e){if(e.type==='node')return valid([e.lon,e.lat])?[[e.lon,e.lat]]:[];return (e.geometry||[]).map(p=>[p.lon,p.lat]);}
  const closed=c=>c.length>=4&&c[0].every((v,i)=>v===c.at(-1)[i]);
  function suggest(tags){const ref=String(tags.ref||'').trim();if(/^\d{1,2}$/.test(ref))return {n:+ref,reason:'ref 标签'};
    const m=String(tags.name||'').match(/^(?:fairway|hole|tee(?:\s*box)?|green)\s*(\d{1,2})$/i)||String(tags.name||'').match(/^第?\s*(\d{1,2})\s*洞$/);
    return m?{n:+m[1],reason:'名称推断，需确认'}:{n:null,reason:'无洞号，请手动归属'};
  }
  function inventory(data){if(!Array.isArray(data?.elements)||data.remark)throw Error('地图数据不完整');const sites=[],features=[];let unsupported=0;
    for(const e of data.elements){const tags=e.tags||{},c=coordinates(e);if(!c.length||!c.every(valid)||!['node','way'].includes(e.type)){unsupported++;continue;}
      const id=e.type+'/'+e.id;
      if(tags.leisure==='golf_course'){if(closed(c))sites.push({id,name:tags.name||id,coordinates:c});else unsupported++;continue;}
      const kind=tags.golf||(tags.natural==='water'?'water':null);if(!fields[kind]){unsupported++;continue;}
      const line=['hole','cartpath'].includes(kind),point=kind==='pin'||e.type==='node';
      if(!point&&!line&&!closed(c)||line&&c.length<2){unsupported++;continue;}
      features.push({id,name:tags.name||kind,kind,field:fields[kind],geometry:point?'Point':line?'LineString':'Polygon',coordinates:c,tags,...suggest(tags)});
    }return {sites,features,unsupported,source:data.source||{name:'OpenStreetMap contributors',license:'ODbL-1.0',url:'https://www.openstreetmap.org/copyright',accuracy_m:null}};
  }
  function within(features,site){if(!site)throw Error('先选择并确认球场边界');return features.filter(f=>f.coordinates.every(p=>inside(p,site.coordinates)));}
  function reference(f){const c=f.coordinates;if(f.geometry==='Point')return c[0];const pts=f.geometry==='Polygon'?c.slice(0,-1):c;
    const mean=[0,1].map(i=>pts.reduce((a,p)=>a+p[i],0)/pts.length);
    // A mean may lie outside a concave polygon. A known boundary vertex is honest fallback.
    return f.geometry!=='Polygon'||inside(mean,c)?mean:c[0];
  }
  function generate(course,site,assignments,source){
    const c=structuredClone(course),byHole=new Map(c.holes.map(h=>[h.n,h])),seen=new Set();let applied=0,skipped=0;
    if(!site||!closed(site.coordinates))throw Error('缺少有效球场边界');
    for(const {feature:f,n,kind=f.kind} of assignments){const h=byHole.get(Number(n)),field=fields[kind];if(!h||!field)throw Error('要素洞号或类型无效');if(seen.has(f.id))throw Error('同一地图要素不能重复导入');seen.add(f.id);
      if(!f.coordinates.every(valid)||!f.coordinates.every(p=>inside(p,site.coordinates)))throw Error('要素超出确认的球场边界');
      h.map_sources??=[];if(h.map_sources.some(x=>x.id===f.id)){skipped++;continue;}
      const expected=['centerline','cartpaths'].includes(field)?'LineString':field==='pin'?'Point':'Polygon';
      if(f.geometry!==expected)throw Error(f.name+' 的几何类型与目标不符，请跳过或选择正确类型');
      if(!multi.has(field)&&field!=='pin'&&h[field]?.length)throw Error('第 '+n+' 洞已有 '+field+'；为保护原有编辑，本次不覆盖，请取消该项');
      if(field==='pin'){if(h.flag||h.pins?.mid)throw Error('第 '+n+' 洞已有旗位，请取消该项');h.flag=[...f.coordinates[0]];h.pins={...h.pins,mid:[...h.flag]};}
      else if(multi.has(field)){h[field]??=[];h[field].push(structuredClone(f.coordinates));}else h[field]=structuredClone(f.coordinates);
      const provenance=f.source||source||{},isOSM=!f.source&&(!source?.name||source.name.startsWith('OpenStreetMap'));
      h.map_sources.push({id:f.id,kind,original_tags:f.tags,assignment:'user_confirmed',source:isOSM?'OpenStreetMap':provenance.name,license:isOSM?'ODbL-1.0':provenance.license||null,provenance:structuredClone(provenance),accuracy_m:null,geometry:structuredClone(f.coordinates)});
      if(f.geometry==='Polygon'){
        h.device_points??=[];const id=isOSM?'osm-'+f.id.replace('/','-'):'map-'+encodeURIComponent(f.id);
        if(!h.device_points.some(p=>p.id===id))h.device_points.push({id,name:({green:'果岭',teebox:'发球区',fairway:'球道',bunkers:'沙坑',water:'水域',rough:'长草区'}[field]||kind)+'参考点（几何推导）',kind:'reference',coordinate:reference(f),source:isOSM?'derived_osm_geometry':'derived_map_geometry',accuracy_m:null});
      }
      h.geometry_status='map_draft_unverified';h.prevent_derived_flag=true;applied++;
    }
    if(!applied)throw Error(skipped?'所选要素已导入，无需重复生成':'请至少选择一个要素');
    c.map_generation={source,site:structuredClone(site),generated_at:new Date().toISOString(),accuracy_m:null,status:'map_draft_unverified'};
    return {course:c,applied,skipped};
  }
  return {inventory,within,generate,reference,inside,fields};
});
