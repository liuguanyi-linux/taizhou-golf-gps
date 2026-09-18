/* A cancellable GPS session. Late device callbacks must never revive a stopped watch. */
(function(root,factory){
  const api=factory(typeof module==='object'?require('./gnss-quality.js'):root.CourseGNSS);
  if(typeof module==='object')module.exports=api;else root.CourseGNSSSession=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(G){
  'use strict';
  function create({geolocation,policy=()=>({}),now=()=>Date.now(),onChange=()=>{}}={}){
    let epoch=0,watchId=null,last=null,state={active:false,phase:'idle',sample:null,message:'未启用设备定位。'};
    const emit=patch=>{state={...state,...patch};onChange(structuredClone(state));};
    const options=()=>({...policy(),now:now()});
    function cancel(){++epoch;if(watchId!==null){try{geolocation?.clearWatch(watchId);}catch{}watchId=null;}}
    function stop(){cancel();last=null;emit({active:false,phase:'stopped',sample:null,message:'定位已停止；请选择静态点或重新定位。'});}
    function reject(message){emit({sample:null,phase:'rejected',message:message+'；当前 GPS 不可用。'});}
    function start(){
      if(state.active)return;
      cancel();last=null;const token=epoch;
      try{
        G.evaluate(null,null,options());
        if(!geolocation?.watchPosition)throw Error('此浏览器不支持定位');
        emit({active:true,phase:'waiting',sample:null,message:'等待符合精度门槛的新位置…'});
        const id=geolocation.watchPosition(position=>{
          if(token!==epoch||!state.active)return;
          try{const sample=G.browserSample(position),result=G.evaluate(sample,last,options());if(!result.accepted){reject(result.message);return;}last=sample;emit({sample,phase:'tracking',message:G.describe(sample,now())});}catch(e){reject(e.message);}
        },error=>{
          if(token!==epoch||!state.active)return;
          if(error.code===1){cancel();emit({active:false,phase:'denied',sample:null,message:'定位权限被拒绝；请在浏览器允许后重新定位。'});}
          else reject('定位失败：'+(error.message||'未知错误'));
        },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
        // Some adapters can invoke a callback synchronously, including a denial.
        if(token!==epoch||!state.active)geolocation.clearWatch(id);else watchId=id;
      }catch(e){cancel();emit({active:false,phase:'error',sample:null,message:'无法启动定位：'+e.message});}
    }
    function tick(){if(!state.active||!state.sample)return;try{const q=G.evaluate(state.sample,null,options());if(!q.accepted)reject(q.message);}catch(e){reject(e.message);}}
    return Object.freeze({start,stop,tick,getState:()=>structuredClone(state)});
  }
  return Object.freeze({create});
});
