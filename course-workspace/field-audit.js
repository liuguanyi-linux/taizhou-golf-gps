/* User-supplied independent ground observations; never self-certifies a whole course. */
(function(root,factory){const api=factory(typeof module==='object'?require('../holemap-gps/registration.js'):root.HoleRegistration);if(typeof module==='object')module.exports=api;else root.CourseFieldAudit=api;})(typeof globalThis==='undefined'?this:globalThis,function(R){
  'use strict';
  function audit(input){
    if(input?.coordinate_system!=='WGS84')throw Error('检测文件必须声明 coordinate_system: WGS84');
    const threshold=input.threshold_m;if(!Number.isFinite(threshold)||threshold<=0||threshold>100)throw Error('请输入 0–100 m 内的正数容差');
    if(!Array.isArray(input.points)||!input.points.length||input.points.length>200)throw Error('需要 1–200 个实测点');
    const ids=new Set(),positions=new Set();
    const rows=input.points.map(p=>{
      if(!p.id||ids.has(p.id)||!R.isWgs84(p.map)||!R.isWgs84(p.measured))throw Error('点位 ID 重复或地图 / 实测坐标无效');ids.add(p.id);
      if(!['control','check'].includes(p.role)||!['rtk','survey','gnss'].includes(p.source)||typeof p.instrument!=='string'||!p.instrument.trim()||!Number.isFinite(p.accuracy_m)||p.accuracy_m<=0||!p.observed_at||!Number.isFinite(Date.parse(p.observed_at)))throw Error('每点需角色 control/check、测量来源 rtk/survey/gnss、仪器、正数精度与采集时间');
      const key=p.measured.join(',');if(positions.has(key))throw Error('重复实测位置不能作为多个独立点');positions.add(key);
      const ms=R.metreScale(p.measured[1]),east=(p.measured[0]-p.map[0])*ms.lng,north=(p.measured[1]-p.map[1])*ms.lat;
      if(Math.hypot(east,north)>1000)throw Error('地图与实测点相差超过 1 km，请检查点位对应或坐标系');
      return {...p,east_m:east,north_m:north,error_m:Math.hypot(east,north)};
    });
    const controls=rows.filter(p=>p.role==='control'),checks=rows.filter(p=>p.role==='check');
    const rms=a=>a.length?Math.sqrt(a.reduce((s,p)=>s+p.error_m**2,0)/a.length):null;
    const offset=controls.length?{east_m:controls.reduce((s,p)=>s+p.east_m,0)/controls.length,north_m:controls.reduce((s,p)=>s+p.north_m,0)/controls.length}:null;
    const candidate=offset?checks.map(p=>({...p,error_m:Math.hypot(p.east_m-offset.east_m,p.north_m-offset.north_m)})):[];
    const origin=checks[0]?.measured,ms=origin?R.metreScale(origin[1]):null,points=checks.map(p=>({x:(p.measured[0]-origin[0])*ms.lng,y:(p.measured[1]-origin[1])*ms.lat}));
    const hull=R.convexHull(points),area=hull.length>2?Math.abs(hull.reduce((s,p,i)=>{const q=hull[(i+1)%hull.length];return s+p.x*q.y-p.y*q.x;},0))/2:0;
    const enough=checks.length>=3&&area>=10,accurate=checks.length>0&&checks.every(p=>p.accuracy_m<=threshold/3),within=checks.length>0&&checks.every(p=>p.error_m<=threshold);
    return {format:'golf-field-audit/1',coordinate_system:'WGS84',scope:'submitted_checkpoints_only',field_verified:false,threshold_m:threshold,status:!enough?'insufficient_independent_coverage':!accurate?'reference_accuracy_insufficient':within?'submitted_checks_within_tolerance':'submitted_checks_exceed_tolerance',independent_count:checks.length,control_count:controls.length,coverage_area_m2:area,rms_m:rms(checks),max_m:checks.length?Math.max(...checks.map(p=>p.error_m)):null,suggested_translation:offset,candidate_translation_check_rms_m:rms(candidate),rows,warning:'仅检测提交点；仪器精度由用户声明，未验证。建议偏移未应用，不代表全洞 / 全场达到实测精度。'};
  }
  return {audit};
});
