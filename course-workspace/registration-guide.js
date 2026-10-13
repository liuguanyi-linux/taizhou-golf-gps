/* Guidance is about registration consistency, never a certificate of field accuracy. */
(function(root,factory){const api=factory(typeof module==='object'?require('../holemap-gps/registration.js'):root.HoleRegistration);if(typeof module==='object')module.exports=api;else root.CourseRegistrationGuide=api;})(typeof globalThis==='undefined'?this:globalThis,function(R){
  'use strict';
  const reasons={at_least_three_controls_required:'至少选择 3 个不在一条直线上的对应点',duplicate_control_pixel:'有重复的图片对应点，请撤销重复点',collinear_or_poorly_spread_controls:'对应点过于集中或接近直线，请在球洞两侧补点',non_invertible_or_extreme_distortion:'对应关系发生严重变形，请核对点是否选错',invalid_control:'对应点坐标无效，请检查经纬度与图片位置',controls_exceed_local_extent:'对应点相距过远，请确认属于同一个球场'};
  function assess(v){
    const controls=Array.isArray(v?.controls)?v.controls:[],checkpoints=Array.isArray(v?.checkpoints)?v.checkpoints:[],model=R.fit(controls,{checkpoints});
    const dimensions=!!v&&[v.width,v.height].every(n=>Number.isFinite(n)&&n>0);
    const bounded=dimensions&&controls.every(p=>p?.pixel&&p.pixel.x>=0&&p.pixel.y>=0&&p.pixel.x<=v.width&&p.pixel.y<=v.height);
    const valid=model.valid&&bounded,d=model.diagnostics;
    const area=valid?Math.abs(model.hull.reduce((s,p,i,a)=>{const q=a[(i+1)%a.length];return s+p.x*q.y-q.x*p.y;},0))/2:0;
    const checks=d.independent.residuals||[],outside=checks.filter(p=>!p.inside_hull).length;
    const kind=valid&&(controls.length>=5||v?.generator)?'checkpoints':'controls';
    return {model,valid,field_verified:false,kind,controlCount:controls.length,checkCount:d.independent.count,excludedChecks:Math.max(0,checkpoints.length-d.independent.count),outsideChecks:outside,coverage:valid?Math.min(100,area/(v.width*v.height)*100):0,
      title:!v?'先绑定本洞图片':!valid?'先校准，再放点':!d.independent.count?'可以编辑，尚待独立检查':'已有检查结果，实地精度未认证',
      action:!v?'上传本洞图片':kind==='controls'?(controls.length?'添加下一个对应点':'开始坐标校准'):'添加独立检查点',
      hint:!v?'上传后，用卫星地图上的同一地物建立对应关系。':!valid?(!bounded&&dimensions?'对应点超出图片尺寸，请检查图片是否换过。':reasons[d.reason]||'检查图片尺寸与对应点；无法建立有效配准。'):kind==='controls'?'建议至少 5 个对应点，分布在起点、终点与两侧；不要集中在中线上。':'检查点不能重复使用已有对应点；选新的地物，核对转换后的偏差。',
      rms:valid?d.rms_m:null,maxCheck:valid?d.independent.max_m:null};
  }
  function append(v,kind,point){
    if(!v||!['controls','checkpoints'].includes(kind))throw Error('请先绑定图片并选择点位类型');
    const p=point?.pixel;
    if(!p||![p.x,p.y,v.width,v.height].every(Number.isFinite)||v.width<=0||v.height<=0||p.x<0||p.y<0||p.x>v.width||p.y>v.height||!R.isWgs84(point.coordinate))throw Error('对应点必须在图片内，并使用有效 WGS84 坐标');
    const rows=v[kind]||[];if(rows.length>=100)throw Error('每类最多 100 个点');
    const all=[...(v.controls||[]),...(v.checkpoints||[])];
    if(all.some(c=>Math.hypot(c.pixel.x-p.x,c.pixel.y-p.y)<1e-6||(c.coordinate[0]===point.coordinate[0]&&c.coordinate[1]===point.coordinate[1])))throw Error('该位置已用于配准或检查，请选择新的地物');
    return {...v,[kind]:[...rows,point]};
  }
  function undo(v,kind){if(!v||!['controls','checkpoints'].includes(kind))throw Error('无效点位类型');return {...v,[kind]:(v[kind]||[]).slice(0,-1)};}
  return {assess,append,undo};
});
