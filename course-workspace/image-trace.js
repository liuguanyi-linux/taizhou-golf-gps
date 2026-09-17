/* Bounded colour-connected proposal, not semantic recognition or survey data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.CourseImageTrace=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  function extract({data,width,height},seed,tolerance=24){
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<3||height<3||width*height>262144||data?.length!==width*height*4)throw Error('影像采样尺寸无效，最多 512 × 512 像素');
    if(!Number.isFinite(tolerance)||tolerance<1||tolerance>80)throw Error('颜色容差应为 1–80');
    const sx=Math.floor(seed.x),sy=Math.floor(seed.y);if(sx<0||sy<0||sx>=width||sy>=height||!Number.isFinite(sx+sy))throw Error('请点击框选范围内部');
    const start=sy*width+sx,s=start*4;if(data[s+3]<250)throw Error('点击位置没有完整影像，请等待地图加载');
    const mask=new Uint8Array(width*height),seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length);let head=0,tail=1,border=false;queue[0]=start;seen[start]=1;
    function visit(i){if(seen[i])return;seen[i]=1;const k=i*4;if(data[k+3]<250)return;let d=0;for(let c=0;c<3;c++)d+=(data[k+c]-data[s+c])**2;if(d<=3*tolerance*tolerance)queue[tail++]=i;}
    while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);mask[i]=1;if(x===0||y===0||x===width-1||y===height-1)border=true;if(x>0)visit(i-1);if(x<width-1)visit(i+1);if(y>0)visit(i-width);if(y<height-1)visit(i+width);}
    if(tail<9)throw Error('区域过小，请放大地图或调整颜色容差');
    if(border)throw Error('候选区域碰到框选边缘，可能截断或扩散到相邻草地。请扩大框选或降低容差');
    // Oriented pixel edges form a closed exterior. Holes and ambiguous joins are rejected.
    const edges=new Map(),key=(x,y)=>y*(width+1)+x;
    function edge(ax,ay,bx,by){const k=key(ax,ay);if(edges.has(k))throw Error('轮廓存在歧义，请缩小选区或手动描绘');edges.set(k,key(bx,by));}
    for(let j=0;j<tail;j++){const i=queue[j],x=i%width,y=Math.floor(i/width);if(!mask[i-width])edge(x,y,x+1,y);if(!mask[i+1])edge(x+1,y,x+1,y+1);if(!mask[i+width])edge(x+1,y+1,x,y+1);if(!mask[i-1])edge(x,y+1,x,y);}
    const first=edges.keys().next().value,ring=[];let k=first;
    do{ring.push([k%(width+1),Math.floor(k/(width+1))]);const next=edges.get(k);if(next===undefined)throw Error('轮廓无法闭合，请手动描绘');edges.delete(k);k=next;}while(k!==first);
    if(edges.size)throw Error('候选区域包含空洞或多个轮廓，不能简化成单面；请手动描绘');
    const simple=ring.filter((p,i)=>{const before=ring[(i+ring.length-1)%ring.length],after=ring[(i+1)%ring.length];return (p[0]-before[0])*(after[1]-p[1])!==(p[1]-before[1])*(after[0]-p[0]);});
    if(simple.length>1500)throw Error('轮廓过于复杂，请调整容差或缩小选区');simple.push(simple[0].slice());
    return {ring:simple,pixels:tail,width,height,tolerance,seed:[sx,sy],method:'seed_rgb_connected_v1'};
  }
  function proposal(result,toGeo,metadata){
    const coordinates=result.ring.map(p=>toGeo(p));if(coordinates.some(c=>!Array.isArray(c)||c.length!==2||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90))throw Error('影像坐标转换失败');
    return {coordinates,source:{...metadata,method:result.method,sample_width:result.width,sample_height:result.height,seed_pixel:result.seed,tolerance:result.tolerance,accuracy_m:null,status:'image_draft_unverified'}};
  }
  function apply(course,n,kind,candidate,confirmed){
    if(!confirmed)throw Error('请先核对轮廓、洞号和类型并勾选确认');
    const fields={green:'green',fairway:'fairway',teebox:'teebox',bunker:'bunkers',water:'water'},field=fields[kind];if(!field)throw Error('仅支持球道、果岭、发球区、沙坑和水域面');
    const c=structuredClone(course),h=c.holes.find(h=>h.n===n);if(!h)throw Error('球洞不存在');
    const ring=candidate.coordinates;
    if(!Array.isArray(ring)||ring.length<4||ring.length>1501||ring.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)||ring[0].some((v,i)=>v!==ring.at(-1)[i]))throw Error('候选轮廓无效');
    if(!candidate.source?.provider||candidate.source.method!=='seed_rgb_connected_v1')throw Error('缺少影像来源');
    if(['bunkers','water'].includes(field)){h[field]??=[];if(h[field].some(r=>JSON.stringify(r)===JSON.stringify(ring)))throw Error('相同轮廓已存在');h[field].push(structuredClone(ring));}
    else{if(h[field]?.length)throw Error('本洞已有该要素，为保护原编辑不自动覆盖');h[field]=structuredClone(ring);}
    h.image_sources??=[];h.image_sources.push({...structuredClone(candidate.source),kind,coordinates:structuredClone(ring),assignment:'user_confirmed',accuracy_m:null,status:'image_draft_unverified'});
    h.geometry_status='image_draft_unverified';h.prevent_derived_flag=true;
    // Reference remains on an observed boundary vertex, never a claimed flag or measured Tee.
    h.device_points??=[];h.device_points.push({id:'trace-'+n+'-'+h.image_sources.length,name:({green:'果岭',fairway:'球道',teebox:'发球区',bunker:'沙坑',water:'水域'}[kind])+'边界参考点（影像提取）',kind:'reference',coordinate:ring[0].slice(),source:'derived_image_boundary',accuracy_m:null});
    return c;
  }
  return {extract,proposal,apply};
});
