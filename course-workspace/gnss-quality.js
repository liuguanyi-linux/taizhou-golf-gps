/* Quality gates retain raw coordinates. They do not improve receiver accuracy. */
(function(root,factory){
  const api=factory(typeof module==='object'?require('../holemap-gps/point-workspace.js'):root.HolePointWorkspace);
  if(typeof module==='object')module.exports=api;else root.CourseGNSS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  const defaults=Object.freeze({maxAccuracy:2,maxAge:10000,maxSpeed:20,maxCorrectionAge:10,requireFixed:false});
  const labels={invalid:'坐标 / 时间 / 精度信息无效',stale:'定位已过期',future:'采集时间超前',order:'重复或倒序定位',accuracy:'声明精度未达门槛',confidence:'未声明 95% 水平误差半径',fix:'不是 RTK 固定解',correction:'差分龄期未知或过大',jump:'位置跳变超出球车速度门槛',accepted:'通过输入质量检查（非实地认证）'};
  function evaluate(sample,previous,options={}){
    const o={...defaults,...options},now=o.now??Date.now();
    if(!Number.isFinite(now)||![o.maxAccuracy,o.maxAge,o.maxSpeed,o.maxCorrectionAge].every(n=>Number.isFinite(n)&&n>0))throw Error('定位门槛必须为正数');
    const result=code=>({accepted:code==='accepted',code,message:labels[code],field_verified:false});
    if(!sample||!P.coordinate(sample.coordinate)||!Array.isArray(sample.coordinate)||!sample.coordinate.every(n=>typeof n==='number'&&Number.isFinite(n))||!Number.isFinite(sample.accuracy_m)||sample.accuracy_m<=0||typeof sample.updated_at!=='string'||!P.normalizePoint({...sample,kind:'cart'}).point)return result('invalid');
    const time=Date.parse(sample.updated_at);if(!Number.isFinite(time))return result('invalid');
    if(time>now+2000)return result('future');if(now-time>o.maxAge)return result('stale');
    if(previous&&sample.id===previous.id&&time<=Date.parse(previous.updated_at))return result('order');
    if(sample.accuracy_confidence!==0.95)return result('confidence');
    if(sample.accuracy_m>o.maxAccuracy)return result('accuracy');
    if(o.requireFixed&&sample.fix_type!=='rtk_fixed')return result('fix');
    if(o.requireFixed&&(!Number.isFinite(sample.correction_age_s)||sample.correction_age_s<0||sample.correction_age_s>o.maxCorrectionAge))return result('correction');
    if(previous&&sample.id===previous.id&&P.coordinate(previous.coordinate)&&Number.isFinite(previous.accuracy_m)){
      const dt=(time-Date.parse(previous.updated_at))/1000;
      if(dt>0&&dt<=o.maxAge/1000&&P.distanceMeters(previous.coordinate,sample.coordinate)>o.maxSpeed*dt+sample.accuracy_m+previous.accuracy_m)return result('jump');
    }
    return result('accepted');
  }
  function browserSample(position){return {id:'live',kind:'cart',source:'browser_geolocation',coordinate:[position.coords.longitude,position.coords.latitude],accuracy_m:position.coords.accuracy,accuracy_confidence:0.95,fix_type:'unknown',updated_at:Number.isFinite(position.timestamp)?new Date(position.timestamp).toISOString():null};}
  function snapshot(text,previous=[],options={}){
    if(typeof text!=='string'||text.length>1e6)throw Error('RTK 快照应小于 1 MB');
    const input=JSON.parse(text);
    if(input.coordinate_system!=='WGS84'||!Array.isArray(input.positions)||!input.positions.length||input.positions.length>200)throw Error('需要 WGS84 和 1–200 个 positions');
    const seen=new Set(),now=options.now??Date.now();
    return input.positions.map(p=>{
      if(!p||typeof p.id!=='string'||!p.id.trim()||seen.has(p.id))throw Error('设备 ID 必须为不重复的非空字符串');seen.add(p.id);
      if(!p.receiver||typeof p.receiver!=='string'||!p.receiver.trim())throw Error('每点需 receiver 仪器名称');
      const sample={id:p.id,name:typeof p.name==='string'?p.name:p.id,kind:'cart',source:'external_gnss',coordinate:p.coordinate,updated_at:p.updated_at,accuracy_m:p.accuracy_m,accuracy_confidence:p.accuracy_confidence,fix_type:p.fix_type,correction_age_s:p.correction_age_s,receiver:p.receiver};
      return {sample,quality:evaluate(sample,previous.find(x=>x.id===sample.id),{...options,now,requireFixed:true})};
    });
  }
  function describe(p,now=Date.now()){
    if(!p||!['browser_geolocation','external_gnss'].includes(p.source))return '';
    const age=now-Date.parse(p.updated_at),fresh=Number.isFinite(age)&&age>=-2000&&age<=defaults.maxAge;
    return `${p.source==='external_gnss'?'导入快照（非持续定位） · ':''}${p.fix_type==='rtk_fixed'?'RTK 固定解（设备声明）':'设备定位'} · ${fresh?'最近采集':'历史 / 过期位置'} · 水平误差半径 ${p.accuracy_m??'未知'} m${p.accuracy_confidence===0.95?'（95% 设备声明）':''} · 目标点与底图误差另计`;
  }
  function measurement(from,to,now=Date.now()){
    if(!from||!to)return '';
    const endpoint=(p,label)=>{
      const declared=Number.isFinite(p.accuracy_m)&&p.accuracy_m>0;
      return label+'：'+(declared?'声明水平误差 '+p.accuracy_m+' m'+(p.accuracy_confidence===0.95?'（95%）':'（置信度未知）'):'点位精度未知');
    };
    return [endpoint(from,'起点'),endpoint(to,'终点'),'距离为坐标计算值，测距精度未实测',describe(from,now),describe(to,now)].filter(Boolean).join('；');
  }
  return Object.freeze({defaults,evaluate,browserSample,snapshot,describe,measurement});
});
