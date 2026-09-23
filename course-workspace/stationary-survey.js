/* Static point estimation, never a moving-cart filter or field-accuracy certificate. */
(function(root,factory){const api=factory(typeof module==='object'?require('../holemap-gps/point-workspace.js'):root.HolePointWorkspace,typeof module==='object'?require('./gnss-quality.js'):root.CourseGNSS);if(typeof module==='object')module.exports=api;else root.CourseStationarySurvey=api;})(typeof globalThis==='undefined'?this:globalThis,function(P,G){
  'use strict';
  const median=a=>{const s=a.slice().sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
  const percentile=(a,q)=>a.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(q*a.length)-1)];
  function analyse(input){
    if(input?.coordinate_system!=='WGS84'||input.stationary_confirmed!==true)throw Error('需声明 WGS84，并确认整个采样期间设备静止');
    if(!Array.isArray(input.samples)||input.samples.length<1||input.samples.length>2000)throw Error('需要 1–2000 条原始定位记录');
    const maxAccuracy=input.max_accuracy_m??2;if(!Number.isFinite(maxAccuracy)||maxAccuracy<=0||maxAccuracy>100)throw Error('精度门槛需在 0–100 m 内');
    const valid=[],rejected=[];let previous=null,identity=null;
    input.samples.forEach((s,index)=>{
      const time=Date.parse(s?.updated_at);if(!Number.isFinite(time)||!['browser_geolocation','external_gnss'].includes(s?.source)){rejected.push({index,reason:'invalid_time_or_source'});return;}
      const q=G.evaluate(s,previous,{now:time,maxAccuracy,requireFixed:s.source==='external_gnss'});
      if(!q.accepted){rejected.push({index,reason:q.code});return;}
      const who=JSON.stringify([s.id,s.source,s.receiver||null]);if(identity&&identity!==who)throw Error('一次静止采点只能使用同一设备和来源');identity=who;
      if(previous&&time-Date.parse(previous.updated_at)<1000){rejected.push({index,reason:'interval_under_1s'});return;}
      valid.push({sample:s,index});previous=s;
    });
    if(!valid.length)throw Error('没有通过门槛的采样；不会用低质量点冒充高精度');
    const base=valid[0].sample.coordinate,latScale=111132,lngScale=111320*Math.cos(base[1]*Math.PI/180);
    if(Math.abs(base[1])>85)throw Error('静止采点暂不支持极区');
    const xy=s=>[(s.coordinate[0]-base[0])*lngScale,(s.coordinate[1]-base[1])*latScale],points=valid.map(v=>xy(v.sample));
    if(points.some(p=>Math.hypot(...p)>1000))throw Error('记录范围超过 1 km，不是同一静止点');
    const centre=[median(points.map(p=>p[0])),median(points.map(p=>p[1]))],radii=points.map(p=>Math.hypot(p[0]-centre[0],p[1]-centre[1])),rm=median(radii),mad=median(radii.map(r=>Math.abs(r-rm))),cutoff=Math.max(.5,2*median(valid.map(v=>v.sample.accuracy_m)),rm+3*1.4826*mad);
    const kept=valid.filter((v,i)=>{if(radii[i]<=cutoff)return true;rejected.push({index:v.index,reason:'spatial_outlier'});return false;});
    const chosen=kept.map(v=>xy(v.sample)),average=[chosen.reduce((s,p)=>s+p[0],0)/chosen.length,chosen.reduce((s,p)=>s+p[1],0)/chosen.length];
    const coordinate=[base[0]+average[0]/lngScale,base[1]+average[1]/latScale];
    const spread=chosen.map(p=>Math.hypot(p[0]-average[0],p[1]-average[1])),third=Math.max(1,Math.floor(points.length/3)),group=a=>[median(a.map(p=>p[0])),median(a.map(p=>p[1]))],start=group(points.slice(0,third)),end=group(points.slice(-third)),drift=Math.hypot(end[0]-start[0],end[1]-start[1]);
    const duration=(Date.parse(kept.at(-1).sample.updated_at)-Date.parse(kept[0].sample.updated_at))/1000;
    const declared=median(kept.map(v=>v.sample.accuracy_m)),unstable=drift>Math.max(2,declared*2),enough=kept.length>=30&&duration>=30;
    let reference=null;
    if(input.reference){const r=input.reference;
      if(!P.coordinate(r.coordinate)||!r.coordinate.every(Number.isFinite)||r.independent!==true||!['rtk','survey'].includes(r.source)||typeof r.instrument!=='string'||!r.instrument.trim()||!Number.isFinite(r.accuracy_m)||r.accuracy_m<=0||!Number.isFinite(Date.parse(r.observed_at)))throw Error('参考点需独立 RTK/测绘坐标、仪器、采集时间与精度声明');
      const errors=valid.map(v=>P.distanceMeters(v.sample.coordinate,r.coordinate));
      reference={...structuredClone(r),raw_rms_m:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length),raw_p95_m:percentile(errors,.95),estimate_difference_m:P.distanceMeters(coordinate,r.coordinate),scope:'one_submitted_reference_only'};
    }
    return {format:'golf-stationary-report/1',coordinate_system:'WGS84',field_verified:false,status:unstable?'movement_or_drift':enough?'candidate_ready':'insufficient_samples',coordinate,accuracy_m:null,raw_count:input.samples.length,quality_count:valid.length,used_count:kept.length,duration_s:duration,scatter_p95_m:percentile(spread,.95),drift_m:drift,device_accuracy_median_m:declared,rejected,reference,warning:'离散度不是实地误差；重复采样不能消除共同偏差。候选点不用于移动球车，也不自动替换 Tee/果岭。'};
  }
  function parse(text){if(typeof text!=='string'||text.length>2e6)throw Error('采样记录需小于 2 MB');const input=JSON.parse(text);return {input,report:analyse(input)};}
  return Object.freeze({analyse,parse});
});
