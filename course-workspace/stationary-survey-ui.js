(function(root){'use strict';
root.createStationarySurveyUI=function(host,api){
  const section=document.createElement('details');section.innerHTML=`<summary>静止采点 / 实地偏差检查</summary><p>设备放稳后采集 60 秒，至少需要 30 个相隔 1 秒的合格样本。不用于行驶中的球车，不自动修改 Tee 或果岭。</p><label><input type="checkbox" id="survey-still">我确认设备静止，并保持不动</label><div class="row"><button id="survey-start">开始静止采点</button><button id="survey-stop" disabled>结束采点</button></div><p id="survey-status" role="status">等待采集；原始坐标仅保存在当前页面内存，刷新前请导出。</p><pre id="survey-result" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><button id="survey-save" disabled>保存为候选参考点</button><button id="survey-export" disabled>导出原始记录与报告</button><details><summary>分析已有定位记录 JSON</summary><textarea id="survey-input" aria-label="静止定位记录 JSON"></textarea><button id="survey-analyse">分析记录（不改地图）</button><p>可附独立 RTK / 测绘参考点来计算偏差。<a href="../docs/STATIONARY-SURVEY.md" target="_blank" rel="noopener">格式与操作说明</a></p></details>`;host.append(section);
  const $=id=>section.querySelector('#'+id),S=root.CourseStationarySurvey;
  let active=false,started=0,input=null,report=null,owner=null,url=null;
  function show(message){$('survey-status').textContent=message;}
  function render(){
    $('survey-save').disabled=active||report?.status!=='candidate_ready';$('survey-export').disabled=!input?.samples?.length;
    $('survey-result').textContent=report?`使用 ${report.used_count}/${report.raw_count} 点 · ${report.duration_s.toFixed(0)} 秒\n采样离散度 P95：${report.scatter_p95_m.toFixed(2)} m（不是实地误差）\n前后段漂移：${report.drift_m.toFixed(2)} m\n设备声明中位数：${report.device_accuracy_median_m.toFixed(2)} m\n${report.status==='candidate_ready'?'候选点可保存，实地精度未知':report.status==='movement_or_drift'?'疑似移动或漂移，请重新采集':'样本或时长不足，不能保存'}\n${report.reference?`相对所提交参考点的偏差：${report.reference.estimate_difference_m.toFixed(2)} m；原始 RMS：${report.reference.raw_rms_m.toFixed(2)} m\n参考点本身误差另计`:'未提供独立实测点，无法给出实地误差'}`:'';
  }
  function finish(message='采集结束'){active=false;$('survey-stop').disabled=true;$('survey-start').disabled=false;try{report=S.analyse(input);show(message+'。'+report.warning);}catch(e){report=null;show(message+'：'+e.message);}render();}
  $('survey-start').onclick=()=>{if(!$('survey-still').checked){show('请先确认设备静止；移动状态不能进行定点平均。');return;}try{const options=api.policy();owner=api.owner();input={format:'golf-stationary-log/1',coordinate_system:'WGS84',stationary_confirmed:true,max_accuracy_m:options.maxAccuracy,samples:[]};report=null;active=true;started=Date.now();$('survey-start').disabled=true;$('survey-stop').disabled=false;show('正在采集，保持设备不动；只有通过定位门槛的新点计入。');render();api.start();}catch(e){finish('无法开始：'+e.message);}};
  $('survey-stop').onclick=()=>finish('已手动结束采集');
  $('survey-analyse').onclick=()=>{if(active){show('先结束采集，再分析文件。');return;}try{report=null;input=null;owner=null;const parsed=S.parse($('survey-input').value);input=parsed.input;report=parsed.report;owner=api.owner();show('已分析历史记录，未修改地图。');}catch(e){show('分析失败：'+e.message);}render();};
  $('survey-save').onclick=()=>{if(!report||report.status!=='candidate_ready'||active)return;if(owner!==api.owner()){show('球洞已切换；请回到采集/分析时的球洞保存，避免写错洞。');return;}try{api.save(report);$('survey-save').disabled=true;show('已新增候选参考点，精度未知；没有覆盖 Tee 或果岭。');}catch(e){show('保存失败：'+e.message);}};
  $('survey-export').onclick=()=>{if(!input)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob([JSON.stringify({...input,report},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='stationary-survey.json';a.click();};
  function observe(state){if(!active)return;if(owner!==api.owner()){finish('球洞切换，已停止采集');return;}if(state.phase==='tracking'&&state.sample){const s=state.sample,last=input.samples.at(-1);if(!last||Date.parse(s.updated_at)>Date.parse(last.updated_at))input.samples.push(structuredClone(s));show('已接收 '+input.samples.length+' 个合格样本；继续保持静止。');if(input.samples.length>=2000)finish('达到采样上限');}else if(['denied','error','stopped'].includes(state.phase)){finish(state.message);}else if(state.message)show(state.message+' 采集尚未计入新样本。');}
  function tick(){if(active&&(owner!==api.owner()||Date.now()-started>=60000))finish(owner!==api.owner()?'球洞切换，采集结束':'60 秒采集结束');}
  window.addEventListener('pagehide',()=>{active=false;if(url)URL.revokeObjectURL(url);});
  return {observe,tick};
};
})(window);
